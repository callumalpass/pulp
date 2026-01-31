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
    // Use the CSS-based .hover-lift class for hover effects. It uses
    // GPU-accelerated transforms and has a @media (hover: none) override
    // that disables the lift on touch devices, avoiding unwanted hover
    // jumps on tap. Tailwind hover:translate-y classes would bypass that
    // media query, so we avoid them here.
    const hoverClasses = hover || interactive ? [
      'cursor-pointer',
      'hover-lift',
      'hover:shadow-accent-primary/10',
      'hover:border-accent-primary/25',
    ] : [];

    return (
      <Component
        ref={ref}
        className={clsx(
          'bg-bg-surface rounded-xl overflow-hidden',
          'border border-subtle',
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
