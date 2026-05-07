'use client';

const Chip = ({
  children,
  onRemove,
  variant = 'default',
  icon,
  className = '',
  ...props
}) => {
  const variants = {
    default: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    blue: 'bg-blue-100 text-blue-900 hover:bg-blue-200',
    green: 'bg-green-100 text-green-900 hover:bg-green-200',
    purple: 'bg-purple-100 text-purple-900 hover:bg-purple-200',
    orange: 'bg-orange-100 text-orange-900 hover:bg-orange-200',
  };

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-500
        transition-all ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {icon && <span className="text-base">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 text-base leading-none hover:opacity-70 transition-opacity"
          aria-label={`Remove ${children}`}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Chip;
