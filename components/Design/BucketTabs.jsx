'use client';

import { useState } from 'react';

export default function BucketTabs({ buckets = [], onBucketChange }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabClick = (index) => {
    setActiveTab(index);
    onBucketChange?.(buckets[index]);
  };

  const getBucketColor = (bucket) => {
    switch (bucket.toLowerCase()) {
      case 'content':
        return 'text-blue-600';
      case 'commerce':
        return 'text-green-600';
      case 'communication':
        return 'text-purple-600';
      case 'culture':
        return 'text-orange-600';
      default:
        return 'text-slate-600';
    }
  };

  const getBucketBgColor = (bucket, isActive) => {
    if (!isActive) return '';
    switch (bucket.toLowerCase()) {
      case 'content':
        return 'bg-blue-50 border-blue-300';
      case 'commerce':
        return 'bg-green-50 border-green-300';
      case 'communication':
        return 'bg-purple-50 border-purple-300';
      case 'culture':
        return 'bg-orange-50 border-orange-300';
      default:
        return 'bg-slate-50 border-slate-300';
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-8 p-2 bg-slate-50 rounded-xl border border-slate-200">
      {buckets.map((bucket, index) => (
        <button
          key={index}
          onClick={() => handleTabClick(index)}
          className={`flex-1 px-4 py-3 rounded-lg font-600 text-sm transition-all ${
            activeTab === index
              ? `border border-slate-300 bg-white shadow-sm ${getBucketColor(bucket)}`
              : `text-slate-600 border border-transparent hover:bg-slate-100`
          }`}
        >
          {bucket}
        </button>
      ))}
    </div>
  );
}
