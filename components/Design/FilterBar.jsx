'use client';

import { useState } from 'react';

export default function FilterBar({ filters = [], onFilterChange }) {
  const [activeFilters, setActiveFilters] = useState({});

  const handleFilterClick = (filterKey, value) => {
    const newFilters = { ...activeFilters };
    if (newFilters[filterKey] === value) {
      delete newFilters[filterKey];
    } else {
      newFilters[filterKey] = value;
    }
    setActiveFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-8">
      <div className="flex flex-wrap items-center gap-3">
        {filters.map((filter) => (
          <div key={filter.key} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-500 uppercase tracking-tight">
              {filter.label}
            </span>
            <div className="flex gap-2">
              {filter.options.map((option) => {
                const isActive = activeFilters[filter.key] === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleFilterClick(filter.key, option.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-500 transition-all ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setActiveFilters({});
              onFilterChange?.({});
            }}
            className="ml-auto text-xs text-slate-500 hover:text-slate-700 font-500 underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
