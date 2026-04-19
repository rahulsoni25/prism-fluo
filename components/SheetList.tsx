import React from 'react';
import { SheetMeta } from '@/types/dataset';
import { FileText, Search, BarChart2, ArrowRight } from 'lucide-react';

interface SheetListProps {
  sheets: SheetMeta[];
  onSelect: (sheet: SheetMeta) => void;
  selectedSheetName?: string;
}

export default function SheetList({ sheets, onSelect, selectedSheetName }: SheetListProps) {
  if (sheets.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-8">
      {sheets.map((sheet) => (
        <div 
          key={sheet.sheetName}
          onClick={() => onSelect(sheet)}
          className={`
            cursor-pointer group relative overflow-hidden rounded-2xl p-6 transition-all duration-300
            ${selectedSheetName === sheet.sheetName 
              ? 'bg-blue-600 text-white shadow-xl scale-105' 
              : 'bg-white border border-slate-100 hover:border-blue-200 hover:shadow-lg shadow-sm text-slate-900'}
          `}
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`
              p-3 rounded-xl transition-colors
              ${selectedSheetName === sheet.sheetName ? 'bg-white/20' : 'bg-blue-50 text-blue-600'}
            `}>
              {sheet.type === 'gwi_time_spent' ? <BarChart2 size={24} /> : <Search size={24} />}
            </div>
            <div className={`
              text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full
              ${selectedSheetName === sheet.sheetName ? 'bg-white/30' : 'bg-slate-100 text-slate-500'}
            `}>
              {sheet.type.replace('_', ' ')}
            </div>
          </div>

          <h3 className="text-lg font-bold mb-2 group-hover:translate-x-1 transition-transform">
            {sheet.question || sheet.sheetName}
          </h3>
          
          <p className={`
            text-sm mb-6 line-clamp-2
            ${selectedSheetName === sheet.sheetName ? 'text-blue-100' : 'text-slate-500'}
          `}>
            {sheet.description || `Automated analysis of "${sheet.sheetName}" using PRISM engines.`}
          </p>

          <div className="flex items-center text-xs font-bold uppercase tracking-widest">
            {selectedSheetName === sheet.sheetName ? 'Active Analysis' : 'Generate Insight'}
            <ArrowRight size={14} className="ml-2 group-hover:translate-x-2 transition-transform" />
          </div>

          {/* Decorative background glow */}
          <div className={`
            absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-3xl opacity-20
            ${selectedSheetName === sheet.sheetName ? 'bg-white' : 'bg-blue-200'}
          `} />
        </div>
      ))}
    </div>
  );
}
