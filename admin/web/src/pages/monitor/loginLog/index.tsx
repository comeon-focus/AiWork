import { useCallback, useEffect, useState } from 'react';
import { Button, Card, DatePicker, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { logApi } from '@/api';
import type { LoginLogItem } from '@/api/types';
import { Auth } from '@/components/Auth';

const { RangePicker } = DatePicker;

export default function LoginLogPage() {
  const [rows, setRows] = useState<LoginLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<number>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const load = useCallback(
    async (p = page, size = pageSize) => {
      setLoading(true);
      try {
        const res = await logApi.loginLogs({
          page: p,
          pageSize: size,
          username: username || undefined,
          status,
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
    [page, pageSize, username, status, range],
  );

  useEffect(() => {
    void load(1, 10);
    // 仅首次加载，后续由查询按钮驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = async () => {
    await logApi.clearLoginLogs();
    message.success('已清空');
    void load(1, pageSize);
  };

  return (
    <>
      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="账号"
            allowClear
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: 160 }}
          />
          <Select
            placeholder="结果"
            allowClear
            style={{ width: 120 }}
            value={status}
            onChange={setStatus}
            options={[
              { label: '成功', value: 1 },
              { label: '失败', value: 0 },
            ]}
          />
          <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(1, pageSize)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setUsername('');
              setStatus(undefined);
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
        title="登录日志"
        extra={
          <Auth perms="monitor:loginlog:remove">
            <Popconfirm title="确认清空全部登录日志？" onConfirm={clear}>
              <Button danger icon={<DeleteOutlined />}>
                清空
              </Button>
            </Popconfirm>
          </Auth>
        }
      >
        <Table<LoginLogItem>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => load(p, s),
          }}
          columns={[
            { title: '账号', dataIndex: 'username', width: 140 },
            { title: 'IP', dataIndex: 'ip', width: 140, render: (v) => v || '-' },
            { title: '浏览器', dataIndex: 'browser', width: 160, render: (v) => v || '-' },
            { title: '系统', dataIndex: 'os', width: 130, render: (v) => v || '-' },
            {
              title: '结果',
              dataIndex: 'status',
              width: 90,
              render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '成功' : '失败'}</Tag>,
            },
            { title: '描述', dataIndex: 'msg', render: (v) => v || '-' },
            { title: '登录时间', dataIndex: 'loginAt', width: 180 },
          ]}
        />
      </Card>
    </>
  );
}
