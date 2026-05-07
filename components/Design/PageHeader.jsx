'use client';

export default function PageHeader({ title, description, action }) {
  return (
    <div className="border-b border-slate-200 pb-6 mb-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-700 text-slate-900 mb-2">
            {title}
          </h1>
          {description && (
            <p className="text-slate-600 font-400 text-base">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
