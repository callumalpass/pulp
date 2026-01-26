import { useEffect } from 'react';
import type { LiteratureNote } from '@pulp/shared';
import { MetadataPaneHeader } from './MetadataPaneHeader';
import { MetadataSection } from './MetadataSection';
import {
  AuthorField,
  DateField,
  LinkField,
  ProgressField,
  RawYamlView,
  WikilinkField,
} from './fields';

interface MetadataPaneMobileProps {
  note: LiteratureNote;
  onClose: () => void;
}

/**
 * Mobile bottom sheet variant of the metadata pane.
 * Approximately 80% height with scrollable content.
 */
export function MetadataPaneMobile({ note, onClose }: MetadataPaneMobileProps) {
  // Lock body scroll when open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const csl = note.frontmatter as Record<string, unknown>;

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-bottom-sheet-backdrop animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className="metadata-pane-mobile animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label={`Metadata for ${note.title}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-text-secondary/30 rounded-full" />
        </div>

        {/* Header */}
        <MetadataPaneHeader note={note} onClose={onClose} />

        {/* Scrollable content */}
        <div className="metadata-pane-content overflow-y-auto flex-1 pb-safe">
          {/* Publication Info */}
          <MetadataSection
            id="publication"
            title="Publication Info"
            icon={<PublisherIcon />}
            defaultExpanded
          >
            {csl.publisher && (
              <div className="metadata-field">
                <span className="metadata-field-label">Publisher</span>
                <span className="metadata-field-value">{String(csl.publisher)}</span>
              </div>
            )}
            {csl['publisher-place'] && (
              <div className="metadata-field">
                <span className="metadata-field-label">Location</span>
                <span className="metadata-field-value">{String(csl['publisher-place'])}</span>
              </div>
            )}
            <DateField date={csl.issued as never} label="Published" />
            {csl.edition && (
              <div className="metadata-field">
                <span className="metadata-field-label">Edition</span>
                <span className="metadata-field-value">{String(csl.edition)}</span>
              </div>
            )}
            {csl.volume && (
              <div className="metadata-field">
                <span className="metadata-field-label">Volume</span>
                <span className="metadata-field-value">{String(csl.volume)}</span>
              </div>
            )}
            {csl.issue && (
              <div className="metadata-field">
                <span className="metadata-field-label">Issue</span>
                <span className="metadata-field-value">{String(csl.issue)}</span>
              </div>
            )}
            {csl.page && (
              <div className="metadata-field">
                <span className="metadata-field-label">Pages</span>
                <span className="metadata-field-value">{String(csl.page)}</span>
              </div>
            )}
            {csl.language && (
              <div className="metadata-field">
                <span className="metadata-field-label">Language</span>
                <span className="metadata-field-value">{String(csl.language)}</span>
              </div>
            )}
            <AuthorField authors={csl.translator as never} label="Translator" />
            <LinkField value={csl.ISBN as string || null} label="ISBN" type="isbn" />
            <LinkField value={csl.DOI as string || null} label="DOI" type="doi" />
          </MetadataSection>

          {/* Reading Progress */}
          <MetadataSection
            id="progress"
            title="Reading Progress"
            icon={<ProgressIcon />}
            defaultExpanded
          >
            <ProgressField
              progress={note.progress}
              totalPages={note.totalPages}
              lastRead={note.lastRead}
              readingStats={note.readingStats}
            />
          </MetadataSection>

          {/* Links & Source */}
          <MetadataSection
            id="links"
            title="Links & Source"
            icon={<LinkIcon />}
          >
            <div className="metadata-field">
              <span className="metadata-field-label">Source File</span>
              <span className="metadata-field-value text-xs font-mono truncate">
                {note.sourceRelative}
              </span>
            </div>
            <WikilinkField value={csl.author as string || null} label="Author Links" />
            <LinkField value={csl.URL as string || null} label="URL" type="url" />
          </MetadataSection>

          {/* Tags & Collections */}
          {(note.tags.length > 0 || note.collections.length > 0) && (
            <MetadataSection
              id="tags"
              title="Tags & Collections"
              icon={<TagIcon />}
            >
              {note.collections.length > 0 && (
                <div className="metadata-field">
                  <span className="metadata-field-label">Collections</span>
                  <div className="metadata-tag-list">
                    {note.collections.map((collection) => (
                      <span key={collection} className="metadata-tag metadata-tag-collection">
                        {collection}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {note.tags.length > 0 && (
                <div className="metadata-field">
                  <span className="metadata-field-label">Tags</span>
                  <div className="metadata-tag-list">
                    {note.tags.map((tag) => (
                      <span key={tag} className="metadata-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </MetadataSection>
          )}

          {/* Raw Frontmatter */}
          <MetadataSection
            id="raw"
            title="Raw Frontmatter"
            icon={<CodeIcon />}
          >
            <RawYamlView frontmatter={note.frontmatter} />
          </MetadataSection>
        </div>
      </div>
    </>
  );
}

function PublisherIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
