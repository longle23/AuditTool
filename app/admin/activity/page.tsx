import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/app/components/ui/Card';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { formatBytes } from '@/app/tools/monthly-merge/FileTable';
import { isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
import { countRows, listRows, parseJson, type Row } from '@/lib/nocodb';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Lịch sử sử dụng' };

const LIMIT = 50;
const STATS_DAYS = 7;

const ACTION_LABEL: Record<string, string> = {
  login: 'Đăng nhập',
  login_failed: 'Đăng nhập sai',
  logout: 'Đăng xuất',
  share_link: 'Tạo link chia sẻ',
};
const REASON_LABEL: Record<string, string> = {
  wrong_password: 'Sai mật khẩu',
  unknown_user: 'Không có tài khoản',
  inactive: 'Tài khoản bị khoá',
  invalid_username: 'Tên đăng nhập không hợp lệ',
};

const Empty = () => <span className="text-slate-400">—</span>;

/** NocoDB returns `2026-11-10 08:22:03.630+00:00`. */
function formatTime(value: unknown): string {
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' });
}

const formatNumber = (value: unknown) => (typeof value === 'number' ? value.toLocaleString('vi-VN') : <Empty />);

function Badge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'slate'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function authDetails(row: Row): string | null {
  const details = parseJson<{ reason?: string; minutes?: number } | null>(row.details, null);
  if (details?.reason) return REASON_LABEL[details.reason] ?? details.reason;
  if (details?.minutes) return `Hiệu lực ${details.minutes} phút`;
  return null;
}

const TH = 'py-2 pr-4 font-medium';
const TD = 'whitespace-nowrap py-2.5 pr-4';

function AuthTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <th className={`${TH} pl-5`}>Thời gian</th>
          <th className={TH}>Tài khoản</th>
          <th className={TH}>Role</th>
          <th className={TH}>Hành động</th>
          <th className={TH}>Chi tiết</th>
          <th className={TH}>IP</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const action = String(row.action);
          return (
            <tr key={String(row.Id)} className="hover:bg-slate-50/60">
              <td className={`${TD} pl-5 tabular-nums text-slate-500`}>{formatTime(row.CreatedAt)}</td>
              <td className={`${TD} font-medium text-slate-900`}>{row.username ? String(row.username) : <Empty />}</td>
              <td className={`${TD} text-slate-600`}>{row.role ? String(row.role) : <Empty />}</td>
              <td className={TD}>
                <Badge tone={action === 'login' ? 'green' : action === 'login_failed' ? 'red' : 'slate'}>
                  {ACTION_LABEL[action] ?? action}
                </Badge>
              </td>
              <td className={`${TD} text-slate-600`}>{authDetails(row) ?? <Empty />}</td>
              <td className={`${TD} tabular-nums text-slate-500`}>{row.ip ? String(row.ip) : <Empty />}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MergeTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <th className={`${TH} pl-5`}>Thời gian</th>
          <th className={TH}>Tài khoản</th>
          <th className={TH}>Kỳ</th>
          <th className={TH}>Trạng thái</th>
          <th className={`${TH} text-right`}>Số file</th>
          <th className={`${TH} text-right`}>Số dòng</th>
          <th className={`${TH} text-right`}>Dung lượng</th>
          <th className={TH}>Tổng kiểm soát</th>
          <th className={`${TH} text-right`}>Mã trùng</th>
          <th className={`${TH} text-right`}>Xử lý</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const ok = row.status === 'success';
          const files = parseJson<{ name?: string }[]>(row.files, []);
          return (
            <tr key={String(row.Id)} className="align-top hover:bg-slate-50/60">
              <td className={`${TD} pl-5 tabular-nums text-slate-500`}>{formatTime(row.CreatedAt)}</td>
              <td className={TD}>
                <p className="font-medium text-slate-900">{row.username ? String(row.username) : 'Khách (link chia sẻ)'}</p>
                <p className="text-xs text-slate-500">{row.role ? String(row.role) : ''}</p>
              </td>
              <td className={`${TD} tabular-nums text-slate-700`}>{row.period ? String(row.period) : <Empty />}</td>
              <td className={TD}>
                <Badge tone={ok ? 'green' : 'red'}>{ok ? 'Thành công' : 'Lỗi'}</Badge>
                {!ok && row.error ? (
                  <p className="mt-1 max-w-64 whitespace-normal text-xs text-red-600">{String(row.error)}</p>
                ) : null}
              </td>
              <td className={`${TD} text-right tabular-nums text-slate-700`} title={files.map((f) => f.name).join('\n')}>
                {formatNumber(row.file_count)}
              </td>
              <td className={`${TD} text-right tabular-nums text-slate-700`}>{formatNumber(row.total_rows)}</td>
              <td className={`${TD} text-right tabular-nums text-slate-700`}>
                {typeof row.size_bytes === 'number' ? formatBytes(row.size_bytes) : <Empty />}
              </td>
              <td className={TD}>
                {row.control_totals_ok === true ? (
                  <Badge tone="green">Khớp</Badge>
                ) : ok && row.control_totals_ok === false ? (
                  <Badge tone="red">Lệch</Badge>
                ) : (
                  <Empty />
                )}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {typeof row.duplicate_count === 'number' && row.duplicate_count > 0 ? (
                  <span className="font-medium text-amber-700">{row.duplicate_count.toLocaleString('vi-VN')}</span>
                ) : (
                  formatNumber(row.duplicate_count)
                )}
              </td>
              <td className={`${TD} text-right tabular-nums text-slate-500`}>
                {typeof row.duration_ms === 'number' ? `${(row.duration_ms / 1000).toFixed(1)} giây` : <Empty />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TableCard({ title, rows, children }: { title: string; rows: Row[]; children: React.ReactNode }) {
  return (
    <Card title={title} description={`${LIMIT} lượt gần nhất · xem đầy đủ trên NocoDB`} bodyClassName="overflow-x-auto">
      {rows.length ? children : <p className="px-5 py-6 text-sm text-slate-500">Chưa có dữ liệu.</p>}
    </Card>
  );
}

const TABS = [
  { id: 'merge', label: 'Lượt gộp file' },
  { id: 'auth', label: 'Lượt đăng nhập' },
] as const;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // The proxy already blocks this route; re-checked here because the page reads sensitive data.
  const session = await readSession((await headers()).get(SESSION_HEADER) ?? undefined);
  if (!session || isExpired(session) || !can(session.permissions, 'admin.activity')) notFound();

  const tab = (await searchParams).tab === 'auth' ? 'auth' : 'merge';
  const since = `(CreatedAt,gte,exactDate,${new Date(Date.now() - STATS_DAYS * 86_400_000).toISOString().slice(0, 10)})`;
  let data;
  try {
    const [total, failed, rows] = await Promise.all(
      tab === 'auth'
        ? [
            countRows('auth_logs', `${since}~and(action,eq,login)`),
            countRows('auth_logs', `${since}~and(action,eq,login_failed)`),
            listRows('auth_logs', { limit: LIMIT }),
          ]
        : [
            countRows('merge_logs', since),
            countRows('merge_logs', `${since}~and(status,eq,failed)`),
            listRows('merge_logs', { limit: LIMIT }),
          ],
    );
    data = { total, failed, rows };
  } catch (error) {
    console.error('Trang lịch sử: không đọc được NocoDB:', error);
  }

  const stats =
    tab === 'auth'
      ? [
          ['Lượt đăng nhập', data?.total],
          ['Đăng nhập sai', data?.failed],
        ]
      : [
          ['Lượt gộp file', data?.total],
          ['Gộp file lỗi', data?.failed],
        ];

  return (
    <>
      <PageHeader title="Lịch sử sử dụng" description="Lượt đăng nhập và lượt sử dụng các chức năng của mọi tài khoản." />
      <nav className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'merge' ? '/admin/activity' : `/admin/activity?tab=${t.id}`}
            aria-current={t.id === tab ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t.id === tab
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {!data ? (
        <Card>
          <p className="text-sm text-red-600">Không kết nối được cơ sở dữ liệu, vui lòng tải lại trang sau.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {stats.map(([label, value], i) => (
              <Card key={label as string}>
                <p className="text-xs text-slate-500">
                  {label} · {STATS_DAYS} ngày
                </p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${i === 1 && value ? 'text-red-600' : 'text-slate-900'}`}>
                  {(value as number).toLocaleString('vi-VN')}
                </p>
              </Card>
            ))}
          </div>
          {tab === 'auth' ? (
            <TableCard title="Lượt đăng nhập" rows={data.rows}>
              <AuthTable rows={data.rows} />
            </TableCard>
          ) : (
            <TableCard title="Lượt gộp file" rows={data.rows}>
              <MergeTable rows={data.rows} />
            </TableCard>
          )}
        </div>
      )}
    </>
  );
}
