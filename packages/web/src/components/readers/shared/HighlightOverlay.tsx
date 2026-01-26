import type { Highlight, PDFHighlight } from '@pulp/shared';

interface HighlightListProps {
  highlights: Highlight[];
  onHighlightClick?: (highlight: Highlight) => void;
  onHighlightDelete?: (highlightId: string) => void;
}

export function HighlightList({ highlights, onHighlightClick, onHighlightDelete }: HighlightListProps) {
  if (highlights.length === 0) {
    return (
      <div className="p-4 text-center text-text-secondary">
        No highlights yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className="bg-bg-deep rounded-lg p-3 cursor-pointer hover:bg-bg-deep/80 transition-colors group"
          onClick={() => onHighlightClick?.(highlight)}
        >
          <p className="text-sm text-text-primary line-clamp-3 italic">
            &ldquo;{highlight.text}&rdquo;
          </p>

          {highlight.note && (
            <p className="text-sm text-text-secondary mt-2">
              {highlight.note}
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-text-secondary">
              {highlight.type === 'pdf'
                ? `Page ${(highlight as PDFHighlight).page}`
                : 'EPUB location'}
            </span>

            {onHighlightDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onHighlightDelete(highlight.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-400 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
