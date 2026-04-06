import { useState, useRef, useEffect, useCallback } from 'react';
import type { TextSelection, HighlightCategory } from '@pulp/shared';
import { HIGHLIGHT_CATEGORIES } from '@pulp/shared';
import { Button } from '../../ui/Button';
import { useCreateHighlight } from '../../../hooks/useHighlights';
import { useToast } from '../../../contexts/ToastContext';
import { DictionaryDefinition } from './DictionaryDefinition';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { usePopupPosition } from '../../../hooks/usePopupPosition';
import { useTouchDevice } from '../../../hooks/useTouchDevice';

const categoryOrder: HighlightCategory[] = ['highlight', 'important', 'question', 'todo', 'definition'];

interface BaseSelection {
  text: string;
  page: number;
  position: { x: number; y: number };
}

interface PDFSelection extends BaseSelection {
  selection: TextSelection | null;
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
  containerRef?: React.RefObject<HTMLElement | null>; // Container for position clamping
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function HighlightPopup({ selection, noteId, onClose, type = 'pdf', cfi, containerRef }: HighlightPopupProps) {
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<HighlightCategory>('highlight');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isTouchDevice = useTouchDevice();

  // Use focus trap for accessibility - trap focus and close on Escape
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true, onClose);

  // Use ResizeObserver-based positioning
  const { popupRef: positionRef, position: popupPosition } = usePopupPosition({
    anchor: selection.position,
    containerRef,
    initialWidth: showNoteInput ? 288 : 300,
    initialHeight: showNoteInput ? 300 : 150,
    padding: 10,
    gap: 10,
  });

  // Merge refs for focus trap and positioning
  const popupRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Update focus trap ref
      (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      // Update position ref
      positionRef(node);
    },
    [focusTrapRef, positionRef]
  );

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
      if (focusTrapRef.current && !focusTrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (focusTrapRef.current && !focusTrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, [onClose, focusTrapRef]);

  const handleSave = useCallback(async (overrideCategory?: HighlightCategory) => {
    setSaveState('saving');
    setErrorMessage(null);

    const finalCategory = overrideCategory ?? category;

    try {
      if (type === 'pdf' && 'selection' in selection) {
        if (!selection.selection) {
          setSaveState('error');
          setErrorMessage('Could not resolve the selected PDF text');
          return;
        }
        await createHighlight.mutateAsync({
          type: 'pdf',
          page: selection.page,
          pageLabel: selection.pageLabel,
          selection: selection.selection,
          text: selection.text,
          note: note || undefined,
          category: finalCategory,
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
          category: finalCategory,
        });
      }

      // Show success state
      setSaveState('success');
      window.getSelection()?.removeAllRanges();
      showToast('Highlight saved', 'success');

      // Delay close to show success feedback
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (error) {
      console.error('Failed to save highlight:', error);
      setSaveState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save highlight'
      );
      // Don't close popup - let user retry
    }
  }, [type, selection, cfi, note, category, createHighlight, showToast, onClose]);

  const handleQuickHighlight = () => {
    handleSave();
  };

  const handleCategorySelect = (selectedCategory: HighlightCategory) => {
    setCategory(selectedCategory);
    // Quick save with the selected category
    handleSave(selectedCategory);
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

  const popupBody = !showNoteInput ? (
    <>
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

      <div className="p-2 border-b border-text-secondary/20">
        <div className="grid grid-cols-5 gap-1">
          {categoryOrder.map((cat) => {
            const info = HIGHLIGHT_CATEGORIES[cat];
            const isSelected = category === cat;
            return (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                  isSelected ? 'bg-accent-primary/10' : 'hover:bg-accent-primary/10'
                }`}
                title={info.label}
                disabled={saveState === 'saving' || saveState === 'success'}
              >
                <div
                  className="w-5 h-5 rounded-full border border-black/20"
                  style={{ backgroundColor: info.color.replace('0.4', '0.8') }}
                />
                <span className="text-[10px] text-text-secondary truncate w-full text-center">
                  {info.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex">
        <button
          onClick={handleQuickHighlight}
          className="flex items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          disabled={saveState === 'saving' || saveState === 'success'}
        >
          {saveState === 'saving' ? <SpinnerIcon /> : saveState === 'success' ? <CheckIcon /> : <HighlightIcon />}
          {saveState === 'saving' ? 'Saving...' : saveState === 'success' ? 'Saved!' : 'Save'}
        </button>
        <div className="w-px bg-text-secondary/20" />
        <button
          onClick={handleAddNote}
          className="flex items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-accent-primary/20 transition-colors"
          disabled={saveState === 'saving' || saveState === 'success'}
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
    <div className="w-full p-3">
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

      <div className="mb-2">
        <span className="text-xs text-text-secondary mb-1 block">Category:</span>
        <div className="flex gap-1">
          {categoryOrder.map((cat) => {
            const info = HIGHLIGHT_CATEGORIES[cat];
            const isSelected = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-1 flex flex-col items-center gap-0.5 p-1.5 rounded border transition-colors ${
                  isSelected
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-transparent hover:bg-accent-primary/5'
                }`}
                title={info.label}
                disabled={saveState === 'saving' || saveState === 'success'}
              >
                <div
                  className="w-4 h-4 rounded-full border border-black/20"
                  style={{ backgroundColor: info.color.replace('0.4', '0.8') }}
                />
                <span className="text-[9px] text-text-secondary truncate w-full text-center">
                  {info.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        ref={inputRef}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        placeholder="Add a note..."
        className="w-full h-20 p-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary resize-none focus:outline-none focus:border-accent-primary"
        disabled={saveState === 'saving' || saveState === 'success'}
        maxLength={2000}
        aria-describedby="note-char-count"
      />
      <div id="note-char-count" className="flex justify-end mt-1">
        <span className={`text-xs ${note.length > 1800 ? 'text-yellow-500' : 'text-text-secondary/60'} ${note.length >= 2000 ? '!text-red-400' : ''}`}>
          {note.length}/2000
        </span>
      </div>

      <div className="flex gap-2 mt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="flex-1"
          disabled={saveState === 'saving' || saveState === 'success'}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleSave()}
          disabled={saveState === 'saving' || saveState === 'success'}
          className="flex-1"
        >
          {saveState === 'saving' ? 'Saving...' : saveState === 'success' ? (
            <span className="flex items-center gap-1.5">
              <CheckIcon /> Saved!
            </span>
          ) : saveState === 'error' ? 'Retry' : 'Save'}
        </Button>
      </div>
    </div>
  );

  if (isTouchDevice) {
    return (
      <>
        <div className="mobile-bottom-sheet-backdrop animate-fade-in z-40" onClick={onClose} />
        <div
          ref={popupRef}
          role="dialog"
          aria-modal="true"
          aria-label={showNoteInput ? 'Add highlight with note' : 'Create highlight'}
          className="mobile-bottom-sheet animate-slide-up pb-safe z-50"
        >
          <div className="w-12 h-1 bg-text-secondary/30 rounded-full mx-auto mt-3 mb-2" />
          {popupBody}
        </div>
      </>
    );
  }

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-label={showNoteInput ? 'Add highlight with note' : 'Create highlight'}
      className={`absolute z-50 bg-bg-surface rounded-lg shadow-xl border border-text-secondary/20 overflow-hidden highlight-popup-enter transition-[left,top] duration-150 ease-out ${saveState === 'success' ? 'highlight-popup-save-success' : ''}`}
      style={{
        left: popupPosition.x,
        top: popupPosition.y,
      }}
    >
      {/* Arrow indicator */}
      <div className={`highlight-popup-arrow ${popupPosition.placement}`} />
      {popupBody}
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
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
