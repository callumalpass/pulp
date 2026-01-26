import { clsx } from 'clsx';

interface ProgressIndicatorProps {
  progress: number;
  showLabel?: boolean;
  className?: string;
}

export function ProgressIndicator({ progress, showLabel = false, className }: ProgressIndicatorProps) {
  const percentage = Math.min(100, Math.max(0, progress));

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className="flex-1 h-1 bg-bg-deep rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
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
