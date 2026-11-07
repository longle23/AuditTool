interface CoverageBarProps {
  coverage: number[];
  month: number;
}

export function CoverageBar({ coverage, month }: CoverageBarProps) {
  const mm = String(month).padStart(2, '0');
  const covered = coverage.filter((c) => c > 0).length;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-slate-500">Độ phủ ngày</span>
        <span className="font-medium tabular-nums text-slate-700">
          {covered}/{coverage.length} ngày
        </span>
      </div>
      <div className="flex gap-[2px]">
        {coverage.map((count, i) => {
          const day = String(i + 1).padStart(2, '0');
          const state = count === 0 ? 'Thiếu dữ liệu' : count > 1 ? `Trùng ở ${count} file` : 'Đã có dữ liệu';
          return (
            <div
              key={i}
              title={`${day}/${mm}: ${state}`}
              className={`h-5 flex-1 rounded-[2px] ${
                count === 0 ? 'bg-slate-200' : count > 1 ? 'bg-amber-400' : 'bg-navy-800'
              }`}
            />
          );
        })}
      </div>
      <div className="relative mt-1 h-3 text-[10px] tabular-nums text-slate-400">
        {[1, 10, 20, coverage.length].map((day) => (
          <span
            key={day}
            className="absolute -translate-x-1/2"
            style={{ left: `${((day - 0.5) / coverage.length) * 100}%` }}
          >
            {String(day).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}
