'use client';

const Badge = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = '',
  ...props
}) => {
  const variants = {
    default: 'bg-slate-100 text-slate-900 border border-slate-200',
    primary: 'bg-blue-100 text-blue-900 border border-blue-300',
    success: 'bg-green-100 text-green-900 border border-green-300',
    warning: 'bg-amber-100 text-amber-900 border border-amber-300',
    error: 'bg-red-100 text-red-900 border border-red-300',
    purple: 'bg-purple-100 text-purple-900 border border-purple-300',
    orange: 'bg-orange-100 text-orange-900 border border-orange-300',
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs font-500',
    md: 'px-3 py-1.5 text-xs font-500',
    lg: 'px-4 py-2 text-sm font-600',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-lg
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </span>
  );
};

export default Badge;
