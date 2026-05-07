'use client';

import { forwardRef } from 'react';

const FormSelect = forwardRef(
  (
    {
      label,
      placeholder,
      options = [],
      value = '',
      onChange,
      error,
      disabled = false,
      required = false,
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

        <select
          ref={ref}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`
            w-full px-4 py-2.5 rounded-lg border text-sm font-400 appearance-none bg-no-repeat
            transition-all focus:outline-none focus:ring-2
            ${
              error
                ? 'border-red-300 focus:ring-red-500 focus:border-transparent'
                : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
            }
            ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'}
          `}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 1rem center',
            backgroundRepeat: 'no-repeat',
            paddingRight: '2.5rem',
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value || option}
              value={option.value || option}
            >
              {option.label || option}
            </option>
          ))}
        </select>

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

FormSelect.displayName = 'FormSelect';

export default FormSelect;
