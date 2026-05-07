'use client';

export default function InsightCard({ title, description, chart, metrics, icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-700 text-slate-900 mb-1">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-slate-600 font-400">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div className="text-2xl flex-shrink-0 ml-4">
            {icon}
          </div>
        )}
      </div>

      {/* Chart Area */}
      {chart && (
        <div className="h-48 bg-slate-50 rounded-lg p-4 mb-4 flex items-center justify-center">
          {chart}
        </div>
      )}

      {/* Metrics */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          {metrics.map((metric, index) => (
            <div key={index}>
              <p className="text-xs text-slate-500 font-500 uppercase tracking-tight mb-1">
                {metric.label}
              </p>
              <p className="text-lg font-700 text-slate-900">
                {metric.value}
              </p>
              {metric.change && (
                <p className={`text-xs font-500 mt-1 ${metric.change > 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {metric.change > 0 ? '↑' : '→'} {Math.abs(metric.change)}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer Action */}
      {!chart && !metrics && (
        <div className="py-8 text-center">
          <p className="text-slate-500 font-400 text-sm">
            No data available for this metric
          </p>
        </div>
      )}
    </div>
  );
}
