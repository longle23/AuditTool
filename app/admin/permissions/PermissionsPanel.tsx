'use client';

import { useState, useTransition } from 'react';
import {
  Activity,
  Check,
  Combine,
  Crown,
  Link2,
  Loader2,
  Scale,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { ASSIGNABLE_PERMISSIONS, PERMISSIONS, SUPER_ADMIN_USERNAME } from '@/lib/permissions';
import { saveRole, saveUser } from './actions';

type UserRow = {
  Id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  locked: boolean;
};

type RoleRow = {
  Id: number;
  name: string;
  description: string;
  permissions: string[];
};

const PERM_META: Record<string, { icon: typeof Combine; tone: string }> = {
  'tools.monthly-merge': { icon: Combine, tone: 'text-brand-600 bg-brand-50' },
  'tools.checking-payout': { icon: Scale, tone: 'text-accent-600 bg-accent-50' },
  'share.create': { icon: Link2, tone: 'text-sky-600 bg-sky-50' },
  'admin.activity': { icon: Activity, tone: 'text-amber-600 bg-amber-50' },
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function Switch({ name, defaultChecked, disabled }: { name: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex h-6 w-11 shrink-0 items-center ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-linear-to-r peer-checked:from-brand-600 peer-checked:to-accent-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20" />
      <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
    </label>
  );
}

function RoleCard({ role }: { role: RoleRow }) {
  const [all, setAll] = useState(role.permissions.includes('*'));
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(() => saveRole(fd))}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-brand-900/[0.03] transition hover:border-brand-200 hover:shadow-md hover:shadow-brand-900/[0.05]"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-500 to-accent-500 opacity-80" />
      <input type="hidden" name="id" value={role.Id} />

      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-accent-500 text-white shadow-sm shadow-accent-500/25">
              <Shield className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{role.name}</p>
              <p className="truncate text-xs text-slate-500">{role.description || 'Không có mô tả'}</p>
            </div>
          </div>
        </div>
        <Button type="submit" size="sm" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Lưu
        </Button>
      </div>

      <div className="space-y-3 p-5">
        <label
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition ${
            all ? 'border-brand-300 bg-brand-50/70 ring-1 ring-brand-200/60' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${all ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">Toàn quyền</p>
              <p className="text-[11px] text-slate-500">Wildcard (*) — bỏ qua mọi quyền bên dưới</p>
            </div>
          </div>
          <input
            type="checkbox"
            name="all"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
            className="peer sr-only"
          />
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              all ? 'bg-linear-to-r from-brand-600 to-accent-500' : 'bg-slate-200'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${all ? 'translate-x-5' : ''}`} />
          </span>
        </label>

        <div className={`grid gap-2 ${all ? 'pointer-events-none opacity-40' : ''}`}>
          {ASSIGNABLE_PERMISSIONS.map((key) => {
            const meta = PERM_META[key] ?? { icon: Shield, tone: 'text-slate-600 bg-slate-100' };
            const Icon = meta.icon;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition has-checked:border-brand-300 has-checked:bg-brand-50/50 has-checked:ring-1 has-checked:ring-brand-200/50 hover:border-slate-300"
              >
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={!role.permissions.includes('*') && role.permissions.includes(key)}
                  disabled={all}
                  className="peer sr-only"
                />
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{PERMISSIONS[key]}</span>
                  <span className="block truncate font-mono text-[10px] text-slate-400">{key}</span>
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-transparent peer-checked:border-brand-500 peer-checked:bg-brand-600 peer-checked:text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </form>
  );
}

function UserRowForm({ user, roleNames }: { user: UserRow; roleNames: string[] }) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(() => saveUser(fd))}
      className="grid grid-cols-1 items-center gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:gap-5"
    >
      <input type="hidden" name="id" value={user.Id} />
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-100 to-slate-200 text-xs font-bold tracking-wide text-slate-600 ring-2 ring-white">
          {initials(user.username)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
          <p className="truncate text-xs text-slate-500">{user.display_name || 'Chưa có tên hiển thị'}</p>
        </div>
      </div>

      <select
        name="role"
        defaultValue={user.role}
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-800 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
      >
        {roleNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <Switch name="is_active" defaultChecked={user.is_active} />
        <span className="text-xs text-slate-500 sm:hidden">Active</span>
      </div>

      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="justify-self-start sm:justify-self-end">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Lưu
      </Button>
    </form>
  );
}

export function PermissionsPanel({
  users,
  roles,
  roleNames,
  okMessage,
}: {
  users: UserRow[];
  roles: RoleRow[];
  roleNames: string[];
  okMessage?: string;
}) {
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-brand-900/[0.03] sm:p-6">
        <div className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-accent-100/60 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-accent-500/30">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Phân quyền</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Chỉ <span className="font-medium text-slate-700">{SUPER_ADMIN_USERNAME}</span> quản trị trang này.
                Đổi quyền có hiệu lực khi user đăng nhập lại.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Tài khoản', value: users.length, icon: Users },
              { label: 'Đang active', value: activeCount, icon: UserRound },
              { label: 'Role', value: roles.length, icon: Shield },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex min-w-[7.5rem] items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200/80">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="text-base font-bold tabular-nums text-slate-900">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {okMessage && (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
          {okMessage}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-brand-900/[0.03]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tài khoản</h2>
            <p className="text-xs text-slate-500">Gán role và bật/tắt đăng nhập</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            {users.length} user
          </span>
        </header>

        <div className="hidden border-b border-slate-100 bg-slate-50/80 px-5 py-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:gap-5">
          <span>Người dùng</span>
          <span>Role</span>
          <span className="w-11 text-center">Active</span>
          <span className="w-16 text-right"> </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {users.map((user) =>
            user.locked ? (
              <li
                key={user.Id}
                className="grid grid-cols-1 items-center gap-4 bg-linear-to-r from-brand-50/40 to-transparent px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:gap-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-500 to-accent-500 text-xs font-bold tracking-wide text-white shadow-sm shadow-accent-500/30">
                    {initials(user.username)}
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-white">
                      <Crown className="h-2.5 w-2.5" aria-hidden />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
                        Admin chính
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{user.display_name || 'Chưa có tên hiển thị'}</p>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {user.role}
                </span>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-right text-[11px] text-slate-400 sm:w-16">Bảo vệ</span>
              </li>
            ) : (
              <li key={user.Id} className="hover:bg-slate-50/60">
                <UserRowForm user={user} roleNames={roleNames} />
              </li>
            ),
          )}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Role & quyền</h2>
            <p className="text-xs text-slate-500">
              Chọn toàn quyền hoặc từng quyền. Trang Phân quyền không gán qua role.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <RoleCard key={role.Id} role={role} />
          ))}
        </div>
      </section>
    </div>
  );
}
