import { useState, useRef, useEffect } from 'react';
import type { Highlight } from '@pulp/shared';
import { Button } from '../../ui/Button';
import { useUpdateHighlight, useDeleteHighlight } from '../../../hooks/useHighlights';

interface HighlightEditPopupProps {
  highlight: Highlight;
  noteId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function HighlightEditPopup({ highlight, noteId, position, onClose }: HighlightEditPopupProps) {
  const [note, setNote] = useState(highlight.note || '');
  const [isEditing, setIsEditing] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const updateHighlight = useUpdateHighlight(noteId);
  const deleteHighlight = useDeleteHighlight(noteId);

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
      onClose();
    } catch (error) {
      console.error('Failed to update highlight:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHighlight.mutateAsync(highlight.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete highlight:', error);
    }
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-bg-surface rounded-lg shadow-xl border border-text-secondary/20 overflow-hidden w-72"
      style={{
        left: Math.max(10, Math.min(position.x - 144, window.innerWidth - 300)),
        top: position.y,
      }}
    >
      {/* Highlighted text preview */}
      <div className="p-3 border-b border-text-secondary/20">
        <p className="text-xs text-text-secondary mb-1">Highlighted text:</p>
        <p className="text-sm text-text-primary line-clamp-3 italic">
          &ldquo;{highlight.text.slice(0, 150)}{highlight.text.length > 150 ? '...' : ''}&rdquo;
        </p>
      </div>

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
              onClick={handleDelete}
              disabled={deleteHighlight.isPending}
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <textarea
            ref={inputRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            className="w-full h-20 p-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary resize-none focus:outline-none focus:border-accent-primary"
          />

          <div className="flex gap-2 mt-2">
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
    </div>
  );
}
