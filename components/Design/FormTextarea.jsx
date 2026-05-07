'use client';

import { forwardRef } from 'react';

const FormTextarea = forwardRef(
  (
    {
      label,
      placeholder,
      value = '',
      onChange,
      error,
      disabled = false,
      required = false,
      rows = 4,
      helperText,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-500 text-slate-700 mb-2">
            {label}
            {required && <span className="text-red-600 ml-1">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={`
            w-full px-4 py-2.5 rounded-lg border text-sm font-400
            transition-all focus:outline-none focus:ring-2 resize-none
            ${
              error
                ? 'border-red-300 focus:ring-red-500 focus:border-transparent'
                : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
            }
            ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'}
          `}
          {...props}
        />

        {error && (
          <p className="text-red-600 text-xs font-500 mt-1.5">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p className="text-slate-500 text-xs font-400 mt-1.5">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormTextarea.displayName = 'FormTextarea';

export default FormTextarea;
