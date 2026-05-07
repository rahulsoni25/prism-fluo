'use client';

import { useState, useEffect } from 'react';

export default function ProcessingScreen({ fileName, progress = 0, onComplete }) {
  const [animationProgress, setAnimationProgress] = useState(progress);

  useEffect(() => {
    setAnimationProgress(progress);
  }, [progress]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white mb-6 mx-auto">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6" />
            </svg>
          </div>
          <h1 className="text-3xl font-700 text-slate-900 mb-2">
            Processing your data
          </h1>
          <p className="text-slate-600 font-400 text-base">
            {fileName}
          </p>
        </div>

        {/* Platform Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[
            { name: 'Content', icon: '📝', status: progress > 20 ? 'done' : progress > 0 ? 'processing' : 'pending' },
            { name: 'Commerce', icon: '🛒', status: progress > 50 ? 'done' : progress > 30 ? 'processing' : 'pending' },
            { name: 'Communication', icon: '💬', status: progress > 80 ? 'done' : progress > 60 ? 'processing' : 'pending' },
          ].map((platform, index) => (
            <div
              key={index}
              className={`rounded-xl border p-6 text-center transition-all ${
                platform.status === 'done'
                  ? 'bg-green-50 border-green-300'
                  : platform.status === 'processing'
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="text-3xl mb-3">{platform.icon}</div>
              <h3 className="font-600 text-slate-900 text-sm mb-2">
                {platform.name}
              </h3>
              <p className={`text-xs font-500 ${
                platform.status === 'done'
                  ? 'text-green-700'
                  : platform.status === 'processing'
                  ? 'text-blue-700'
                  : 'text-slate-500'
              }`}>
                {platform.status === 'done'
                  ? '✓ Complete'
                  : platform.status === 'processing'
                  ? '⟳ Processing'
                  : 'Pending'}
              </p>
            </div>
          ))}
        </div>

        {/* Progress Bars */}
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="space-y-6">
            {[
              { label: 'Data Import', value: Math.min(animationProgress, 30) },
              { label: 'Analysis', value: Math.max(0, Math.min(animationProgress - 30, 40)) },
              { label: 'Insights', value: Math.max(0, Math.min(animationProgress - 70, 30)) },
            ].map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-500 text-slate-700">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500 font-500">
                    {Math.round(item.value)}%
                  </p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-purple-600 h-full transition-all duration-300"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Overall Progress */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-sm font-600 text-slate-900 mb-3">
              Overall Progress
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-600 to-emerald-600 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${animationProgress}%` }}
                  />
                </div>
              </div>
              <span className="text-lg font-700 text-slate-900 min-w-fit">
                {Math.round(animationProgress)}%
              </span>
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div className="mt-8 text-center">
          <p className="text-slate-600 font-400 text-sm">
            {animationProgress < 100
              ? `Processing... This usually takes 2-5 minutes`
              : 'Processing complete! Redirecting...'}
          </p>
        </div>
      </div>
    </div>
  );
}
