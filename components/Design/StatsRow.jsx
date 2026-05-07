'use client';

export default function StatsRow({ stats = [] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-slate-600 text-sm font-500 uppercase tracking-tight">
              {stat.label}
            </p>
            {stat.icon && (
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-lg">
                {stat.icon}
              </div>
            )}
          </div>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-700 text-slate-900">
              {stat.value}
            </p>
            {stat.trend && (
              <span className={`text-sm font-500 ${stat.trend > 0 ? 'text-green-600' : 'text-slate-600'}`}>
                {stat.trend > 0 ? '+' : ''}{stat.trend}%
              </span>
            )}
          </div>
          {stat.description && (
            <p className="text-slate-500 text-xs font-400 mt-3">
              {stat.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
