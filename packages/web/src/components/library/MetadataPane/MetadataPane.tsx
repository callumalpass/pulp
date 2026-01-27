import { useEffect, useCallback, useState } from 'react';
import { useNote } from '../../../hooks/useNote';
import { useMobile } from '../../../hooks/useMobile';
import { useMetadataPane } from '../../../contexts/MetadataPaneContext';
import { usePreferencesStore } from '../../../stores/preferences';
import { MetadataPaneHeader } from './MetadataPaneHeader';
import { MetadataSection } from './MetadataSection';
import { MetadataPaneMobile } from './MetadataPaneMobile';
import {
  AuthorField,
  DateField,
  LinkField,
  ProgressField,
  RawYamlView,
  WikilinkField,
  SimpleField,
} from './fields';

/**
 * Main MetadataPane component that displays rich bibliographic metadata.
 * Renders as a slide-in panel on desktop and bottom sheet on mobile.
 */
export function MetadataPane() {
  const { selectedNoteId, isOpen, closePane } = useMetadataPane();
  const { data: note, isLoading } = useNote(selectedNoteId || undefined);
  const isMobile = useMobile();
  const { metadataPanelWidth, setMetadataPanelWidth } = usePreferencesStore();
  const [isResizing, setIsResizing] = useState(false);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePane();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePane]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = metadataPanelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.max(320, Math.min(500, startWidth + delta));
      setMetadataPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [metadataPanelWidth, setMetadataPanelWidth]);

  if (!isOpen) return null;

  // Loading state
  if (isLoading || !note) {
    return (
      <div
        className={`metadata-pane ${isResizing ? 'select-none' : ''}`}
        style={{ width: isMobile ? '100%' : `${metadataPanelWidth}px` }}
      >
        <div className="metadata-pane-loading">
          <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Mobile: use bottom sheet
  if (isMobile) {
    return <MetadataPaneMobile note={note} onClose={closePane} />;
  }

  // Desktop: slide-in panel
  const csl = note.frontmatter as Record<string, unknown>;

  return (
    <div
      className={`metadata-pane ${isResizing ? 'select-none' : ''}`}
      style={{ width: `${metadataPanelWidth}px` }}
    >
      {/* Resize handle */}
      <div
        className="metadata-pane-resize-handle"
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      />

      {/* Header */}
      <MetadataPaneHeader note={note} onClose={closePane} />

      {/* Scrollable content */}
      <div className="metadata-pane-content">
        {/* Publication Info */}
        <MetadataSection
          id="publication"
          title="Publication Info"
          icon={<PublisherIcon />}
          defaultExpanded
        >
          <SimpleField value={csl.publisher} label="Publisher" />
          <SimpleField value={csl['publisher-place']} label="Location" />
          <DateField date={csl.issued as never} label="Published" />
          <SimpleField value={csl.edition} label="Edition" />
          <SimpleField value={csl.volume} label="Volume" />
          <SimpleField value={csl.issue} label="Issue" />
          <SimpleField value={csl.page} label="Pages" />
          <SimpleField value={csl.language} label="Language" />
          <AuthorField authors={csl.translator as never} label="Translator" />
          <LinkField value={typeof csl.ISBN === 'string' ? csl.ISBN : null} label="ISBN" type="isbn" />
          <LinkField value={typeof csl.DOI === 'string' ? csl.DOI : null} label="DOI" type="doi" />
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
          <WikilinkField value={typeof csl.author === 'string' ? csl.author : null} label="Author Links" />
          <LinkField value={typeof csl.URL === 'string' ? csl.URL : null} label="URL" type="url" />
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
