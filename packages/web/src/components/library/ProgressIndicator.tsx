import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface ProgressIndicatorProps {
  progress: number;
  showLabel?: boolean;
  className?: string;
  /** Height class for the progress bar (default: h-1) */
  height?: string;
  /** Whether to animate the initial fill on mount */
  animateOnMount?: boolean;
}

export function ProgressIndicator({
  progress,
  showLabel = false,
  className,
  height = 'h-1',
  animateOnMount = true,
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

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className={clsx('flex-1 bg-bg-deep rounded-full overflow-hidden', height)}>
        <div
          className="h-full bg-accent-primary transition-all duration-500 ease-out"
          style={{ width: `${displayedProgress}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
