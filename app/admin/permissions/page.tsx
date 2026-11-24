import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Card } from '@/app/components/ui/Card';
import { isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
import { SUPER_ADMIN_USERNAME, canAccess } from '@/lib/permissions';
import { loadPermissionsData } from './actions';
import { PermissionsPanel } from './PermissionsPanel';

export const metadata: Metadata = { title: 'Phân quyền' };

const OK_MSG: Record<string, string> = {
  user: 'Đã cập nhật tài khoản. Quyền mới có hiệu lực ở lần đăng nhập sau.',
  role: 'Đã cập nhật quyền role. User thuộc role cần đăng nhập lại để nhận quyền mới.',
  protected: `Không thể đổi role hoặc khoá tài khoản ${SUPER_ADMIN_USERNAME}.`,
};

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await readSession((await headers()).get(SESSION_HEADER) ?? undefined);
  if (!session || isExpired(session) || !canAccess(session, 'admin.permissions')) notFound();

  const ok = (await searchParams).ok;
  let data;
  try {
    data = await loadPermissionsData();
  } catch (error) {
    console.error('Trang phân quyền: không đọc được NocoDB:', error);
  }

  if (!data) {
    return (
      <Card>
        <p className="text-sm text-red-600">Không kết nối được cơ sở dữ liệu, vui lòng tải lại trang sau.</p>
      </Card>
    );
  }

  return (
    <PermissionsPanel
      users={data.users}
      roles={data.roles}
      roleNames={data.roleNames}
      okMessage={ok ? OK_MSG[ok] : undefined}
    />
  );
}
