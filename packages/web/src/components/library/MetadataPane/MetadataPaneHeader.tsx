import type { LiteratureNote } from '@pulp/shared';
import { api } from '../../../lib/api';

interface MetadataPaneHeaderProps {
  note: LiteratureNote;
  onClose: () => void;
}

/**
 * Header component for the metadata pane.
 * Displays title, author, type badge, and cover thumbnail.
 */
export function MetadataPaneHeader({ note, onClose }: MetadataPaneHeaderProps) {
  return (
    <div className="metadata-pane-header">
      <div className="flex items-start gap-4">
        {/* Cover thumbnail */}
        {note.cover ? (
          <img
            src={api.covers.getUrl(note.id)}
            alt={note.title}
            className="metadata-header-cover"
          />
        ) : (
          <div className="metadata-header-cover-placeholder">
            <TypeIcon type={note.sourceType} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h2 className="metadata-header-title">{note.title}</h2>

          {/* Author */}
          {note.author && (
            <p className="metadata-header-author">{note.author}</p>
          )}

          {/* Type badge */}
          <span className={`metadata-type-badge metadata-type-badge-${note.sourceType}`}>
            {note.sourceType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="metadata-close-btn"
        title="Close (Esc)"
        aria-label="Close metadata pane"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function TypeIcon({ type }: { type: 'pdf' | 'epub' }) {
  if (type === 'pdf') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
