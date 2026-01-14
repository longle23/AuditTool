'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileInfo {
  file: File;
  name: string;
  size: string;
}

interface ProcessResult {
  fileName: string;
  success: boolean;
  sheetName?: string;
  availableSheets?: string[];
  error?: string;
}

export default function ExcelUploader() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchPattern, setSearchPattern] = useState('month');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processReport, setProcessReport] = useState<ProcessResult[] | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const fileInfos: FileInfo[] = acceptedFiles.map(file => ({
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(2)
    }));
    
    setFiles(fileInfos);
    setError(null);
    setSuccess(null);
    setProcessReport(null);
    setProcessingMessage('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb']
    },
    multiple: true
  });

  const handleProcess = async (combineIntoOne: boolean = false) => {
    if (files.length === 0) {
      setError('Vui lòng chọn ít nhất 1 file Excel');
      return;
    }

    if (!searchPattern.trim()) {
      setError('Vui lòng nhập pattern tìm kiếm');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setProcessReport(null);
    
    // Tính tổng size để estimate thời gian
    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    
    const modeText = combineIntoOne ? 'gộp thành 1 sheet' : 'giữ nhiều sheet';
    setProcessingMessage(`⏳ Đang đọc ${files.length} file (${totalSizeMB} MB) - ${modeText}...`);

    const formData = new FormData();
    files.forEach(fileInfo => {
      formData.append('files', fileInfo.file);
    });
    formData.append('searchPattern', searchPattern.trim());
    formData.append('combineIntoOne', combineIntoOne.toString());

    setProcessingMessage(`⏳ Đang xử lý ${files.length} file... (${modeText})`);
    
    // Tạo AbortController với timeout 40 phút (cho file rất lớn)
    // File 914k rows có thể mất 20-30 phút
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      setError('Request bị timeout sau 40 phút. File quá lớn, vui lòng chia nhỏ file hoặc dùng Bước 1 (nhanh hơn).');
      setIsProcessing(false);
    }, 40 * 60 * 1000); // 40 phút
    
    try {
        const response = await fetch('/api/process-excel', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          
          // Lấy report nếu có
          if (errorData.report) {
            setProcessReport(errorData.report);
          }
          
          throw new Error(errorData.error || 'Có lỗi xảy ra');
        }
        
        // Lấy report từ header
        const reportHeader = response.headers.get('X-Process-Report');
        if (reportHeader) {
          try {
            const report = JSON.parse(decodeURIComponent(reportHeader));
            setProcessReport(report);
          } catch (e) {
            console.error('Error parsing report:', e);
          }
        }

        setProcessingMessage('⏳ Đang tải file về...');
        
        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Lấy tên file từ response header hoặc dùng tên mặc định
        const contentDisposition = response.headers.get('Content-Disposition');
        let fileName = `Combined_Audit_${Date.now()}.xlsx`;
        
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch && fileNameMatch[1]) {
            fileName = fileNameMatch[1];
          }
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

      // Hiển thị thông báo thành công
      const successCount = processReport?.filter(r => r.success).length || files.length;
      setSuccess(`✓ Đã xử lý thành công ${successCount}/${files.length} file và tải về!`);
      setProcessingMessage('');

    } catch (err) {
      clearTimeout(timeoutId);
      
      let errorMessage = 'Có lỗi xảy ra khi xử lý file';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('signal is aborted')) {
          errorMessage = 'Request bị timeout sau 40 phút. File quá lớn (914k+ dòng), vui lòng:\n' +
            '• Chia nhỏ file (2 files/lần thay vì 3)\n' +
            '• Hoặc dùng Bước 1 (nhanh hơn, 3-5 phút)\n' +
            '• Hoặc đợi server xử lý xong (có thể mất 25-30 phút)';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('ERR_NETWORK')) {
          errorMessage = 'Lỗi kết nối. Server có thể đang xử lý file lớn. Vui lòng:\n' +
            '• Kiểm tra terminal xem server có đang chạy không\n' +
            '• Đợi thêm vài phút (file lớn cần 20-30 phút)\n' +
            '• Refresh trang và thử lại';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setProcessingMessage('');
      console.error('Error processing files:', err);
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
    setError(null);
    setSuccess(null);
    setProcessReport(null);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-[#00205B] to-[#FFB81C] bg-clip-text text-transparent">
          Công cụ Gộp Sheet Excel
        </h1>
        <p className="text-[#00205B] font-medium">
          Dành cho team Kiểm toán - Tự động gộp các sheet theo pattern tùy chỉnh
        </p>
      </div>

      {/* Search Pattern Input */}
      <div className="mb-6 bg-white rounded-xl border-2 border-[#00205B] p-4 shadow-lg">
        <label htmlFor="searchPattern" className="block text-sm font-semibold text-[#00205B] mb-2">
          🔍 Pattern tìm kiếm sheet:
        </label>
        <input
          type="text"
          id="searchPattern"
          value={searchPattern}
          onChange={(e) => setSearchPattern(e.target.value)}
          placeholder="Ví dụ: month, quarter, weekly..."
          className="w-full px-4 py-3 border-2 border-[#FFB81C] rounded-lg focus:ring-2 focus:ring-[#00205B] focus:border-[#00205B] outline-none transition-all"
        />
        <p className="text-xs text-gray-600 mt-2">
          💡 Nhập từ khóa để tìm sheet (không phân biệt hoa thường). Ví dụ: &quot;month&quot; sẽ tìm &quot;Month 01&quot;, &quot;Monthly Report&quot;...
        </p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-3 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 shadow-lg
          ${isDragActive 
            ? 'border-[#FFB81C] bg-[#FFF8E7] scale-[1.02] shadow-xl' 
            : 'border-[#00205B] hover:border-[#FFB81C] hover:bg-[#F8F9FA] bg-white'
          }`}
      >
        <input {...getInputProps()} />
        <div className="text-[#00205B]">
          <svg 
            className="mx-auto h-16 w-16 mb-4 text-[#FFB81C]"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
            />
          </svg>
          
          {isDragActive ? (
            <p className="text-xl font-semibold text-[#FFB81C]">
              Thả file vào đây...
            </p>
          ) : (
            <>
              <p className="text-lg mb-2 font-bold text-[#00205B]">
                Kéo thả file Excel vào đây
              </p>
              <p className="text-sm text-[#00205B] mb-3 font-medium">
                hoặc click để chọn file
              </p>
              <p className="text-xs text-gray-600">
                Hỗ trợ: .xlsx, .xls, .xlsb (nhiều file)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Processing Message */}
      {processingMessage && (
        <div className="mt-4 p-4 bg-[#FFF8E7] border-2 border-[#FFB81C] rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-[#FFB81C]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#00205B]">{processingMessage}</p>
              <p className="text-xs text-[#00205B] mt-1 opacity-80">
                File lớn (300k+ dòng) có thể mất 2-5 phút. Vui lòng đợi...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border-2 border-[#00205B] p-4 shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[#00205B]">
              Đã chọn {files.length} file:
            </h3>
            <button
              onClick={clearAll}
              className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              Xóa tất cả
            </button>
          </div>
          
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((fileInfo, index) => (
              <li 
                key={index} 
                className="flex items-center justify-between bg-[#FFF8E7] p-3 rounded-lg hover:bg-[#FFE9B3] transition-colors border border-[#FFB81C]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <svg 
                    className="h-8 w-8 text-[#FFB81C] flex-shrink-0" 
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                  >
                    <path 
                      fillRule="evenodd" 
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" 
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#00205B] truncate">
                      {fileInfo.name}
                    </p>
                    <p className="text-xs text-gray-600">
                      {fileInfo.size} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-2 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 flex-shrink-0"
                  title="Xóa file"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Process Report */}
      {processReport && processReport.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border-2 border-[#00205B] p-4 shadow-lg">
          <h3 className="font-semibold text-[#00205B] mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-[#FFB81C]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
            </svg>
            Báo cáo xử lý chi tiết:
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {processReport.map((result, index) => (
              <div 
                key={index}
                className={`p-3 rounded-lg border-l-4 ${
                  result.success 
                    ? 'bg-green-50 border-green-500' 
                    : 'bg-red-50 border-red-500'
                }`}
              >
                <div className="flex items-start gap-2">
                  {result.success ? (
                    <svg className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                    </svg>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">
                      {result.fileName}
                    </p>
                    
                    {result.success ? (
                      <p className="text-xs text-green-700 mt-1">
                        ✓ Đã lấy sheet: <span className="font-semibold">{result.sheetName}</span>
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-red-700 mt-1">
                          ✗ {result.error}
                        </p>
                        {result.availableSheets && result.availableSheets.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                              Xem các sheet có sẵn ({result.availableSheets.length})
                            </summary>
                            <ul className="mt-2 ml-4 space-y-1">
                              {result.availableSheets.map((sheetName, idx) => (
                                <li key={idx} className="text-xs text-gray-600">
                                  • {sheetName}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-green-600">
                {processReport.filter(r => r.success).length}
              </span> thành công / {' '}
              <span className="font-semibold text-red-600">
                {processReport.filter(r => !r.success).length}
              </span> thất bại
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
          </svg>
          <div className="flex-1">
            <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <svg className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
          <p className="text-green-700 text-sm font-medium">{success}</p>
        </div>
      )}

      {/* Process Buttons */}
      <div className="mt-6 space-y-3">
        {/* Button 1: Gộp thành nhiều sheet */}
        <button
          onClick={() => handleProcess(false)}
          disabled={files.length === 0 || isProcessing || !searchPattern.trim()}
          className="w-full bg-gradient-to-r from-[#00205B] to-[#003d82] text-white py-4 rounded-xl font-bold text-lg
            hover:from-[#001a4d] hover:to-[#00205B] disabled:from-gray-300 disabled:to-gray-300 
            disabled:cursor-not-allowed transition-all duration-200 shadow-xl hover:shadow-2xl
            disabled:shadow-none transform hover:scale-[1.02] active:scale-[0.98] border-2 border-[#FFB81C]"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Đang xử lý...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              📊 Bước 1: Gộp thành nhiều sheet
            </span>
          )}
        </button>

        {/* Button 2: Gộp thành 1 sheet Combined */}
        <button
          onClick={() => handleProcess(true)}
          disabled={true}
          className="w-full bg-gradient-to-r from-gray-300 to-gray-300 text-gray-500 py-4 rounded-xl font-bold text-lg
            cursor-not-allowed transition-all duration-200 shadow-none border-2 border-gray-400 opacity-60"
        >
          <span className="flex items-center justify-center gap-2">
            🔒 Bước 2: Đã tạm khóa (Liên hệ admin để mở)
          </span>
        </button>

        {/* Explanation */}
        <div className="text-xs text-[#00205B] text-center space-y-1 mt-2 font-medium">
          <p>💡 <span className="font-bold">Bước 1:</span> Mỗi file = 1 sheet riêng biệt (Nhanh: 3-5 phút)</p>
          <p className="text-gray-500">🔒 <span className="font-bold">Bước 2:</span> Đã tạm khóa</p>
        </div>

        {/* Warning for large files in Step 2 */}
        {files.length > 0 && (() => {
          const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
          const totalSizeMB = totalSize / 1024 / 1024;
          const isLarge = totalSizeMB > 50 || files.length >= 3;
          
          return isLarge ? (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-800">
                ⚠️ <span className="font-semibold">Cảnh báo:</span> Với {files.length} file ({totalSizeMB.toFixed(1)} MB), 
                Bước 2 có thể mất <span className="font-semibold">20-30 phút</span>. 
                Nếu timeout, hãy chia nhỏ file hoặc dùng Bước 1 (nhanh hơn).
              </p>
            </div>
          ) : null;
        })()}
      </div>

      {/* Info Box */}
      <div className="mt-8 space-y-4">
        {/* Hướng dẫn chung */}
        <div className="p-4 bg-[#FFF8E7] border-2 border-[#FFB81C] rounded-lg shadow-lg">
          <h4 className="font-bold text-[#00205B] mb-2 flex items-center gap-2">
            <svg className="h-5 w-5 text-[#FFB81C]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
            </svg>
            Cách sử dụng:
          </h4>
          <ul className="text-sm text-[#00205B] space-y-1 font-medium">
            <li>1. Nhập pattern tìm kiếm (ví dụ: &quot;month&quot;, &quot;quarter&quot;, &quot;weekly&quot;)</li>
            <li>2. Chọn nhiều file Excel (.xlsx, .xls, .xlsb)</li>
            <li>3. Chọn một trong hai nút xử lý:</li>
            <li className="ml-6">• <span className="font-bold">Bước 1:</span> Mỗi file giữ 1 sheet riêng</li>
            <li className="ml-6">• <span className="font-bold">Bước 2:</span> Gộp tất cả vào 1 sheet &quot;Combined&quot;</li>
            <li>4. Xem báo cáo chi tiết và tải file về</li>
          </ul>
        </div>

        {/* Giải thích 2 bước */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Bước 1 */}
          <div className="p-4 bg-white border-2 border-[#00205B] rounded-lg shadow-lg">
            <h5 className="font-bold text-[#00205B] mb-2 flex items-center gap-2">
              📊 Bước 1: Nhiều sheet
            </h5>
            <p className="text-sm text-[#00205B] mb-2 font-medium">
              Kết quả: 1 file với nhiều sheet
            </p>
            <p className="text-xs text-gray-700">
              Ví dụ: File1.xlsx → Sheet &quot;Month 01&quot;<br/>
              File2.xlsx → Sheet &quot;Month 02&quot;<br/>
              File3.xlsx → Sheet &quot;Month 03&quot;
            </p>
          </div>

          {/* Bước 2 */}
          <div className="p-4 bg-gray-100 border-2 border-gray-400 rounded-lg shadow-lg opacity-60">
            <h5 className="font-bold text-gray-600 mb-2 flex items-center gap-2">
              🔒 Bước 2: 1 sheet Combined (Đã khóa)
            </h5>
            <p className="text-sm text-gray-600 mb-2 font-medium">
              Kết quả: 1 file với 1 sheet &quot;Combined&quot;
            </p>
            <p className="text-xs text-gray-600">
              Tất cả data từ các sheet được gộp thành 1:<br/>
              • Header từ sheet đầu tiên<br/>
              • Data từ tất cả sheet (không duplicate header)<br/>
              <span className="font-bold text-red-600">⚠️ Chức năng tạm khóa</span>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t-4 border-[#FFB81C] text-center bg-white rounded-xl p-4 shadow-lg">
        <p className="text-sm font-bold text-[#00205B]">
          Designed by <span className="font-bold text-[#FFB81C]">Henry</span> for <span className="font-bold text-[#00205B]">Audit Team</span>
        </p>
      </footer>
    </div>
  );
}
