'use client';

export default function BriefCard({ brief, onClick }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 border border-green-300';
      case 'pending':
        return 'bg-amber-100 text-amber-700 border border-amber-300';
      case 'completed':
        return 'bg-slate-100 text-slate-700 border border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-300';
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      'content': 'bg-blue-50 text-blue-700 border-blue-200',
      'social': 'bg-purple-50 text-purple-700 border-purple-200',
      'commerce': 'bg-green-50 text-green-700 border-green-200',
      'campaign': 'bg-orange-50 text-orange-700 border-orange-200',
    };
    return colors[category] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all active:scale-95"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-700 text-slate-900 mb-1">
            {brief.brand}
          </h3>
          <p className="text-sm text-slate-500 font-400">
            {brief.client}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-lg text-xs font-600 whitespace-nowrap ml-2 ${getStatusColor(brief.status)}`}>
          {brief.status.charAt(0).toUpperCase() + brief.status.slice(1)}
        </span>
      </div>

      {/* Category Badge */}
      <div className="mb-4">
        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-500 border ${getCategoryColor(brief.category)}`}>
          {brief.category}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
        <div>
          <p className="text-xs text-slate-500 font-500 uppercase tracking-tight mb-1">
            Budget
          </p>
          <p className="text-base font-700 text-slate-900">
            {brief.budget}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-500 uppercase tracking-tight mb-1">
            Duration
          </p>
          <p className="text-base font-700 text-slate-900">
            {brief.duration}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-500 uppercase tracking-tight mb-1">
            SLA
          </p>
          <p className="text-base font-700 text-slate-900">
            {brief.sla}
          </p>
        </div>
      </div>

      {/* Timeline */}
      {brief.daysLeft !== undefined && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 font-500">
              {brief.daysLeft > 0 ? `${brief.daysLeft} days left` : 'Completed'}
            </p>
            <p className="text-xs text-slate-500 font-500">
              {brief.progress || 0}%
            </p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-full transition-all"
              style={{ width: `${brief.progress || 0}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
