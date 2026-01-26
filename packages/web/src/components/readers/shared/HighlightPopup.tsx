import { useState, useRef, useEffect, useCallback } from 'react';
import type { TextSelection } from '@pulp/shared';
import { Button } from '../../ui/Button';
import { useCreateHighlight } from '../../../hooks/useHighlights';
import { useToast } from '../../../contexts/ToastContext';
import { DictionaryDefinition } from './DictionaryDefinition';

interface BaseSelection {
  text: string;
  page: number;
  position: { x: number; y: number };
}

interface PDFSelection extends BaseSelection {
  selection: TextSelection;
  pageLabel?: string;
}

interface EPUBSelection extends BaseSelection {
  cfi: string;
}

type Selection = PDFSelection | EPUBSelection;

interface HighlightPopupProps {
  selection: Selection;
  noteId: string;
  onClose: () => void;
  type?: 'pdf' | 'epub';
  cfi?: string; // Kept for backwards compatibility
}

type SaveState = 'idle' | 'saving' | 'error';

export function HighlightPopup({ selection, noteId, onClose, type = 'pdf', cfi }: HighlightPopupProps) {
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const createHighlight = useCreateHighlight(noteId);
  const { showToast } = useToast();

  // Focus input when note mode is opened
  useEffect(() => {
    if (showNoteInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNoteInput]);

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

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    setErrorMessage(null);

    try {
      if (type === 'pdf' && 'selection' in selection) {
        await createHighlight.mutateAsync({
          type: 'pdf',
          page: selection.page,
          pageLabel: selection.pageLabel,
          selection: selection.selection,
          text: selection.text,
          note: note || undefined,
        });
      } else if (type === 'epub') {
        const epubCfi = cfi || ('cfi' in selection ? selection.cfi : undefined);
        if (!epubCfi) {
          setSaveState('error');
          setErrorMessage('Missing EPUB position data');
          return;
        }

        await createHighlight.mutateAsync({
          type: 'epub',
          cfi: epubCfi,
          text: selection.text,
          note: note || undefined,
        });
      }

      // Clear selection and close on success
      window.getSelection()?.removeAllRanges();
      showToast('Highlight saved', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to save highlight:', error);
      setSaveState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save highlight'
      );
      // Don't close popup - let user retry
    }
  }, [type, selection, cfi, note, createHighlight, showToast, onClose]);

  const handleQuickHighlight = () => {
    handleSave();
  };

  const handleAddNote = () => {
    setShowNoteInput(true);
    // Reset error state when switching to note mode
    setSaveState('idle');
    setErrorMessage(null);
  };

  const handleRetry = () => {
    handleSave();
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-bg-surface rounded-lg shadow-xl border border-text-secondary/20 overflow-hidden highlight-popup-enter"
      style={{
        left: Math.max(10, Math.min(selection.position.x - 100, window.innerWidth - 220)),
        top: selection.position.y,
      }}
    >
      {!showNoteInput ? (
        <>
          {/* Error state banner */}
          {saveState === 'error' && errorMessage && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <ErrorIcon />
                <span className="flex-1 truncate">{errorMessage}</span>
              </div>
              <button
                onClick={handleRetry}
                className="mt-1 text-xs text-red-400 hover:text-red-300 underline"
              >
                Try again
              </button>
            </div>
          )}
          <div className="flex">
            <button
              onClick={handleQuickHighlight}
              className="flex items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? (
                <SpinnerIcon />
              ) : (
                <HighlightIcon />
              )}
              {saveState === 'saving' ? 'Saving...' : 'Highlight'}
            </button>
            <div className="w-px bg-text-secondary/20" />
            <button
              onClick={handleAddNote}
              className="flex items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-accent-primary/20 transition-colors"
              disabled={saveState === 'saving'}
            >
              <NoteIcon />
              Note
            </button>
            <div className="w-px bg-text-secondary/20" />
            <button
              onClick={onClose}
              className="flex items-center justify-center px-3 py-3 text-text-secondary hover:text-text-primary hover:bg-accent-primary/20 transition-colors"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <DictionaryDefinition text={selection.text} />
        </>
      ) : (
        <div className="w-64 p-3">
          {/* Error state in note mode */}
          {saveState === 'error' && errorMessage && (
            <div className="mb-2 px-2 py-1.5 bg-red-500/10 rounded border border-red-500/20">
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <ErrorIcon />
                <span className="flex-1">{errorMessage}</span>
              </div>
            </div>
          )}

          <p className="text-xs text-text-secondary mb-2 line-clamp-2 italic">
            &ldquo;{selection.text.slice(0, 100)}{selection.text.length > 100 ? '...' : ''}&rdquo;
          </p>

          <textarea
            ref={inputRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            className="w-full h-20 p-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary resize-none focus:outline-none focus:border-accent-primary"
            disabled={saveState === 'saving'}
          />

          <div className="flex gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="flex-1"
              disabled={saveState === 'saving'}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="flex-1"
            >
              {saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Retry' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.535a1 1 0 010 1.414l-7.778 7.778-2.122.707-1.414 1.414a1 1 0 01-1.414 0l-4.243-4.243a1 1 0 010-1.414l1.414-1.414.707-2.121 7.778-7.778a1 1 0 011.414 0l5.657 5.657z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
