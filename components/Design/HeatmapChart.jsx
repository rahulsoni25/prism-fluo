'use client';

export default function HeatmapChart({ data, labels, title, description }) {
  // Normalize data for color intensity (0-1)
  const maxValue = Math.max(...data.flat());
  const minValue = Math.min(...data.flat());
  const range = maxValue - minValue || 1;

  const getColor = (value) => {
    const normalized = (value - minValue) / range;
    // Blue gradient: light -> dark
    if (normalized < 0.25) {
      return `rgb(191, 219, 254)`; // Light blue
    } else if (normalized < 0.5) {
      return `rgb(147, 197, 253)`; // Medium light blue
    } else if (normalized < 0.75) {
      return `rgb(96, 165, 250)`; // Medium blue
    } else {
      return `rgb(37, 99, 235)`; // Dark blue
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header */}
      {(title || description) && (
        <div className="mb-6">
          {title && <h3 className="text-lg font-700 text-slate-900 mb-1">{title}</h3>}
          {description && <p className="text-sm text-slate-600 font-400">{description}</p>}
        </div>
      )}

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Column Labels */}
          {labels?.columns && (
            <div className="flex mb-2">
              <div className="w-24 flex-shrink-0" />
              {labels.columns.map((col, index) => (
                <div
                  key={index}
                  className="w-16 px-2 py-1 text-xs font-500 text-slate-600 text-center"
                >
                  {col}
                </div>
              ))}
            </div>
          )}

          {/* Row Labels + Cells */}
          {data.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              {labels?.rows && (
                <div className="w-24 flex-shrink-0 px-2 py-1 text-xs font-500 text-slate-600 flex items-center">
                  {labels.rows[rowIndex]}
                </div>
              )}
              {row.map((value, colIndex) => (
                <div
                  key={colIndex}
                  className="w-16 h-16 flex items-center justify-center text-xs font-600 rounded-lg margin-1 cursor-default transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: getColor(value),
                    color: value > (maxValue + minValue) / 2 ? '#ffffff' : '#1e293b',
                    margin: '2px',
                  }}
                  title={`${value}`}
                >
                  {typeof value === 'number' ? value.toFixed(0) : value}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-500 text-slate-600">Scale</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#bfdbfe' }} />
              <span className="text-xs text-slate-500">{minValue.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2563eb' }} />
              <span className="text-xs text-slate-500">{maxValue.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
