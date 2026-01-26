// Configuration types
export interface PulpConfig {
  library_path: string;
  literature_note_tag: string;
  source_key: string;
  progress_key: string;
  last_read_key: string;
  highlight_template: string;
  highlight_template_epub: string;
  progress_debounce_ms: number;
}

// Literature note types
export interface LiteratureNote {
  id: string;
  title: string;
  source: string;              // Absolute path to source file
  sourceRelative: string;      // Relative path for wiki-links (e.g., "biblib/id/id.pdf")
  sourceType: 'pdf' | 'epub';
  filePath: string;
  notePath: string;
  progress: number;
  lastRead: string | null;
  tags: string[];
  cover: string | null;
  highlights: Highlight[];
  frontmatter: Record<string, unknown>;
}

export interface LiteratureNoteSummary {
  id: string;
  title: string;
  sourceType: 'pdf' | 'epub';
  progress: number;
  lastRead: string | null;
  cover: string | null;
}

// Highlight types
export type Highlight = PDFHighlight | EPUBHighlight;

export interface PDFHighlight {
  id: string;
  type: 'pdf';
  page: number;
  selection: TextSelection; // Text layer indices for Obsidian-compatible links
  text: string;
  note?: string;
  createdAt: string;
}

// Text selection coordinates matching Obsidian PDF++ format
// Format in links: #page=N&selection=beginIndex,beginOffset,endIndex,endOffset
export interface TextSelection {
  beginIndex: number;  // Index of text layer div where selection starts
  beginOffset: number; // Character offset within that div
  endIndex: number;    // Index of text layer div where selection ends
  endOffset: number;   // Character offset within that div
}

export interface EPUBHighlight {
  id: string;
  type: 'epub';
  cfi: string;
  text: string;
  note?: string;
  createdAt: string;
}

// API request/response types
export interface LibraryQuery {
  sort?: 'lastRead' | 'title' | 'progress';
  order?: 'asc' | 'desc';
}

export interface ProgressUpdate {
  progress: number;
}

export interface CreateHighlightRequest {
  type: 'pdf' | 'epub';
  page?: number;
  selection?: TextSelection;
  cfi?: string;
  text: string;
  note?: string;
}

export interface UpdateHighlightRequest {
  note?: string;
}

// WebSocket event types
export type WebSocketEvent =
  | FileChangedEvent
  | FileDeletedEvent
  | LibraryUpdatedEvent;

export interface FileChangedEvent {
  type: 'file:changed';
  noteId: string;
  path: string;
}

export interface FileDeletedEvent {
  type: 'file:deleted';
  noteId: string;
  path: string;
}

export interface LibraryUpdatedEvent {
  type: 'library:updated';
  action: 'added' | 'removed';
  noteId: string;
}

export type WebSocketClientEvent =
  | SubscribeNoteEvent
  | UnsubscribeNoteEvent;

export interface SubscribeNoteEvent {
  type: 'subscribe:note';
  noteId: string;
}

export interface UnsubscribeNoteEvent {
  type: 'unsubscribe:note';
  noteId: string;
}
