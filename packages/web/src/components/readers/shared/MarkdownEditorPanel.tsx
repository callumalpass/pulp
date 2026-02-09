import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { vim } from '@replit/codemirror-vim';
import { useNoteContent, useUpdateNoteContent } from '../../../hooks/useNoteContent';
import { useMobile } from '../../../hooks/useMobile';
import { useReaderStore } from '../../../stores/reader';
import { usePreferencesStore } from '../../../stores/preferences';
import { markdownToHtml } from '../../../lib/markdown';

interface MarkdownEditorPanelProps {
  noteId: string;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'unsaved' | 'saving';
type ViewMode = 'edit' | 'preview' | 'split';

// Extracted outside the component so React treats it as a stable component
// reference. Defining it inline causes all buttons to unmount/remount on
// every render, which can drop click events if a re-render happens between
// mousedown and mouseup.
function ToolbarButton({ onClick, title, active, children, isMobile, isEink }: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  isMobile: boolean;
  isEink: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`${isMobile ? 'w-11 h-11 min-w-[44px] min-h-[44px]' : 'w-7 h-7'} flex items-center justify-center rounded transition-colors ${
        isEink
          ? active ? 'bg-black text-white' : 'hover:bg-gray-200 text-gray-700'
          : active ? 'bg-accent-primary/20 text-accent-primary' : 'hover:bg-bg-deep text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export function MarkdownEditorPanel({ noteId, onClose }: MarkdownEditorPanelProps) {
  const isMobile = useMobile();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const vimCompartment = useRef(new Compartment());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [previewContent, setPreviewContent] = useState('');
  const contentRef = useRef<string>('');
  const [isResizing, setIsResizing] = useState(false);
  const previewUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarScrollState, setToolbarScrollState] = useState<'start' | 'middle' | 'end' | 'none'>('none');

  const { pdfColorMode } = useReaderStore();
  const {
    readerTheme,
    markdownPanelOverlay,
    setMarkdownPanelOverlay,
    markdownPanelWidth,
    setMarkdownPanelWidth,
    markdownPanelVimMode,
    setMarkdownPanelVimMode,
  } = usePreferencesStore();
  // Check both PDF color mode and EPUB reader theme for e-ink
  const isEink = pdfColorMode === 'eink' || readerTheme === 'eink';

  // Minimum width for split mode (px) - at 400px, each pane is 200px
  const MIN_SPLIT_WIDTH = 400;
  const isSplitAvailable = markdownPanelWidth >= MIN_SPLIT_WIDTH;

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

  // Update preview when content changes
  useEffect(() => {
    if (viewMode !== 'edit') {
      setPreviewContent(markdownToHtml(contentRef.current || ''));
    }
  }, [viewMode]);

  // Create custom save handler
  const handleSave = useCallback(() => {
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString();
      saveImmediately(currentContent);
    }
    return true;
  }, [saveImmediately]);

  // Insert formatting around selection or at cursor
  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: { from, to, insert: `${prefix}${selectedText}${suffix}` },
      selection: EditorSelection.cursor(from + prefix.length + selectedText.length + suffix.length),
    });
    view.focus();
  }, []);

  // Insert line prefix (for headers, lists)
  const insertLinePrefix = useCallback((prefix: string) => {
    const view = viewRef.current;
    if (!view) return;

    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const lineText = line.text;

    // Check if line already starts with this prefix
    if (lineText.startsWith(prefix)) {
      // Remove the prefix
      view.dispatch({
        changes: { from: line.from, to: line.from + prefix.length, insert: '' },
      });
    } else {
      // Add the prefix
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
      });
    }
    view.focus();
  }, []);

  // Insert code block
  const insertCodeBlock = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    if (selectedText.includes('\n') || selectedText.length > 40) {
      // Multi-line or long: use code block
      view.dispatch({
        changes: { from, to, insert: `\`\`\`\n${selectedText}\n\`\`\`` },
        selection: EditorSelection.cursor(from + 4),
      });
    } else {
      // Short: use inline code
      view.dispatch({
        changes: { from, to, insert: `\`${selectedText}\`` },
        selection: EditorSelection.cursor(from + 1 + selectedText.length + 1),
      });
    }
    view.focus();
  }, []);

  // Insert link
  const insertLink = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: { from, to, insert: `[${selectedText || 'link text'}](url)` },
      selection: EditorSelection.range(from + 1, from + 1 + (selectedText || 'link text').length),
    });
    view.focus();
  }, []);

  // Keep refs for callbacks used in CM setup so the effect doesn't
  // re-run (destroying/recreating the editor) when they change.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const saveDebouncedRef = useRef(saveDebounced);
  saveDebouncedRef.current = saveDebounced;

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
        caretColor: isEink ? '#000000' : 'var(--color-accent-primary)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-activeLine': {
        backgroundColor: isEink ? 'rgba(0, 0, 0, 0.05)' : 'rgba(162, 155, 254, 0.1)',
      },
      '.cm-selectionBackground': {
        backgroundColor: isEink ? 'rgba(0, 0, 0, 0.2) !important' : 'rgba(162, 155, 254, 0.3) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: isEink ? 'rgba(0, 0, 0, 0.2) !important' : 'rgba(162, 155, 254, 0.3) !important',
      },
      '.cm-gutters': {
        backgroundColor: isEink ? '#f5f5f5' : 'var(--color-bg-surface)',
        borderRight: isEink ? '1px solid #ccc' : '1px solid rgba(178, 190, 195, 0.2)',
        color: isEink ? '#666' : 'var(--color-text-secondary)',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 4px',
        minWidth: '32px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: isEink ? 'rgba(0, 0, 0, 0.05)' : 'rgba(162, 155, 254, 0.1)',
      },
    });

    // Create the editor state
    const state = EditorState.create({
      doc: content,
      extensions: [
        // Vim mode compartment (must be first for proper key handling)
        vimCompartment.current.of(markdownPanelVimMode ? vim() : []),
        markdown(),
        theme,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              handleSaveRef.current();
              return true;
            },
          },
          {
            key: 'Mod-b',
            run: () => {
              insertFormatting('**');
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: () => {
              insertFormatting('*');
              return true;
            },
          },
          {
            key: 'Mod-k',
            run: () => {
              insertLink();
              return true;
            },
          },
          {
            key: 'Mod-`',
            run: () => {
              insertCodeBlock();
              return true;
            },
          },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            contentRef.current = newContent;
            setSaveStatus('unsaved');
            saveDebouncedRef.current(newContent);
            // Debounce preview update in split view for better typing performance
            if (viewMode === 'split') {
              if (previewUpdateTimer.current) {
                clearTimeout(previewUpdateTimer.current);
              }
              previewUpdateTimer.current = setTimeout(() => {
                setPreviewContent(markdownToHtml(newContent));
              }, 100);
            }
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

    // Workaround: CodeMirror's .cm-scroller uses display:flex with overflow:auto,
    // which the browser compositor may not recognize as a scroll target.
    // Manually handle wheel events to ensure the editor scrolls.
    const scroller = view.scrollDOM;
    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;

      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop >= maxScroll && e.deltaY > 0;
      if (atTop || atBottom) return;

      e.preventDefault();
      scroller.scrollTop += e.deltaY;
    };
    scroller.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scroller.removeEventListener('wheel', handleWheel);
      view.destroy();
      viewRef.current = null;
      if (previewUpdateTimer.current) {
        clearTimeout(previewUpdateTimer.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isEink, viewMode]);

  // Handle keyboard shortcut for closing panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't close on Escape if vim mode is active (vim uses Escape)
      if (e.key === 'Escape' && !markdownPanelVimMode) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, markdownPanelVimMode]);

  // Toggle vim mode dynamically
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: vimCompartment.current.reconfigure(markdownPanelVimMode ? vim() : []),
      });
    }
  }, [markdownPanelVimMode]);

  // Auto-switch from split to edit mode if panel becomes too narrow
  useEffect(() => {
    if (viewMode === 'split' && !isSplitAvailable) {
      setViewMode('edit');
    }
  }, [viewMode, isSplitAvailable]);

  // Detect toolbar scroll state for fade indicators
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = toolbar;
      const maxScroll = scrollWidth - clientWidth;

      if (maxScroll <= 0) {
        setToolbarScrollState('none');
      } else if (scrollLeft <= 1) {
        setToolbarScrollState('start');
      } else if (scrollLeft >= maxScroll - 1) {
        setToolbarScrollState('end');
      } else {
        setToolbarScrollState('middle');
      }
    };

    updateScrollState();
    toolbar.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      toolbar.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [isLoading]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = markdownPanelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      // Resize from left edge, so moving left increases width
      const delta = startX - e.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + delta));
      setMarkdownPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [markdownPanelWidth, setMarkdownPanelWidth]);

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
    if (isEink) {
      switch (saveStatus) {
        case 'saving':
          return 'text-gray-600';
        case 'unsaved':
          return 'text-gray-800 font-medium';
        case 'saved':
          return 'text-gray-500';
      }
    }
    switch (saveStatus) {
      case 'saving':
        return 'text-accent-primary';
      case 'unsaved':
        return 'text-yellow-500';
      case 'saved':
        return 'text-accent-secondary';
    }
  };


  const toolbar = (
    <div className={`markdown-editor-toolbar ${toolbarScrollState !== 'none' ? `scroll-${toolbarScrollState}` : ''}`}>
    <div
      ref={toolbarRef}
      className={`markdown-editor-toolbar-inner flex items-center ${isMobile ? 'gap-0.5 px-2 py-1.5' : 'gap-1 px-3 py-2'} border-b ${isEink ? 'border-gray-300 bg-gray-50' : 'border-text-secondary/10'}`}
    >
      {/* Formatting buttons */}
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertFormatting('**')} title="Bold (Cmd+B)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertFormatting('*')} title="Italic (Cmd+I)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="4" x2="10" y2="4" />
          <line x1="14" y1="20" x2="5" y2="20" />
          <line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertFormatting('~~')} title="Strikethrough">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 4H9a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h6" />
          <path d="M8 20h7a3 3 0 0 0 3-3v-1a3 3 0 0 0-3-3h-6" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </ToolbarButton>

      <div className={`w-px h-5 mx-1 ${isEink ? 'bg-gray-300' : 'bg-text-secondary/20'}`} />

      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('# ')} title="Heading 1">
        <span className="text-xs font-bold">H1</span>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('## ')} title="Heading 2">
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('### ')} title="Heading 3">
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>

      <div className={`w-px h-5 mx-1 ${isEink ? 'bg-gray-300' : 'bg-text-secondary/20'}`} />

      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('- ')} title="Bullet list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('1. ')} title="Numbered list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <text x="3" y="8" fontSize="8" fill="currentColor">1</text>
          <text x="3" y="14" fontSize="8" fill="currentColor">2</text>
          <text x="3" y="20" fontSize="8" fill="currentColor">3</text>
        </svg>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={() => insertLinePrefix('> ')} title="Quote">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v4" />
        </svg>
      </ToolbarButton>

      <div className={`w-px h-5 mx-1 ${isEink ? 'bg-gray-300' : 'bg-text-secondary/20'}`} />

      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={insertCodeBlock} title="Code (Cmd+`)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>
      <ToolbarButton isMobile={isMobile} isEink={isEink} onClick={insertLink} title="Link (Cmd+K)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>

      <div className="flex-1" />

      {/* Vim mode toggle */}
      <div className="shrink-0">
        <ToolbarButton
          isMobile={isMobile}
          isEink={isEink}
          onClick={() => setMarkdownPanelVimMode(!markdownPanelVimMode)}
          title={markdownPanelVimMode ? 'Disable Vim mode' : 'Enable Vim mode'}
          active={markdownPanelVimMode}
        >
          <span className="text-xs font-bold">VIM</span>
        </ToolbarButton>
      </div>

      <div className={`w-px h-5 mx-1 ${isEink ? 'bg-gray-300' : 'bg-text-secondary/20'}`} />

      {/* View mode toggle */}
      <div className={`flex items-center rounded-lg p-0.5 shrink-0 ${isEink ? 'bg-gray-200' : 'bg-bg-deep'}`}>
        <button
          onClick={() => setViewMode('edit')}
          title="Edit mode - write markdown"
          aria-label="Edit mode"
          aria-pressed={viewMode === 'edit'}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            viewMode === 'edit'
              ? isEink ? 'bg-white text-black shadow-sm' : 'bg-bg-surface text-text-primary'
              : isEink ? 'text-gray-600' : 'text-text-secondary'
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => isSplitAvailable && setViewMode('split')}
          title={isSplitAvailable ? 'Split mode - edit and preview side by side' : 'Panel too narrow for split mode (min 500px)'}
          aria-label="Split mode"
          aria-pressed={viewMode === 'split'}
          aria-disabled={!isSplitAvailable}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            !isSplitAvailable
              ? isEink ? 'text-gray-400 cursor-not-allowed' : 'text-text-secondary/50 cursor-not-allowed'
              : viewMode === 'split'
              ? isEink ? 'bg-white text-black shadow-sm' : 'bg-bg-surface text-text-primary'
              : isEink ? 'text-gray-600' : 'text-text-secondary'
          }`}
        >
          Split
        </button>
        <button
          onClick={() => setViewMode('preview')}
          title="Preview mode - see rendered markdown"
          aria-label="Preview mode"
          aria-pressed={viewMode === 'preview'}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            viewMode === 'preview'
              ? isEink ? 'bg-white text-black shadow-sm' : 'bg-bg-surface text-text-primary'
              : isEink ? 'text-gray-600' : 'text-text-secondary'
          }`}
        >
          Preview
        </button>
      </div>
    </div>
    </div>
  );

  const previewPane = (
    <div className={`overflow-y-auto h-full px-4 ${isEink ? 'bg-white' : 'bg-bg-deep'}`}>
      <div
        className={`prose prose-sm max-w-none py-4 ${
          isEink
            ? 'prose-gray'
            : 'prose-invert'
        }`}
        style={isEink ? { color: '#000' } : {}}
        dangerouslySetInnerHTML={{ __html: previewContent }}
      />
    </div>
  );

  const panelContent = (
    <>
      {/* Header */}
      <div className={isMobile
        ? `h-14 flex items-center justify-between px-4 border-b shrink-0 ${isEink ? 'border-gray-300 bg-gray-50' : 'border-text-secondary/10'}`
        : `panel-header ${isEink ? 'bg-gray-50 border-gray-300' : ''}`}
      >
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

          {/* Overlay/Side-panel toggle (desktop only) */}
          {!isMobile && (
            <button
              onClick={() => setMarkdownPanelOverlay(!markdownPanelOverlay)}
              className={`w-6 h-6 rounded flex items-center justify-center transition-smooth ${isEink ? 'text-gray-600 hover:bg-gray-200' : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'}`}
              title={markdownPanelOverlay ? 'Dock to side' : 'Float over content'}
            >
              {markdownPanelOverlay ? (
                // Icon for "dock to side" - panel docked
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M15 3v18" />
                </svg>
              ) : (
                // Icon for "float over" - overlapping squares
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="14" height="14" rx="2" />
                  <rect x="7" y="7" width="14" height="14" rx="2" />
                </svg>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className={isMobile
              ? `touch-target rounded-lg flex items-center justify-center transition-smooth ${isEink ? 'text-gray-600 hover:bg-gray-200' : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'}`
              : `w-6 h-6 rounded flex items-center justify-center transition-smooth ${isEink ? 'text-gray-600 hover:bg-gray-200' : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'}`
            }
            title="Close (Esc)"
          >
            <svg width={isMobile ? 22 : 14} height={isMobile ? 22 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {!isLoading && toolbar}

      {/* Editor / Preview */}
      <div className={`flex-1 relative overflow-hidden ${isEink ? 'bg-white' : 'bg-bg-deep'} ${isMobile ? '' : 'panel-content'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className={`w-6 h-6 border-2 rounded-full animate-spin ${isEink ? 'border-gray-400 border-t-transparent' : 'border-accent-primary border-t-transparent'}`} />
          </div>
        ) : viewMode === 'edit' ? (
          <div ref={editorRef} className="absolute inset-0" />
        ) : viewMode === 'preview' ? (
          previewPane
        ) : (
          <div className="flex absolute inset-0">
            <div ref={editorRef} className={`w-1/2 h-full border-r ${isEink ? 'border-gray-300' : 'border-text-secondary/10'}`} />
            <div className="w-1/2 h-full overflow-hidden">
              {previewPane}
            </div>
          </div>
        )}
      </div>
    </>
  );

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className={`mobile-fullscreen-modal animate-slide-up ${isEink ? 'bg-white text-black' : ''}`}>
        {panelContent}
      </div>
    );
  }

  // Desktop: Side panel or overlay
  const overlayClass = markdownPanelOverlay ? 'markdown-editor-panel-overlay' : '';

  return (
    <div
      className={`markdown-editor-panel ${overlayClass} ${isEink ? 'eink-markdown-panel' : ''} ${isResizing ? 'select-none' : ''}`}
      style={{ width: `${markdownPanelWidth}px` }}
    >
      {/* Resize handle */}
      <div
        className={`markdown-panel-resize-handle ${isEink ? 'eink' : ''}`}
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      />
      {panelContent}
    </div>
  );
}
