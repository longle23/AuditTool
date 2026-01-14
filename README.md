# 📊 Công cụ Gộp Sheet Excel - Kiểm toán

Công cụ web được xây dựng bằng Next.js giúp team kiểm toán tự động gộp các sheet từ nhiều file Excel thành một file duy nhất với pattern tìm kiếm tùy chỉnh.

## ✨ Tính năng

### 🎯 Core Features
- 📁 Upload nhiều file Excel cùng lúc (drag & drop hoặc click chọn)
- 🔍 **Pattern tìm kiếm tùy chỉnh** - Không giới hạn ở "Month"!
- 📝 Gộp tất cả các sheet tìm được vào một file Excel mới
- 💾 **Hỗ trợ đầy đủ:** .xlsx, .xls, .xlsb (Excel Binary)
- ⬇️ Tải về file kết quả ngay lập tức
- ⚡ Xử lý nhanh chóng, không cần upload lên server

### 📊 Advanced Features
- 📋 **Báo cáo chi tiết** từng file (thành công/thất bại)
- 👁️ Xem danh sách tất cả sheet có sẵn trong file
- 📈 Thống kê tổng quan: X thành công / Y thất bại
- 🎨 Giao diện đẹp, hiện đại và dễ sử dụng
- 🔄 Pattern không phân biệt hoa thường

## 🚀 Cài đặt và Chạy

### Yêu cầu

- Node.js 18+ 
- npm hoặc yarn

### Các bước cài đặt

1. **Clone hoặc di chuyển vào thư mục dự án:**

```bash
cd audit-tool
```

2. **Cài đặt dependencies:**

```bash
npm install
```

3. **Chạy development server:**

```bash
npm run dev
```

4. **Mở trình duyệt:**

Truy cập [http://localhost:3000](http://localhost:3000)

## 📖 Cách sử dụng

1. **Nhập pattern:** Nhập từ khóa tìm kiếm (ví dụ: "month", "quarter", "weekly")

2. **Upload files:** Kéo thả hoặc click để chọn nhiều file Excel (.xlsx, .xls, .xlsb)

3. **Xem danh sách:** Kiểm tra các file đã chọn, có thể xóa từng file nếu cần

4. **Xử lý:** Click nút "🚀 Xử lý và Tải về"

5. **Xem báo cáo:** Kiểm tra báo cáo chi tiết từng file đã xử lý

6. **Tải file:** File Excel đã gộp sẽ tự động được tải về

## 🛠️ Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Excel Processing:** xlsx
- **File Upload:** react-dropzone
- **Runtime:** Node.js

## 📁 Cấu trúc thư mục

```
audit-tool/
├── app/
│   ├── api/
│   │   └── process-excel/
│   │       └── route.ts          # API xử lý Excel files
│   ├── components/
│   │   └── ExcelUploader.tsx     # Component upload và xử lý
│   ├── layout.tsx                # Layout chính
│   ├── page.tsx                  # Trang chủ
│   └── globals.css               # Global styles
├── public/                       # Static files
├── package.json                  # Dependencies
└── README.md                     # Tài liệu này
```

## 🔧 Customization

### Thay đổi pattern tìm kiếm

✅ **Không cần code!** Chỉ cần nhập pattern mới vào ô input trên giao diện.

Ví dụ:
- `"month"` → Tìm sheet "Month 01", "Monthly Report"
- `"quarter"` → Tìm sheet "Q1", "Quarter 1"  
- `"weekly"` → Tìm sheet "Week 1", "Weekly Data"
- `"annual"` → Tìm sheet "Annual Report"

Pattern không phân biệt hoa thường và tìm kiếm theo dạng "contains".

### Thay đổi pattern mặc định

Nếu muốn đổi pattern mặc định (hiện tại là "month"):

Mở file `app/components/ExcelUploader.tsx` và sửa dòng:

```typescript
const [searchPattern, setSearchPattern] = useState('month'); // Đổi 'month' thành pattern khác
```

### Thay đổi màu sắc

Chỉnh sửa các class Tailwind trong file `app/components/ExcelUploader.tsx`

## 🐛 Xử lý lỗi

### File không được xử lý?

- Kiểm tra tên sheet có chứa "Month" không
- Đảm bảo file là định dạng .xlsx hoặc .xls
- Kiểm tra file không bị corrupt

### Không tải được file về?

- Kiểm tra trình duyệt có chặn popup không
- Thử refresh lại trang và upload lại

## 📦 Build cho Production

```bash
# Build
npm run build

# Start production server
npm start
```

## 🚀 Deploy

### Deploy lên Vercel (Khuyến nghị)

1. Push code lên GitHub
2. Import project vào Vercel
3. Deploy tự động

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/audit-tool)

### Deploy lên các nền tảng khác

- **Netlify:** Hỗ trợ Next.js
- **Railway:** Đơn giản và nhanh
- **Docker:** Có thể containerize

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng:

1. Fork dự án
2. Tạo branch mới (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

## 📝 License

Dự án này được phát triển cho mục đích nội bộ team kiểm toán.

## 👨‍💻 Author

Được phát triển bởi team Kiểm toán

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - Framework React
- [SheetJS](https://sheetjs.com/) - Thư viện xử lý Excel
- [Tailwind CSS](https://tailwindcss.com/) - CSS Framework
- [react-dropzone](https://react-dropzone.js.org/) - File upload component

---

**Happy Auditing! 🎉**
