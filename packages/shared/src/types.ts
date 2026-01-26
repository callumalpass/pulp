// Configuration types
export interface PulpConfig {
  library_path: string;
  literature_note_tag: string;
  source_key: string;
  progress_key: string;
  last_read_key: string;
  date_created_key: string;
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
  dateCreated: string | null;
  tags: string[];
  cover: string | null;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  pinned: boolean;
  readingStats: ReadingStats | null;
  frontmatter: Record<string, unknown>;
}

export interface LiteratureNoteSummary {
  id: string;
  title: string;
  sourceType: 'pdf' | 'epub';
  progress: number;
  lastRead: string | null;
  dateCreated: string | null;
  cover: string | null;
  pinned: boolean;
  readingStats: ReadingStats | null;
}

// Highlight types
export type Highlight = PDFHighlight | EPUBHighlight;

export interface PDFHighlight {
  id: string;
  type: 'pdf';
  page: number;
  pageLabel?: string; // Logical page label (e.g., "iv", "12", "A-3")
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
  sort?: 'lastRead' | 'title' | 'progress' | 'dateCreated';
  order?: 'asc' | 'desc';
}

export interface ProgressUpdate {
  progress: number;
}

export interface PinUpdate {
  pinned: boolean;
}

export interface CreateHighlightRequest {
  type: 'pdf' | 'epub';
  page?: number;
  pageLabel?: string; // Logical page label (e.g., "iv", "12", "A-3")
  selection?: TextSelection;
  cfi?: string;
  text: string;
  note?: string;
}

export interface UpdateHighlightRequest {
  note?: string;
}

// Bookmark types - stored as wikilinks in frontmatter
export interface Bookmark {
  id: string;
  label: string;
  page?: number;       // For PDFs
  cfi?: string;        // For EPUBs
  createdAt: string;
}

export interface CreateBookmarkRequest {
  label: string;
  page?: number;
  cfi?: string;
}

export interface UpdateBookmarkRequest {
  label?: string;
}

// Reading statistics types - stored in frontmatter
export interface ReadingStats {
  totalReadingTimeMs: number;
  totalSessions: number;
  averageSessionMs: number;
  firstReadDate: string | null;
  // lastReadDate is already tracked via last_read_key
}

export interface ReadingStatsUpdate {
  sessionDurationMs: number;  // Duration of the session that just ended
  pagesRead?: number;         // Pages read in this session
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

// Search API types
export interface SearchQuery {
  q: string;
  noteId?: string;
  limit?: number;
}

export interface SearchResult {
  noteId: string;
  title: string;
  sourceType: 'pdf' | 'epub';
  matches: SearchMatch[];
  totalMatches: number;
}

export interface SearchMatch {
  text: string;
  page?: number;
  pageLabel?: string;
  chapter?: string;
  chapterHref?: string;
  position: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
}

export interface SearchStatus {
  totalDocuments: number;
  indexedDocuments: number;
  isComplete: boolean;
  percentComplete: number;
}

// Dictionary API types (Free Dictionary API)
export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics: DictionaryPhonetic[];
  meanings: DictionaryMeaning[];
}

export interface DictionaryPhonetic {
  text?: string;
  audio?: string;
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
}

export interface DictionaryDefinition {
  definition: string;
  example?: string;
}
