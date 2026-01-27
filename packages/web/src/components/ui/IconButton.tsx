import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual size of the button - all sizes maintain 44px touch target on touch devices */
  size?: 'sm' | 'md' | 'lg';
  /** Button style variant */
  variant?: 'ghost' | 'filled' | 'outline';
  /** Whether the button is in an active/pressed state */
  active?: boolean;
  /** Accessible label - required for icon-only buttons */
  'aria-label': string;
}

/**
 * IconButton - A button designed for icons with proper touch targets.
 * All sizes maintain a minimum 44x44px touch target on touch devices (mobile).
 * On desktop, visual sizes can be smaller but remain easily clickable.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({
    className,
    size = 'md',
    variant = 'ghost',
    active = false,
    disabled,
    children,
    ...props
  }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        aria-disabled={disabled}
        className={clsx(
          // Base styles
          'relative inline-flex items-center justify-center rounded-lg',
          'transition-all duration-150 ease-out',
          'select-none touch-manipulation',
          '-webkit-tap-highlight-color-transparent',

          // Focus styles
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep',

          // Touch target - always at least 44x44 on touch devices
          'min-w-[44px] min-h-[44px]',

          // Visual sizes (actual visual appearance)
          {
            'w-8 h-8 md:min-w-[32px] md:min-h-[32px]': size === 'sm',
            'w-10 h-10 md:min-w-[40px] md:min-h-[40px]': size === 'md',
            'w-12 h-12 md:min-w-[48px] md:min-h-[48px]': size === 'lg',
          },

          // Variant styles
          {
            // Ghost - transparent background, subtle hover
            'text-text-secondary hover:text-text-primary hover:bg-bg-deep/80': variant === 'ghost' && !active,
            'bg-accent-primary/20 text-accent-primary': variant === 'ghost' && active,

            // Filled - solid background
            'bg-bg-surface text-text-primary border border-subtle hover:bg-bg-surface/80 hover:border-accent-primary/30': variant === 'filled' && !active,
            'bg-accent-primary/20 text-accent-primary border border-accent-primary/30': variant === 'filled' && active,

            // Outline - border only
            'border border-text-secondary/30 text-text-secondary hover:border-accent-primary hover:text-accent-primary': variant === 'outline' && !active,
            'border border-accent-primary text-accent-primary': variant === 'outline' && active,
          },

          // Disabled styles
          disabled && 'opacity-50 cursor-not-allowed',

          // Active (pressed) state
          !disabled && 'active:scale-95 active:transition-transform active:duration-75',

          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
