import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap } from '@codemirror/commands';
import { useNoteContent, useUpdateNoteContent } from '../../../hooks/useNoteContent';
import { useMobile } from '../../../hooks/useMobile';

interface MarkdownEditorPanelProps {
  noteId: string;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'unsaved' | 'saving';

export function MarkdownEditorPanel({ noteId, onClose }: MarkdownEditorPanelProps) {
  const isMobile = useMobile();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const contentRef = useRef<string>('');

  const { data: content, isLoading } = useNoteContent(noteId);
  const { saveDebounced, saveImmediately, isPending, hasPendingDebounce } = useUpdateNoteContent(noteId);

  // Update save status based on mutation state
  useEffect(() => {
    if (isPending) {
      setSaveStatus('saving');
    } else if (hasPendingDebounce()) {
      setSaveStatus('unsaved');
    } else {
      setSaveStatus('saved');
    }
  }, [isPending, hasPendingDebounce]);

  // Create custom save handler
  const handleSave = useCallback(() => {
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString();
      saveImmediately(currentContent);
    }
    return true;
  }, [saveImmediately]);

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!editorRef.current || content === undefined) return;

    // Store initial content
    contentRef.current = content;

    // Create editor theme
    const theme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '16px',
        caretColor: 'var(--color-accent-primary)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(162, 155, 254, 0.1)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(162, 155, 254, 0.3) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(162, 155, 254, 0.3) !important',
      },
    });

    // Create the editor state
    const state = EditorState.create({
      doc: content,
      extensions: [
        markdown(),
        theme,
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              handleSave();
              return true;
            },
          },
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            contentRef.current = newContent;
            setSaveStatus('unsaved');
            saveDebounced(newContent);
          }
        }),
      ],
    });

    // Create the editor view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content, handleSave, saveDebounced]);

  // Handle keyboard shortcut for closing panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'unsaved':
        return 'Unsaved';
      case 'saved':
        return 'Saved';
    }
  };

  const getSaveStatusColor = () => {
    switch (saveStatus) {
      case 'saving':
        return 'text-accent-primary';
      case 'unsaved':
        return 'text-yellow-500';
      case 'saved':
        return 'text-accent-secondary';
    }
  };

  const panelContent = (
    <>
      {/* Header */}
      <div className={isMobile ? 'h-14 flex items-center justify-between px-4 border-b border-text-secondary/10 shrink-0' : 'panel-header'}>
        <div className="flex items-center gap-2">
          <svg width={isMobile ? 20 : 16} height={isMobile ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className={isMobile ? 'text-base font-semibold' : 'font-medium'}>Notes</span>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs ${getSaveStatusColor()}`}>
            {getSaveStatusText()}
          </span>

          <button
            onClick={onClose}
            className={isMobile
              ? 'touch-target rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-stoody'
              : 'w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-stoody'
            }
            title="Close (Esc)"
          >
            <svg width={isMobile ? 22 : 14} height={isMobile ? 22 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className={isMobile ? 'flex-1 overflow-hidden bg-bg-deep' : 'panel-content'}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div ref={editorRef} className="h-full" />
        )}
      </div>
    </>
  );

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className="mobile-fullscreen-modal animate-slide-up">
        {panelContent}
      </div>
    );
  }

  // Desktop: Side panel
  return (
    <div className="markdown-editor-panel">
      {panelContent}
    </div>
  );
}
