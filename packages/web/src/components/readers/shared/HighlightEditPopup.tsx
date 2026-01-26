import { useState, useRef, useEffect } from 'react';
import type { Highlight, PDFHighlight } from '@pulp/shared';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useUpdateHighlight, useDeleteHighlight } from '../../../hooks/useHighlights';
import { useToast } from '../../../contexts/ToastContext';
import { DictionaryDefinition } from './DictionaryDefinition';

function formatHighlightDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

interface HighlightEditPopupProps {
  highlight: Highlight;
  noteId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function HighlightEditPopup({ highlight, noteId, position, onClose }: HighlightEditPopupProps) {
  const [note, setNote] = useState(highlight.note || '');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const updateHighlight = useUpdateHighlight(noteId);
  const deleteHighlight = useDeleteHighlight(noteId);
  const { showToast } = useToast();

  // Focus input when editing mode is opened
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    try {
      await updateHighlight.mutateAsync({
        highlightId: highlight.id,
        data: { note: note || undefined },
      });
      showToast('Note saved', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to update highlight:', error);
      showToast('Failed to save note. Please try again.', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHighlight.mutateAsync(highlight.id);
      showToast('Highlight deleted', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to delete highlight:', error);
      showToast('Failed to delete highlight. Please try again.', 'error');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-bg-surface rounded-lg shadow-xl border border-text-secondary/20 overflow-hidden w-72 highlight-edit-popup-enter"
      style={{
        left: Math.max(10, Math.min(position.x - 144, window.innerWidth - 300)),
        top: position.y,
      }}
    >
      {/* Highlighted text preview with metadata */}
      <div className="p-3 border-b border-text-secondary/20">
        {/* Metadata row: page/location and date */}
        <div className="flex items-center justify-between mb-2 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            {highlight.type === 'pdf' ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>
                  Page {(highlight as PDFHighlight).pageLabel ?? (highlight as PDFHighlight).page}
                </span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>EPUB</span>
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5" title={new Date(highlight.createdAt).toLocaleString()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatHighlightDate(highlight.createdAt)}
          </span>
        </div>

        <p className="text-xs text-text-secondary mb-1">Highlighted text:</p>
        <p className="text-sm text-text-primary line-clamp-3 italic">
          &ldquo;{highlight.text.slice(0, 150)}{highlight.text.length > 150 ? '...' : ''}&rdquo;
        </p>
      </div>

      {/* Dictionary definition for single words */}
      <DictionaryDefinition text={highlight.text} />

      {!isEditing ? (
        <div className="p-3">
          {highlight.note ? (
            <div className="mb-3">
              <p className="text-xs text-text-secondary mb-1">Note:</p>
              <p className="text-sm text-text-primary">{highlight.note}</p>
            </div>
          ) : (
            <p className="text-sm text-text-secondary mb-3 italic">No note added</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="flex-1"
            >
              {highlight.note ? 'Edit Note' : 'Add Note'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteHighlight.isPending}
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
            >
              {deleteHighlight.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <textarea
            ref={inputRef}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 2000))}
            placeholder="Add a note..."
            className="w-full h-20 p-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary resize-none focus:outline-none focus:border-accent-primary"
            maxLength={2000}
            aria-describedby="edit-note-char-count"
          />
          <div id="edit-note-char-count" className="flex justify-end mt-1">
            <span className={`text-xs ${note.length > 1800 ? 'text-yellow-500' : 'text-text-secondary/60'} ${note.length >= 2000 ? '!text-red-400' : ''}`}>
              {note.length}/2000
            </span>
          </div>

          <div className="flex gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNote(highlight.note || '');
                setIsEditing(false);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={updateHighlight.isPending}
              className="flex-1"
            >
              {updateHighlight.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Highlight"
        message="Are you sure you want to delete this highlight? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
