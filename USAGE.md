# 📘 Hướng dẫn Sử dụng Chi tiết

## Cách sử dụng Công cụ Gộp Sheet Excel

### Bước 1: Khởi động ứng dụng

```bash
cd audit-tool
npm run dev
```

Mở trình duyệt và truy cập: http://localhost:3000

### Bước 2: Chuẩn bị File Excel

Đảm bảo các file Excel của bạn có:
- Ít nhất một sheet có chứa chữ "Month" trong tên (ví dụ: "Month 01", "Monthly Report", "Data_Month_2024")
- Định dạng .xlsx hoặc .xls
- Dữ liệu hợp lệ (không bị corrupt)

### Bước 3: Upload Files

**Cách 1: Kéo thả (Drag & Drop)**
- Kéo các file Excel vào vùng upload (màu xám có viền đứt)
- Thả file khi vùng upload chuyển sang màu xanh

**Cách 2: Click chọn**
- Click vào vùng upload
- Chọn một hoặc nhiều file Excel từ máy tính
- Click "Open"

### Bước 4: Kiểm tra Danh sách File

Sau khi upload, bạn sẽ thấy:
- Tên file
- Kích thước file
- Nút xóa (X) cho từng file nếu muốn bỏ file đó

### Bước 5: Xử lý và Tải về

1. Click nút **"🚀 Xử lý và Tải về"**
2. Đợi vài giây (tùy thuộc vào số lượng và kích thước file)
3. File kết quả sẽ tự động được tải về với tên dạng: `Combined_Audit_YYYY-MM-DDTHH-MM-SS.xlsx`

### Bước 6: Kiểm tra File Kết quả

Mở file Excel vừa tải về:
- Mỗi tab (sheet) tương ứng với một sheet "Month" đã tìm được
- Tên sheet giữ nguyên như trong file gốc
- Dữ liệu được giữ nguyên format và công thức (nếu có)

## ⚠️ Lưu ý Quan trọng

### Tìm kiếm Sheet

- Công cụ tìm sheet có chứa "Month" **KHÔNG PHÂN BIỆT HOA THƯỜNG**
- Nếu nhiều sheet cùng chứa "Month", chỉ sheet **ĐẦU TIÊN** được lấy
- Các sheet khác sẽ được bỏ qua

### Giới hạn

- **Tên sheet tối đa:** 31 ký tự (giới hạn của Excel)
- **Số lượng file:** Không giới hạn (nhưng khuyến nghị dưới 50 file để tránh chậm)
- **Kích thước file:** Phụ thuộc vào RAM máy tính (khuyến nghị mỗi file < 50MB)

### Xử lý Lỗi

**Lỗi: "Không tìm thấy sheet nào có chứa Month"**
- Kiểm tra lại tên các sheet trong file Excel
- Đảm bảo có ít nhất một sheet chứa từ "Month"

**Lỗi: File không tải được**
- Kiểm tra popup blocker của trình duyệt
- Thử trình duyệt khác (Chrome, Edge, Firefox)
- Kiểm tra quyền ghi file vào thư mục Downloads

**Lỗi: "Có lỗi xảy ra khi xử lý file"**
- Kiểm tra file Excel có bị corrupt không
- Thử mở file bằng Excel để kiểm tra
- Upload lại file

## 💡 Tips & Tricks

### Đặt tên Sheet chuẩn

Để dễ dàng sử dụng công cụ, đặt tên sheet theo quy tắc:
- "Month 01", "Month 02", ... "Month 12"
- "Monthly Report January", "Monthly Report February"
- "Data Month 2024-01", "Data Month 2024-02"

### Xử lý Batch lớn

Nếu có nhiều file (>20 files):
1. Chia thành các batch nhỏ (10-15 files/lần)
2. Xử lý từng batch
3. Sau đó có thể gộp các file kết quả lại nếu cần

### Backup dữ liệu

- Luôn giữ file gốc
- Kiểm tra file kết quả trước khi xóa file gốc
- Backup định kỳ

## 🎯 Ví dụ Thực tế

### Ví dụ 1: Gộp báo cáo tháng

**Input:**
- `Report_Jan.xlsx` (có sheet "Month 01")
- `Report_Feb.xlsx` (có sheet "Month 02")
- `Report_Mar.xlsx` (có sheet "Month 03")

**Output:**
- `Combined_Audit_2024-01-14T10-30-45.xlsx`
  - Sheet 1: "Month 01" (từ Report_Jan.xlsx)
  - Sheet 2: "Month 02" (từ Report_Feb.xlsx)
  - Sheet 3: "Month 03" (từ Report_Mar.xlsx)

### Ví dụ 2: Nhiều sheet trong một file

**Input:**
- `Annual_Report.xlsx`
  - Sheet "Summary"
  - Sheet "Monthly Data" ✓ (được chọn vì có "Month")
  - Sheet "Yearly Data"

**Output:**
- Chỉ sheet "Monthly Data" được lấy

## 🔧 Customization

Nếu muốn tìm sheet theo pattern khác (không phải "Month"):

1. Mở file: `app/api/process-excel/route.ts`
2. Tìm dòng:
```typescript
name.toLowerCase().includes('month')
```
3. Đổi 'month' thành pattern mong muốn (ví dụ: 'quarterly', 'week', v.v.)
4. Save và refresh browser

## 📞 Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra console của trình duyệt (F12 > Console)
2. Kiểm tra terminal đang chạy server
3. Đọc lại hướng dẫn này
4. Liên hệ team IT

---

**Chúc bạn sử dụng công cụ hiệu quả! 🎉**




