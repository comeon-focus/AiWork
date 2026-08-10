import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, Drawer, Space, Tag } from 'antd';
import { aiCompileLogApi } from '@/api';
import type { AiCompileLogItem, AiCompileLogTail } from '@/api/types';
import { AI_COMPILE_STATUS_COLOR } from '@/api/types';
import { SessionIdTag } from '@/components/SessionIdTag';

/** 编译中时的日志轮询间隔，与后端 1s 刷盘配合，最坏可见延迟约 2.5s */
export const TAIL_INTERVAL = 1500;

export function fmtDuration(ms: number | null) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

/** git 实测改动：0 改动高亮成红色，这是「假成功」最直接的信号 */
export function ChangedFilesTag({ n }: { n: number | null }) {
  if (n == null) return <span style={{ color: '#999' }}>未校验</span>;
  return <Tag color={n > 0 ? 'green' : 'red'}>{n} 个文件</Tag>;
}

/**
 * 实时日志抽屉：增量拉取，编译结束后自动停止轮询。
 * 编译详情页与任务队列详情共用，改动需同时兼顾两处调用方。
 */
export function CompileLogDrawer({
  record,
  open,
  onClose,
}: {
  record: AiCompileLogItem;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [tail, setTail] = useState<AiCompileLogTail | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLPreElement>(null);
  const offsetRef = useRef(0);
  // 用 ref 保存定时器，卸载/结束时能确定性地停掉，避免抽屉关闭后仍在打接口
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    aliveRef.current = true;
    offsetRef.current = 0;
    setText('');
    setTail(null);

    // 递归 setTimeout 而非 setInterval：保证上一次请求返回后才发下一次，慢网络下不会堆积
    const poll = async () => {
      if (!aliveRef.current) return;
      try {
        const r = await aiCompileLogApi.tail(record.id, offsetRef.current);
        if (!aliveRef.current) return;
        // reset 表示服务端认为 offset 已失效（记录被替换），必须整体重来
        if (r.reset) {
          setText(r.chunk);
        } else if (r.chunk) {
          setText((prev) => prev + r.chunk);
        }
        offsetRef.current = r.nextOffset;
        setTail(r);
        // 还有积压就立刻续拉，把大段日志一次性追平
        if (r.hasMore) {
          timerRef.current = setTimeout(() => void poll(), 0);
          return;
        }
        if (!r.running) return;
      } catch {
        // 单次失败不终止轮询（错误已由 request.ts 统一提示），下个周期重试
      }
      if (aliveRef.current) timerRef.current = setTimeout(() => void poll(), TAIL_INTERVAL);
    };
    void poll();

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, record.id]);

  // 贴底：仅在用户没有主动上滚时才自动跟随
  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [text, autoScroll]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const status = tail?.status ?? record.status;
  const changedFiles = tail?.changedFiles ?? record.changedFiles;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1000}
      title={
        <Space>
          <span>编译详情 · {record.title}</span>
          <Tag color={AI_COMPILE_STATUS_COLOR[status]}>{status}</Tag>
        </Space>
      }
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12, height: '100%' } }}
    >
      {status === '编译失败' && (tail?.errorMsg ?? record.errorMsg) && (
        <Alert type="error" showIcon message="失败原因" description={tail?.errorMsg ?? record.errorMsg} />
      )}
      {status === '编译成功' && changedFiles === 0 && (
        <Alert
          type="warning"
          showIcon
          message="本次运行未产生任何代码改动"
          description="codebuddy 返回成功但 git 检测到零改动，请核对智能文档内容是否明确要求了代码修改。"
        />
      )}
      {tail?.truncated && <Alert type="warning" showIcon message="日志超出上限已截断，后续输出未记录" />}

      <Descriptions size="small" column={4} bordered items={[
        { label: 'Session ID', children: <SessionIdTag value={record.sessionId} /> },
        { label: '类型', children: record.taskType },
        { label: '分支', children: record.branch || '-' },
        { label: '模型', children: record.model || '默认' },
        { label: '耗时', children: fmtDuration(tail?.durationMs ?? record.durationMs) },
        { label: '轮次', children: tail?.numTurns ?? record.numTurns ?? '-' },
        { label: 'Token', children: `${tail?.inputTokens ?? record.inputTokens} / ${tail?.outputTokens ?? record.outputTokens}` },
        { label: '工具调用', children: tail?.toolCalls ?? record.toolCalls },
        { label: '改动文件', children: <ChangedFilesTag n={changedFiles} /> },
        { label: '新增提交', children: tail?.commitsAhead ?? record.commitsAhead ?? '-' },
        { label: '日志行数', children: tail?.lineCount ?? record.lineCount },
        { label: '完成时间', children: tail?.finishedAt ?? record.finishedAt ?? '-' },
      ]} />

      {(tail?.changedDetail ?? null) && (
        <Card size="small" title="git 实测改动">
          <pre style={{ margin: 0, maxHeight: 160, overflow: 'auto', fontSize: 12 }}>{tail?.changedDetail}</pre>
        </Card>
      )}

      <div style={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <b>实时日志{tail?.running ? '（编译中，每 1.5 秒刷新）' : ''}</b>
          {!autoScroll && (
            <Button size="small" onClick={() => setAutoScroll(true)}>
              回到底部
            </Button>
          )}
        </div>
        <pre ref={boxRef} className="compile-log" onScroll={onScroll}>
          {text}
        </pre>
      </div>
    </Drawer>
  );
}
