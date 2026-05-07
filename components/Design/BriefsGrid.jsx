'use client';

import BriefCard from './BriefCard';

export default function BriefsGrid({ briefs = [], onBriefClick }) {
  if (briefs.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-slate-600 font-400">
          No briefs found. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {briefs.map((brief) => (
        <BriefCard
          key={brief.id}
          brief={brief}
          onClick={() => onBriefClick?.(brief.id)}
        />
      ))}
    </div>
  );
}
