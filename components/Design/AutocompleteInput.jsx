'use client';

import { useState, useRef, useEffect } from 'react';

export default function AutocompleteInput({
  label,
  placeholder,
  options = [],
  value = '',
  onChange,
  onSelect,
  error,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const filtered = options.filter((opt) =>
      opt.toLowerCase().includes(inputValue.toLowerCase())
    );
    setFilteredOptions(filtered);
  }, [inputValue, options]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);
    setOpen(true);
  };

  const handleSelect = (option) => {
    setInputValue(option);
    onChange?.(option);
    onSelect?.(option);
    setOpen(false);
  };

  const handleClickOutside = (e) => {
    if (containerRef.current && !containerRef.current.contains(e.target)) {
      setOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-500 text-slate-700 mb-2">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-4 py-2.5 rounded-lg border text-sm font-400
            transition-all focus:outline-none focus:ring-2
            ${
              error
                ? 'border-red-300 focus:ring-red-500 focus:border-transparent'
                : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
            }
            ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'}
          `}
        />

        {/* Dropdown Arrow */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          ▼
        </div>
      </div>

      {/* Dropdown Menu */}
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.map((option, index) => (
              <button
                key={index}
                onClick={() => handleSelect(option)}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-slate-900 text-sm font-400 transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-600 text-xs font-500 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
