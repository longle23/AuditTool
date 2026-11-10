/**
 * NocoDB admin CLI (Node >= 22.18 runs this .ts directly):
 *   npm run nocodb -- bases                         list bases → copy the id into NOCODB_BASE_ID
 *   npm run nocodb -- setup                         create missing tables + default roles
 *   npm run nocodb -- user <username> <role> [name] create a user or reset its password
 */
import { createInterface } from 'node:readline/promises';
import { baseId, findRow, insertRow, nocodb, updateRow } from '../lib/nocodb.ts';
import { hashPassword, USERNAME_PATTERN } from '../lib/password.ts';
import { GUEST_PERMISSIONS } from '../lib/permissions.ts';

type Uidt = 'ID' | 'SingleLineText' | 'LongText' | 'JSON' | 'Checkbox' | 'Number' | 'DateTime';
const col = (name: string, uidt: Uidt) => ({ column_name: name, title: name, uidt });
const id = { column_name: 'id', title: 'Id', uidt: 'ID', pk: true, ai: true };

/** Add a `<tool>_logs` table here for each new tool, then run `setup` again (existing tables are skipped). */
const TABLES: Record<string, object[]> = {
  roles: [id, col('name', 'SingleLineText'), col('description', 'LongText'), col('permissions', 'JSON')],
  users: [
    id,
    col('username', 'SingleLineText'),
    col('display_name', 'SingleLineText'),
    col('password_hash', 'LongText'),
    col('role', 'SingleLineText'),
    col('is_active', 'Checkbox'),
    col('last_login_at', 'DateTime'),
  ],
  auth_logs: [
    id,
    col('action', 'SingleLineText'),
    col('username', 'SingleLineText'),
    col('role', 'SingleLineText'),
    col('details', 'JSON'),
    col('ip', 'SingleLineText'),
    col('user_agent', 'LongText'),
  ],
  merge_logs: [
    id,
    col('status', 'SingleLineText'),
    col('username', 'SingleLineText'),
    col('role', 'SingleLineText'),
    col('period', 'SingleLineText'),
    col('output_name', 'LongText'),
    col('file_count', 'Number'),
    col('total_rows', 'Number'),
    col('size_bytes', 'Number'),
    col('duration_ms', 'Number'),
    col('control_totals_ok', 'Checkbox'),
    col('duplicate_count', 'Number'),
    col('files', 'JSON'),
    col('error', 'LongText'),
    col('ip', 'SingleLineText'),
    col('user_agent', 'LongText'),
  ],
};

const DEFAULT_ROLES = [
  { name: 'admin', description: 'Toàn quyền', permissions: ['*'] },
  { name: 'member', description: 'Dùng các công cụ, không tạo link chia sẻ', permissions: GUEST_PERMISSIONS },
];

type List<T> = { list: T[] };

async function listBases() {
  // NocoDB cloud only lists bases per workspace; self-hosted has no workspaces endpoint.
  let bases: { id: string; title: string }[];
  try {
    const { list: workspaces } = await nocodb<List<{ id: string }>>('/api/v2/meta/workspaces');
    const perWorkspace = await Promise.all(
      workspaces.map((w) => nocodb<List<{ id: string; title: string }>>(`/api/v2/meta/workspaces/${w.id}/bases`)),
    );
    bases = perWorkspace.flatMap((r) => r.list);
  } catch {
    bases = (await nocodb<List<{ id: string; title: string }>>('/api/v2/meta/bases')).list;
  }
  for (const b of bases) console.log(`${b.id}  ${b.title}`);
}

async function setup() {
  const { list } = await nocodb<List<{ title: string }>>(`/api/v2/meta/bases/${baseId()}/tables`);
  const existing = new Set(list.map((t) => t.title));
  for (const [name, columns] of Object.entries(TABLES)) {
    if (existing.has(name)) {
      console.log(`= ${name} (đã có)`);
      continue;
    }
    await nocodb(`/api/v2/meta/bases/${baseId()}/tables`, {
      method: 'POST',
      body: JSON.stringify({ table_name: name, title: name, columns }),
    });
    console.log(`+ ${name}`);
  }
  for (const role of DEFAULT_ROLES) {
    if (await findRow('roles', `(name,eq,${role.name})`)) continue;
    await insertRow('roles', role);
    console.log(`+ role ${role.name}`);
  }
}

async function upsertUser(username: string, role: string, displayName?: string) {
  if (!USERNAME_PATTERN.test(username ?? '')) throw new Error('username chỉ gồm chữ, số, . _ - (tối đa 50 ký tự)');
  if (!role || !(await findRow('roles', `(name,eq,${role})`))) throw new Error(`role "${role}" không có trong bảng roles`);

  // Line iterator instead of rl.question(), which drops buffered lines when stdin is piped.
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    process.stdout.write(prompt);
    return String((await lines.next()).value ?? '');
  };
  const password = await ask('Mật khẩu (tối thiểu 8 ký tự): ');
  const again = await ask('Nhập lại mật khẩu: ');
  rl.close();
  if (password.length < 8) throw new Error('Mật khẩu quá ngắn');
  if (password !== again) throw new Error('Hai lần nhập không khớp');

  const fields = { role, password_hash: await hashPassword(password), is_active: true, ...(displayName && { display_name: displayName }) };
  const user = await findRow('users', `(username,eq,${username})`);
  if (user) await updateRow('users', { Id: user.Id, ...fields });
  else await insertRow('users', { username, ...fields });
  console.log(user ? `Đã cập nhật ${username}` : `Đã tạo ${username}`);
}

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, () => Promise<void>> = {
  bases: listBases,
  setup,
  user: () => upsertUser(args[0], args[1], args.slice(2).join(' ') || undefined),
};
if (!commands[command]) {
  console.log('Dùng: npm run nocodb -- bases | setup | user <username> <role> [tên hiển thị]');
  process.exit(1);
}
commands[command]().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
