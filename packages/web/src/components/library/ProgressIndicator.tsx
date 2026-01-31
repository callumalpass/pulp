import { useState, useEffect, memo } from 'react';
import { clsx } from 'clsx';

interface ProgressIndicatorProps {
  progress: number;
  showLabel?: boolean;
  className?: string;
  /** Height class for the progress bar (default: h-1) */
  height?: string;
  /** Whether to animate the initial fill on mount */
  animateOnMount?: boolean;
  /** Color variant */
  variant?: 'primary' | 'gradient';
}

export const ProgressIndicator = memo(function ProgressIndicator({
  progress,
  showLabel = false,
  className,
  height = 'h-1',
  animateOnMount = true,
  variant = 'primary',
}: ProgressIndicatorProps) {
  const percentage = Math.min(100, Math.max(0, progress));
  const [displayedProgress, setDisplayedProgress] = useState(animateOnMount ? 0 : percentage);

  // Animate progress on mount and when progress changes
  useEffect(() => {
    // Small delay to ensure CSS transition triggers
    const timer = setTimeout(() => {
      setDisplayedProgress(percentage);
    }, 50);
    return () => clearTimeout(timer);
  }, [percentage]);

  const isComplete = percentage >= 100;

  return (
    <div
      className={clsx('flex items-center gap-2', className)}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={isComplete ? 'Completed' : `${Math.round(percentage)}% complete`}
    >
      <div className={clsx('flex-1 rounded-full overflow-hidden', height === 'h-2' ? 'bg-text-secondary/15' : 'bg-text-secondary/10', height)}>
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-500 ease-out relative overflow-hidden',
            variant === 'gradient'
              ? 'bg-gradient-to-r from-accent-primary to-accent-secondary'
              : isComplete
                ? 'bg-accent-secondary'
                : 'bg-accent-primary',
            !isComplete && 'progress-shimmer'
          )}
          style={{ width: `${displayedProgress}%`, minWidth: displayedProgress > 0 ? (height === 'h-2' ? '16px' : '12px') : 0 }}
        />
      </div>
      {showLabel && (
        <span
          className={clsx(
            'text-xs whitespace-nowrap font-medium',
            isComplete ? 'text-accent-secondary' : 'text-text-secondary'
          )}
          aria-hidden="true"
        >
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
});
