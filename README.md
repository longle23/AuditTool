# Jennie Work

Bộ công cụ web hỗ trợ kiểm toán, xây bằng Next.js. Mỗi chức năng là một mục trong menu bên trái.

## Chức năng

### Gộp file theo tháng (`/tools/monthly-merge`)

Gộp các file giao dịch của một tháng thành **một file Excel, một sheet**, sắp xếp từ đầu đến cuối tháng.

- Tên file mang kỳ dữ liệu: `01-10.07`, `11-20.07`, `21-30.07`, `31.07` (có thể kèm năm, ví dụ `01-10.07.2026`). Thứ tự chọn file không quan trọng, hệ thống tự sắp theo ngày.
- Kiểm tra trước khi gộp: cấu trúc cột phải giống nhau giữa các file, ngày còn thiếu / trùng trong tháng, ngày dữ liệu bên trong có khớp tên file không, giới hạn 1.048.576 dòng của Excel.
- Khi gộp: giữ header của file đầu tiên, bỏ header các file sau; file xuất theo thứ tự mới → cũ sẽ được đảo lại để tăng dần theo cột thời gian (ưu tiên “TG hoàn thành”); cột `STT` được đánh số lại liên tục.
- File kết quả có dòng tiêu đề cố định, bộ lọc (AutoFilter) và độ rộng cột hợp lý.
- Kiểm tra sau khi gộp:
  - **Tổng kiểm soát**: tổng các cột số tiền (Giá trị GD, Phí, Lãi gộp, Giá vốn, Thực nhận…) theo từng file và cả tháng; đối chiếu tổng lúc đọc nguồn với lúc ghi file gộp.
  - **Trùng mã giao dịch**: trùng Mã đơn hàng / Mã thanh toán trong cùng file hoặc giữa các file, kèm số dòng trong file gộp; xuất danh sách ra CSV.
- Tự bỏ qua file tạm `~$...xlsx` của Excel khi file gốc đang mở.
- Toàn bộ xử lý chạy trong trình duyệt (Web Worker, đọc/ghi .xlsx dạng streaming) — dữ liệu không tải lên máy chủ. Khoảng 450 nghìn dòng (~180 MB file nguồn) mất khoảng 1 phút.

Chỉ hỗ trợ định dạng `.xlsx`.

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

## Tài khoản, phân quyền và lịch sử (NocoDB)

Dữ liệu nằm trong base **JennieWork** trên NocoDB, app gọi qua REST API (`lib/nocodb.ts`). Không lưu nội dung file Excel. Thời gian tạo mỗi dòng NocoDB tự lưu ở cột `CreatedAt`.

| Bảng | Nội dung |
|---|---|
| `roles` | `name`, `description`, `permissions` (mảng JSON quyền, `["*"]` = toàn quyền) |
| `users` | `username`, `display_name`, `password_hash` (scrypt), `role` (= `roles.name`), `is_active`, `last_login_at` |
| `auth_logs` | đăng nhập / đăng nhập sai (kèm lý do) / đăng xuất / tạo link chia sẻ |
| `merge_logs` | mỗi lượt gộp file: trạng thái, người dùng, kỳ, số file, số dòng, dung lượng, thời gian, tổng kiểm soát, số mã trùng, danh sách file, lỗi |

Quyền khai báo trong `lib/permissions.ts` (`tools.monthly-merge`, `share.create`, `admin.activity` — trang `/admin/activity` xem lượt đăng nhập và lượt sử dụng). Role và quyền được chốt lúc đăng nhập — đổi quyền / khóa tài khoản có hiệu lực ở lần đăng nhập sau (phiên tối đa 4 giờ). Khách dùng link chia sẻ được dùng mọi công cụ, không tạo được link.

Thiết lập lần đầu:

1. `.env.local`: `NOCODB_URL`, `NOCODB_API_TOKEN` (NocoDB → Account settings → Tokens), `AUTH_SECRET` (chuỗi ngẫu nhiên, bắt buộc khi deploy).
2. `npm run nocodb -- bases` → copy id của base JennieWork vào `NOCODB_BASE_ID`.
3. `npm run nocodb -- setup` → tạo các bảng còn thiếu + role `admin`, `member` (chạy lại nhiều lần vẫn an toàn).
4. `npm run nocodb -- user admin admin "Quản trị"` → nhập mật khẩu, tạo tài khoản đăng nhập. Lệnh này cũng dùng để thêm người dùng hoặc đặt lại mật khẩu.

Thêm chức năng mới:

1. Thêm quyền `tools.<ten>` vào `lib/permissions.ts`, khai báo `permission` cho mục menu trong `app/config/navigation.ts`.
2. Thêm bảng `<ten>_logs` vào `TABLES` trong `scripts/nocodb.ts`, chạy lại `npm run nocodb -- setup` (bảng đã có được bỏ qua).
3. Ghi log từ code server: `writeLog('<ten>_logs', { ...các cột })` (`lib/usage-log.ts`, tự thêm `ip`, `user_agent`). Xem mẫu ở `app/tools/monthly-merge/actions.ts`.
4. Cấp quyền: thêm key vào `permissions` của role trên NocoDB.

## Cấu trúc

```
app/
  config/navigation.ts         # Menu bên trái — thêm chức năng mới tại đây
  components/shell/            # Khung ứng dụng: Sidebar, Topbar
  components/ui/               # Card, Button, PageHeader
  tools/monthly-merge/         # Trang "Gộp file theo tháng"
lib/
  xlsx/                        # Đọc/ghi .xlsx dạng streaming (zip + XML)
  monthly-merge/               # Logic gộp, phân tích kỳ, Web Worker
```

Thêm chức năng mới: tạo trang trong `app/tools/<ten-chuc-nang>/page.tsx` và khai báo một mục trong `app/config/navigation.ts`.
