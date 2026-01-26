import { forwardRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  elevated?: boolean;
  interactive?: boolean;
  as?: 'div' | 'article' | 'section';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({
    className,
    hover = false,
    elevated = false,
    interactive = false,
    as: Component = 'div',
    children,
    ...props
  }, ref) => {
    // Use GPU-accelerated transforms for smoother animations
    const hoverClasses = hover || interactive ? [
      'cursor-pointer',
      'will-change-transform',
      // Use transform for GPU acceleration instead of top/margin
      'transition-[transform,box-shadow,border-color] duration-200 ease-out',
      'hover:translate-y-[-4px] hover:scale-[1.015]',
      'hover:shadow-xl hover:shadow-accent-primary/10',
      'hover:border-accent-primary/25',
      // Active/pressed state for tactile feedback
      'active:scale-[0.98] active:translate-y-0',
      'active:transition-transform active:duration-75',
    ] : [];

    return (
      <Component
        ref={ref}
        className={clsx(
          'bg-bg-surface rounded-xl overflow-hidden',
          'border border-white/[0.06]',
          'shadow-sm shadow-black/10',
          elevated && 'shadow-lg shadow-black/20',
          hoverClasses,
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';
