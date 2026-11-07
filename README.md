# Audit Tool

Bộ công cụ web hỗ trợ kiểm toán, xây bằng Next.js. Mỗi chức năng là một mục trong menu bên trái.

## Chức năng

### Gộp file theo tháng (`/tools/monthly-merge`)

Gộp các file giao dịch của một tháng thành **một file Excel, một sheet**, sắp xếp từ đầu đến cuối tháng.

- Tên file mang kỳ dữ liệu: `01-10.07`, `11-20.07`, `21-30.07`, `31.07` (có thể kèm năm, ví dụ `01-10.07.2026`). Thứ tự chọn file không quan trọng, hệ thống tự sắp theo ngày.
- Kiểm tra trước khi gộp: cấu trúc cột phải giống nhau giữa các file, ngày còn thiếu / trùng trong tháng, ngày dữ liệu bên trong có khớp tên file không, giới hạn 1.048.576 dòng của Excel.
- Khi gộp: giữ header của file đầu tiên, bỏ header các file sau; file xuất theo thứ tự mới → cũ sẽ được đảo lại để tăng dần theo cột thời gian (ưu tiên “TG hoàn thành”); cột `STT` được đánh số lại liên tục.
- File kết quả có dòng tiêu đề cố định, bộ lọc (AutoFilter) và độ rộng cột hợp lý.
- Toàn bộ xử lý chạy trong trình duyệt (Web Worker, đọc/ghi .xlsx dạng streaming) — dữ liệu không tải lên máy chủ. Khoảng 450 nghìn dòng (~180 MB file nguồn) mất khoảng 1 phút.

Chỉ hỗ trợ định dạng `.xlsx`.

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

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
