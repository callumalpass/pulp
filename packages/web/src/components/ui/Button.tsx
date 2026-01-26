import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-medium transition-stoody',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-deep',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-accent-primary text-bg-deep hover:bg-opacity-90': variant === 'primary',
            'bg-bg-surface text-text-primary border border-text-secondary/20 hover:bg-opacity-80':
              variant === 'secondary',
            'bg-transparent text-text-primary hover:bg-bg-surface': variant === 'ghost',
          },
          {
            'px-3 py-1.5 text-sm rounded-lg': size === 'sm',
            'px-4 py-2 text-base rounded-md': size === 'md',
            'px-6 py-3 text-lg rounded-lg': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
