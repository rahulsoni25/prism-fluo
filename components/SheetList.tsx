import React from 'react';
import { SheetMeta } from '@/types/dataset';
import { Search, BarChart2, ArrowRight, Zap } from 'lucide-react';

interface SheetListProps {
  sheets: SheetMeta[];
  onSelect: (sheet: SheetMeta) => void;
  selectedSheetName?: string;
}

export default function SheetList({ sheets, onSelect, selectedSheetName }: SheetListProps) {
  if (sheets.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-10">
      {sheets.map((sheet) => (
        <div 
          key={sheet.sheetName}
          onClick={() => onSelect(sheet)}
          className={`
            cursor-pointer group relative overflow-hidden rounded-[24px] p-8 transition-all duration-500
            ${selectedSheetName === sheet.sheetName 
              ? 'bg-[#0F172A] text-white shadow-2xl scale-[1.02] border-none' 
              : 'bg-white border border-[#E2E8F0] hover:border-blue-400 hover:shadow-2xl text-slate-900'}
          `}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between mb-6">
            <div className={`
              p-4 rounded-2xl transition-all duration-300
              ${selectedSheetName === sheet.sheetName 
                ? 'bg-blue-600/20 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.2)]' 
                : 'bg-blue-50 text-blue-600'}
            `}>
              {sheet.type === 'gwi_time_spent' ? <BarChart2 size={28} /> : <Search size={28} />}
            </div>
            
            <div className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest
              ${selectedSheetName === sheet.sheetName ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-100 text-slate-500'}
            `}>
              <Zap size={10} />
              {sheet.type.replace('_', ' ')}
            </div>
          </div>

          <h3 className="text-xl font-black mb-3 leading-tight group-hover:translate-x-1 transition-transform">
            {sheet.question || sheet.sheetName}
          </h3>
          
          <p className={`
            text-[14px] mb-8 leading-relaxed line-clamp-2
            ${selectedSheetName === sheet.sheetName ? 'text-slate-400' : 'text-slate-500'}
          `}>
            {sheet.description || `Automated analysis of "${sheet.sheetName}" using PRISM engines.`}
          </p>

          <div className="flex items-center justify-between">
            <div className={`
              text-[11px] font-bold uppercase tracking-widest flex items-center
              ${selectedSheetName === sheet.sheetName ? 'text-blue-400' : 'text-blue-600'}
            `}>
              {selectedSheetName === sheet.sheetName ? 'ACTIVE LEAD' : 'ANALYZE LEAD'}
              <ArrowRight size={14} className="ml-2 group-hover:translate-x-2 transition-transform" />
            </div>
          </div>

          {/* Decorative background glow */}
          <div className={`
            absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-[60px] opacity-20 transition-all duration-500
            ${selectedSheetName === sheet.sheetName ? 'bg-blue-500' : 'bg-blue-200 group-hover:bg-blue-400'}
          `} />
        </div>
      ))}
    </div>
  );
}
