import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { logApi } from '@/api';
import type { OperLogItem } from '@/api/types';
import { Auth } from '@/components/Auth';

const { RangePicker } = DatePicker;

const TYPE_COLOR: Record<string, string> = {
  INSERT: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  GRANT: 'purple',
  EXPORT: 'cyan',
  OTHER: 'default',
};

function pretty(json: string | null) {
  if (!json) return '-';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function OperLogPage() {
  const [rows, setRows] = useState<OperLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [operName, setOperName] = useState('');
  const [businessType, setBusinessType] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<OperLogItem | null>(null);

  const load = useCallback(
    async (p = 1, size = 10) => {
      setLoading(true);
      try {
        const res = await logApi.operLogs({
          page: p,
          pageSize: size,
          title: title || undefined,
          operName: operName || undefined,
          businessType,
          beginTime: range?.[0]?.startOf('day').toISOString(),
          endTime: range?.[1]?.endOf('day').toISOString(),
        });
        setRows(res.list);
        setTotal(res.total);
        setPage(res.page);
        setPageSize(res.pageSize);
      } finally {
        setLoading(false);
      }
    },
    [title, operName, businessType, range],
  );

  useEffect(() => {
    void load(1, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = async () => {
    await logApi.clearOperLogs();
    message.success('已清空');
    void load(1, pageSize);
  };

  return (
    <>
      <Card className="search-bar">
        <Space wrap>
          <Input placeholder="模块" allowClear value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 140 }} />
          <Input
            placeholder="操作人"
            allowClear
            value={operName}
            onChange={(e) => setOperName(e.target.value)}
            style={{ width: 140 }}
          />
          <Select
            placeholder="类型"
            allowClear
            style={{ width: 120 }}
            value={businessType}
            onChange={setBusinessType}
            options={Object.keys(TYPE_COLOR).map((k) => ({ label: k, value: k }))}
          />
          <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(1, pageSize)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setTitle('');
              setOperName('');
              setBusinessType(undefined);
              setRange(null);
              setTimeout(() => void load(1, pageSize), 0);
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card
        className="page-card"
        title="操作日志"
        extra={
          <Auth perms="monitor:operlog:remove">
            <Popconfirm title="确认清空全部操作日志？" onConfirm={clear}>
              <Button danger icon={<DeleteOutlined />}>
                清空
              </Button>
            </Popconfirm>
          </Auth>
        }
      >
        <Table<OperLogItem>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => load(p, s),
          }}
          columns={[
            { title: '模块', dataIndex: 'title', width: 120 },
            {
              title: '类型',
              dataIndex: 'businessType',
              width: 100,
              render: (v: string) => <Tag color={TYPE_COLOR[v] ?? 'default'}>{v}</Tag>,
            },
            { title: '操作人', dataIndex: 'operName', width: 120, render: (v) => v || '-' },
            { title: '部门', dataIndex: 'deptName', width: 110, render: (v) => v || '-' },
            { title: '请求', width: 260, render: (_, r) => `${r.requestMethod} ${r.operUrl}` },
            { title: 'IP', dataIndex: 'operIp', width: 130, render: (v) => v || '-' },
            {
              title: '结果',
              dataIndex: 'status',
              width: 90,
              render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '成功' : '失败'}</Tag>,
            },
            { title: '耗时', dataIndex: 'costTime', width: 90, render: (v: number) => `${v} ms` },
            { title: '时间', dataIndex: 'operAt', width: 180 },
            {
              title: '操作',
              width: 80,
              fixed: 'right',
              render: (_, record) => (
                <Button type="link" size="small" onClick={() => setDetail(record)}>
                  详情
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer open={!!detail} width={720} title="操作日志详情" onClose={() => setDetail(null)}>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="模块">{detail.title}</Descriptions.Item>
            <Descriptions.Item label="类型">{detail.businessType}</Descriptions.Item>
            <Descriptions.Item label="操作人">{`${detail.operName ?? '-'}（${detail.deptName ?? '-'}）`}</Descriptions.Item>
            <Descriptions.Item label="请求地址">{`${detail.requestMethod} ${detail.operUrl}`}</Descriptions.Item>
            <Descriptions.Item label="请求参数">
              <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto' }}>{pretty(detail.operParam)}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="返回结果">
              <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto' }}>{pretty(detail.jsonResult)}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="错误信息">{detail.errorMsg ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="耗时">{detail.costTime} ms</Descriptions.Item>
            <Descriptions.Item label="时间">{detail.operAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
