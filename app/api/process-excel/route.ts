import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// Tăng timeout cho API route (file lớn cần nhiều thời gian)
export const maxDuration = 300; // 5 phút (Next.js limit)
export const dynamic = 'force-dynamic';

interface ProcessResult {
  fileName: string;
  success: boolean;
  sheetName?: string;
  availableSheets?: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const searchPattern = (formData.get('searchPattern') as string) || 'month';
    const combineIntoOne = formData.get('combineIntoOne') === 'true';

    if (files.length === 0) {
      return NextResponse.json({ error: 'Không có file nào được tải lên' }, { status: 400 });
    }

    // Mảng để lưu các worksheet (không convert sang array để tối ưu memory)
    const extractedSheets: { 
      name: string; 
      worksheet: XLSX.WorkSheet;
      sourceFile: string;
    }[] = [];

    // Mảng để lưu báo cáo xử lý
    const processReport: ProcessResult[] = [];

    // Xử lý từng file
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        console.log(`⏳ Đang đọc file "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
        
        // Hỗ trợ cả xlsx, xls, xlsb với tối ưu cho file lớn
        const workbook = XLSX.read(arrayBuffer, { 
          type: 'array',
          // Tối ưu cho file lớn
          dense: true,        // Sử dụng dense arrays (nhanh hơn ~30%)
          cellStyles: false,  // Bỏ qua styles
          cellHTML: false,    // Bỏ qua HTML
          cellFormula: false  // Bỏ qua formulas (chỉ lấy values)
        });

        // Tìm sheet có chứa pattern trong tên (không phân biệt hoa thường)
        const sheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().includes(searchPattern.toLowerCase())
        );

        if (sheetName) {
          const worksheet = workbook.Sheets[sheetName];
          
          // Lấy range để tính số dòng
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          const rowCount = range.e.r - range.s.r + 1;
          
          console.log(`✓ Tìm thấy sheet "${sheetName}" trong file "${file.name}" (${rowCount.toLocaleString()} dòng)`);
          
          // Lưu worksheet trực tiếp (không convert) để tối ưu memory
          extractedSheets.push({
            name: sheetName,
            worksheet: worksheet,
            sourceFile: file.name
          });

          processReport.push({
            fileName: file.name,
            success: true,
            sheetName: sheetName,
            availableSheets: workbook.SheetNames
          });
        } else {
          processReport.push({
            fileName: file.name,
            success: false,
            availableSheets: workbook.SheetNames,
            error: `Không tìm thấy sheet chứa "${searchPattern}"`
          });
          
          console.log(`✗ Không tìm thấy sheet chứa "${searchPattern}" trong file "${file.name}"`);
          console.log(`   Các sheet có sẵn: ${workbook.SheetNames.join(', ')}`);
        }
      } catch (fileError) {
        processReport.push({
          fileName: file.name,
          success: false,
          error: `Lỗi khi đọc file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`
        });
        console.error(`✗ Lỗi khi xử lý file "${file.name}":`, fileError);
      }
    }

    if (extractedSheets.length === 0) {
      return NextResponse.json(
        { 
          error: `Không tìm thấy sheet nào có chứa "${searchPattern}" trong tên`,
          report: processReport
        },
        { status: 404 }
      );
    }

    console.log(`⏳ Đang gộp ${extractedSheets.length} sheet...`);
    
    // Tạo workbook mới với các sheet đã lấy
    const newWorkbook = XLSX.utils.book_new();
    
    if (combineIntoOne) {
      // BƯỚC 2: Gộp tất cả sheet thành 1 sheet "Combined" (VBA logic)
      console.log(`⏳ Đang gộp tất cả sheet thành 1 sheet "Combined"...`);
      
      const combinedData: any[][] = [];
      
      extractedSheets.forEach((sheet, index) => {
        // Convert worksheet sang array
        console.log(`  ⏳ Đang convert sheet: ${sheet.name}...`);
        const data = XLSX.utils.sheet_to_json(sheet.worksheet, { header: 1, defval: '' }) as any[][];
        
        if (index === 0) {
          // Sheet đầu tiên: Lấy cả header
          // Dùng concat thay vì spread để tránh call stack overflow với file lớn
          for (let i = 0; i < data.length; i++) {
            combinedData.push(data[i]);
          }
          console.log(`  ✓ Đã copy header từ sheet: ${sheet.name} (${data.length.toLocaleString()} dòng)`);
        } else {
          // Các sheet còn lại: Chỉ lấy data (bỏ header - dòng 1)
          if (data.length > 1) {
            // Bỏ dòng đầu (header) và copy phần còn lại
            for (let i = 1; i < data.length; i++) {
              combinedData.push(data[i]);
            }
            console.log(`  ✓ Đã copy data từ sheet: ${sheet.name} (${(data.length - 1).toLocaleString()} dòng)`);
          }
        }
      });
      
      // Tạo worksheet "Combined"
      console.log(`  ⏳ Đang tạo worksheet "Combined" từ ${combinedData.length.toLocaleString()} dòng... (Có thể mất 5-10 phút)`);
      const combinedWorksheet = XLSX.utils.aoa_to_sheet(combinedData);
      console.log(`  ✅ Đã tạo worksheet "Combined"`);
      
      XLSX.utils.book_append_sheet(newWorkbook, combinedWorksheet, 'Combined');
      console.log(`  ✅ Đã thêm sheet "Combined" với ${combinedData.length.toLocaleString()} dòng tổng cộng`);
      
    } else {
      // BƯỚC 1: Giữ nhiều sheet riêng biệt (logic cũ)
      extractedSheets.forEach((sheet, index) => {
        // Sử dụng worksheet trực tiếp (không convert) - NHANH HƠN!
        const worksheet = sheet.worksheet;
        
        // Đặt tên sheet (giữ nguyên tên gốc hoặc thêm số thứ tự nếu trùng)
        let finalSheetName = sheet.name;
        
        // Excel giới hạn tên sheet tối đa 31 ký tự
        if (finalSheetName.length > 31) {
          finalSheetName = finalSheetName.substring(0, 28) + `_${index + 1}`;
        }
        
        // Kiểm tra tên sheet đã tồn tại chưa
        if (newWorkbook.SheetNames.includes(finalSheetName)) {
          finalSheetName = `${finalSheetName.substring(0, 28)}_${index + 1}`;
        }
        
        XLSX.utils.book_append_sheet(newWorkbook, worksheet, finalSheetName);
        console.log(`  ✓ Đã thêm sheet: ${finalSheetName}`);
      });
    }

    console.log(`⏳ Đang ghi file Excel... (Có thể mất 3-5 phút với file lớn)`);
    
    // Chuyển thành buffer với tối ưu cho file lớn
    const excelBuffer = XLSX.write(newWorkbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true  // Nén file để nhỏ hơn và nhanh hơn
    });
    
    console.log(`✅ Đã ghi xong file Excel (${(excelBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Tạo tên file với timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = combineIntoOne 
      ? `Combined_Sheet_${timestamp}.xlsx`
      : `Combined_Audit_${timestamp}.xlsx`;

    // Encode report as JSON trong header (để client có thể đọc)
    const reportHeader = encodeURIComponent(JSON.stringify(processReport));

    // Trả về file Excel với report trong header
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Process-Report': reportHeader
      }
    });

  } catch (error) {
    console.error('Lỗi khi xử lý file Excel:', error);
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi xử lý file' },
      { status: 500 }
    );
  }
}

    