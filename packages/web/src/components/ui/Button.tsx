import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconPosition = 'left',
    children,
    disabled,
    ...props
  }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center font-semibold gap-2',
          'transition-all duration-200 ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep',
          'select-none touch-manipulation',
          '-webkit-tap-highlight-color-transparent',
          isDisabled && 'opacity-50 cursor-not-allowed',
          !isDisabled && 'active:scale-[0.96] active:transition-transform active:duration-75',
          {
            'bg-gradient-to-br from-accent-primary to-accent-primary/90 text-bg-deep focus-visible:ring-accent-primary': variant === 'primary',
            'bg-bg-surface text-text-primary border border-white/[0.08] focus-visible:ring-accent-primary': variant === 'secondary',
            'bg-transparent text-text-primary focus-visible:ring-accent-primary': variant === 'ghost',
            'bg-gradient-to-br from-red-500 to-red-600 text-white focus-visible:ring-red-500': variant === 'danger',
          },
          !isDisabled && {
            'hover:from-accent-primary/95 hover:to-accent-primary/85 hover:shadow-lg hover:shadow-accent-primary/30 hover:-translate-y-0.5': variant === 'primary',
            'hover:bg-bg-surface/80 hover:border-accent-primary/30 hover:shadow-md hover:shadow-black/10': variant === 'secondary',
            'hover:bg-bg-surface/60 hover:text-accent-primary': variant === 'ghost',
            'hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5': variant === 'danger',
          },
          {
            'min-h-[44px] px-4 py-2.5 text-sm rounded-xl': size === 'sm',
            'min-h-[48px] px-5 py-3 text-base rounded-xl': size === 'md',
            'min-h-[52px] px-7 py-3.5 text-lg rounded-2xl': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading && (
          <LoadingSpinner className={clsx(
            size === 'sm' && 'w-4 h-4',
            size === 'md' && 'w-5 h-5',
            size === 'lg' && 'w-6 h-6'
          )} />
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
        <span className={loading ? 'opacity-0 absolute' : undefined}>{children}</span>
        {loading && <span className="sr-only">Loading...</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
