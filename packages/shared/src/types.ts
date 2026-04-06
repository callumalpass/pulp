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
  author: string | null;       // Author of the work
  source: string;              // Absolute path to source file
  sourceRelative: string;      // Relative path for wiki-links (e.g., "biblib/id/id.pdf")
  sourceType: 'pdf' | 'epub';
  filePath: string;
  notePath: string;
  progress: number;
  lastRead: string | null;
  lastOpenedCfi: string | null; // For EPUBs: exact CFI position to resume at
  dateCreated: string | null;
  dateFinished: string | null; // Date when book was completed (progress reached 100%)
  collections: string[];       // User-defined collections/shelves this book belongs to
  tags: string[];
  cover: string | null;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  pinned: boolean;
  paused: boolean;             // Whether reading is paused (doesn't affect streak)
  pausedAt: string | null;     // When reading was paused
  rating: number | null;       // User rating (1-5 stars, null if not rated)
  readingStats: ReadingStats | null;
  totalPages: number | null;   // Total pages in document
  readerPreferences: ReaderPreferences | null; // Per-book reader display preferences
  currentChapter: string | null; // Current chapter/section name for context
  bookNotes: string | null;      // Personal notes about the book
  frontmatter: Record<string, unknown>;
}

// CSL (Citation Style Language) metadata extracted from frontmatter
export interface CSLMetadata {
  type: string | null;              // CSL type: book, chapter, article-journal, etc.
  containerTitle: string | null;    // For chapters/articles: the book/journal title
  publisher: string | null;         // Publisher name
  publisherPlace: string | null;    // Place of publication
  issued: string | null;            // Publication date (year or full date)
  isbn: string | null;              // ISBN
  doi: string | null;               // DOI
  url: string | null;               // URL
  edition: string | null;           // Edition
  volume: string | null;            // Volume number
  issue: string | null;             // Issue number
  page: string | null;              // Page range (for chapters/articles)
  collectionTitle: string | null;   // Series/collection title
  translator: string | null;        // Translator(s)
}

export interface LiteratureNoteSummary {
  id: string;
  title: string;
  author: string | null;       // Author of the work
  citekey: string | null;
  sourceType: 'pdf' | 'epub';
  progress: number;
  lastRead: string | null;
  dateCreated: string | null;
  dateFinished: string | null; // Date when book was completed (progress reached 100%)
  yearCompleted: number | null; // Year the book was completed (for annual stats)
  cover: string | null;
  pinned: boolean;
  paused: boolean;             // Whether reading is paused (doesn't affect streak)
  pausedAt: string | null;     // When reading was paused
  rating: number | null;       // User rating (1-5 stars, null if not rated)
  readingStats: ReadingStats | null;
  totalPages: number | null;   // Total pages in document
  highlightCount: number;      // Number of highlights in this note
  collections: string[];       // User-defined collections/shelves this book belongs to
  currentChapter: string | null; // Current chapter/section for display in library
  csl: CSLMetadata | null;     // CSL citation metadata from frontmatter
}

// Highlight categories with predefined colors
export type HighlightCategory =
  | 'highlight' // Default yellow - general highlights
  | 'important' // Red/orange - key concepts, critical info
  | 'question'  // Blue - things to research or clarify
  | 'todo'      // Purple - action items, things to follow up on
  | 'definition'; // Green - definitions, terms, vocabulary

export interface HighlightCategoryInfo {
  id: HighlightCategory;
  label: string;
  color: string;       // CSS color for the highlight background
  hoverColor: string;  // CSS color on hover
}

export const HIGHLIGHT_CATEGORIES: Record<HighlightCategory, HighlightCategoryInfo> = {
  highlight: {
    id: 'highlight',
    label: 'Highlight',
    color: 'rgba(255, 235, 59, 0.4)',   // Yellow
    hoverColor: 'rgba(255, 235, 59, 0.6)',
  },
  important: {
    id: 'important',
    label: 'Important',
    color: 'rgba(255, 138, 101, 0.4)',   // Orange-red
    hoverColor: 'rgba(255, 138, 101, 0.6)',
  },
  question: {
    id: 'question',
    label: 'Question',
    color: 'rgba(100, 181, 246, 0.4)',   // Blue
    hoverColor: 'rgba(100, 181, 246, 0.6)',
  },
  todo: {
    id: 'todo',
    label: 'To-do',
    color: 'rgba(186, 104, 200, 0.4)',   // Purple
    hoverColor: 'rgba(186, 104, 200, 0.6)',
  },
  definition: {
    id: 'definition',
    label: 'Definition',
    color: 'rgba(129, 199, 132, 0.4)',   // Green
    hoverColor: 'rgba(129, 199, 132, 0.6)',
  },
};

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
  category?: HighlightCategory; // Category for color coding
  createdAt: string;
  updatedAt?: string; // Timestamp when highlight was last edited
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
  category?: HighlightCategory; // Category for color coding
  createdAt: string;
  updatedAt?: string; // Timestamp when highlight was last edited
}

// API request/response types
export interface LibraryQuery {
  sort?: 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating';
  order?: 'asc' | 'desc';
}

export interface ProgressUpdate {
  progress: number;
  lastOpenedCfi?: string;  // For EPUBs: exact CFI position for precise resume
}

export type ReaderProgressPercent = number;

export interface ReaderPagination {
  currentPage: number;
  totalPages: number;
  progressPercent: ReaderProgressPercent;
}

export interface PdfReaderPosition {
  sourceType: 'pdf';
  progressPercent: ReaderProgressPercent;
  page: number;
  totalPages: number | null;
}

export interface EpubReaderPosition {
  sourceType: 'epub';
  progressPercent: ReaderProgressPercent;
  cfi: string | null;
  chapter: string | null;
  href: string | null;
  estimatedPage: number;
  totalLocations: number;
}

export type ReaderPosition = PdfReaderPosition | EpubReaderPosition;

export interface PinUpdate {
  pinned: boolean;
}

export interface PausedUpdate {
  paused: boolean;
}

export interface RatingUpdate {
  rating: number | null;       // 1-5 or null to remove rating
}

// Per-book reader preferences stored in frontmatter
export interface ReaderPreferences {
  zoomLevel?: number;          // Last used zoom level (e.g., 1.0, 1.5)
  zoomMode?: 'fit-width' | 'fit-page' | 'custom'; // How zoom was set
  theme?: 'light' | 'dark' | 'sepia' | 'eink';   // Reader theme
  fontSize?: number;           // Font size for EPUB
  lineHeight?: number;         // Line height for EPUB (1.2 - 2.0)
  dailyGoalMinutes?: number;   // Override global daily reading goal for this book
}

export interface ReaderPreferencesUpdate {
  zoomLevel?: number;
  zoomMode?: 'fit-width' | 'fit-page' | 'custom';
  theme?: 'light' | 'dark' | 'sepia' | 'eink';
  fontSize?: number;
  lineHeight?: number;
  dailyGoalMinutes?: number;   // Override global daily reading goal for this book
}

export interface CollectionsUpdate {
  collections: string[];       // Full list of collections this book belongs to
}

export interface BookNotesUpdate {
  notes: string | null;        // Personal notes about the book (null to clear)
}

export interface CreateHighlightRequest {
  type: 'pdf' | 'epub';
  page?: number;
  pageLabel?: string; // Logical page label (e.g., "iv", "12", "A-3")
  selection?: TextSelection;
  cfi?: string;
  text: string;
  note?: string;
  category?: HighlightCategory; // Category for color coding (defaults to 'highlight')
}

export interface UpdateHighlightRequest {
  note?: string;
  category?: HighlightCategory; // Category for color coding
}

// Bookmark types - stored as wikilinks in frontmatter
export interface Bookmark {
  id: string;
  label: string;
  notes?: string;      // Optional notes/context about this bookmark
  page?: number;       // For PDFs
  cfi?: string;        // For EPUBs
  createdAt: string;
}

export interface CreateBookmarkRequest {
  label: string;
  notes?: string;      // Optional notes/context about this bookmark
  page?: number;
  cfi?: string;
}

export interface UpdateBookmarkRequest {
  label?: string;
  notes?: string;      // Optional notes/context about this bookmark
}

// Progress milestone thresholds
export const PROGRESS_MILESTONES = [10, 25, 50, 75, 100] as const;
export type ProgressMilestone = (typeof PROGRESS_MILESTONES)[number];

// Milestone record - when a progress threshold was reached
export interface ProgressMilestoneRecord {
  milestone: ProgressMilestone;
  reachedAt: string;           // ISO timestamp when milestone was reached
  daysFromStart: number | null; // Days since first read (null if first read date unknown)
  totalReadingTimeMs: number;  // Total reading time when milestone was reached
}

// Reading momentum - how reading activity is trending
export type ReadingMomentum = 'accelerating' | 'steady' | 'slowing' | 'inactive';

// Reading statistics types - stored in frontmatter
export interface ReadingStats {
  totalReadingTimeMs: number;
  totalSessions: number;
  averageSessionMs: number;
  firstReadDate: string | null;
  // lastReadDate is already tracked via last_read_key
  // Reading speed metrics
  pagesPerHour: number | null;           // Calculated pages per hour
  totalPagesRead: number;                 // Cumulative pages read across all sessions
  longestSessionMs: number | null;        // Personal best session duration
  // Completion estimation (recalculated on each session)
  estimatedCompletionDate: string | null; // Predicted completion date based on reading pace
  averageDailyReadingMs: number | null;   // Average daily reading time (over last 14 days of activity)
  // Progress milestones
  milestones?: ProgressMilestoneRecord[]; // When each progress threshold was reached
  // Reading momentum
  momentum?: ReadingMomentum;             // Current reading momentum trend
  momentumScore?: number;                 // Numeric momentum score (-100 to 100)
}

export interface ReadingStatsUpdate {
  sessionDurationMs: number;  // Duration of the session that just ended
  pagesRead?: number;         // Pages read in this session
  startPage?: number;         // Page when session started
  endPage?: number;           // Page when session ended
  startTime?: string;         // ISO timestamp when session started
  idlePauseCount?: number;    // Number of idle pauses during session
  idlePauseTotalMs?: number;  // Total idle time during session
  currentProgress?: number;   // Current progress percentage (for milestone tracking)
}

// Reading goals and streaks - stored globally (in a .pulp-goals file or config)
// and per-book daily reading history in note frontmatter
export interface ReadingGoals {
  dailyGoalMinutes: number;        // Target daily reading time in minutes
  weeklyGoalMinutes: number | null; // Optional weekly target (null = 7x daily)
  gracePeriodDays: number;          // Number of days allowed to miss without breaking streak (default: 1)
  streakFreezeDays: string[];       // Pre-scheduled days off (YYYY-MM-DD) that won't break streak
}

export interface ReadingGoalsUpdate {
  dailyGoalMinutes?: number;
  weeklyGoalMinutes?: number | null;
  gracePeriodDays?: number;
  streakFreezeDays?: string[];      // Update scheduled freeze days
}

// Reading history entry - one per day per book (stored in note frontmatter)
export interface DailyReadingEntry {
  date: string;              // ISO date (YYYY-MM-DD)
  durationMs: number;        // Total reading time that day
  sessions: number;          // Number of sessions that day
  pagesRead: number;         // Pages read that day
}

// Session quality rating based on focus metrics
export type SessionQuality = 'deep' | 'focused' | 'normal' | 'distracted';

// Individual reading session (stored in note frontmatter)
export interface ReadingSession {
  startTime: string;         // ISO timestamp when session started
  endTime: string;           // ISO timestamp when session ended
  durationMs: number;        // Duration in milliseconds
  pagesRead: number;         // Pages read in this session
  startPage: number;         // Page when session started
  endPage: number;           // Page when session ended
  hourOfDay?: number;        // Hour when session started (0-23), for time-of-day analysis
  quality?: SessionQuality;  // Quality rating based on focus metrics
  idlePauseCount?: number;   // Number of idle pauses during session
  idlePauseTotalMs?: number; // Total idle time during session
}

// Time-of-day reading pattern analysis
export interface TimeOfDayPattern {
  hour: number;              // Hour of day (0-23)
  totalSessions: number;     // Number of sessions started in this hour
  totalDurationMs: number;   // Total reading time in this hour
  averageDurationMs: number; // Average session duration in this hour
}

// Reading pace data point for trend visualization
export interface ReadingPacePoint {
  date: string;              // ISO date (YYYY-MM-DD)
  pagesPerHour: number | null; // Pages per hour for this session
  pagesRead: number;         // Pages read in this session
  durationMs: number;        // Duration of this session
}

// Reading pace trends response
export interface ReadingPaceTrends {
  paceData: ReadingPacePoint[];     // Individual session pace data
  trend: 'improving' | 'declining' | 'stable' | null; // Overall trend
  currentPace: number | null;       // Recent average pace (last 5 sessions)
  overallAverage: number | null;    // Overall average pace
  totalSessions: number;            // Total sessions analyzed
  timeOfDayPatterns: TimeOfDayPattern[]; // Reading patterns by hour
  preferredReadingTime: PreferredReadingTime | null; // Best reading time analysis
  momentum: ReadingMomentum | null; // Current reading momentum
  momentumScore: number | null;     // Numeric momentum score (-100 to 100)
  averageSessionQuality: SessionQuality | null; // Average session quality
  focusScore: number | null;        // Overall focus score (0-100)
}

// Analysis of when user reads best
export interface PreferredReadingTime {
  peakHour: number;          // Hour with most reading activity
  peakPeriod: 'morning' | 'afternoon' | 'evening' | 'night'; // Time period classification
  sessionsInPeakPeriod: number; // Sessions in this period
  percentageInPeakPeriod: number; // Percentage of reading in this period
}

// Global reading streak data (stored in .pulp-goals file)
export interface ReadingStreak {
  currentStreak: number;     // Current consecutive days
  longestStreak: number;     // All-time longest streak
  lastReadDate: string;      // Last date counted toward streak (YYYY-MM-DD)
  streakStartDate: string;   // When current streak started (YYYY-MM-DD)
  graceDaysUsed: number;     // Number of grace days used in current streak
  freezeDaysUsed: number;    // Number of pre-scheduled freeze days used in current streak
}

// Aggregated daily stats across all books
export interface DailyReadingSummary {
  date: string;              // ISO date (YYYY-MM-DD)
  totalDurationMs: number;   // Total reading across all books
  totalSessions: number;     // Total sessions across all books
  booksRead: number;         // Number of distinct books read
  goalMet: boolean;          // Whether daily goal was met
}

// Weekly reading summary
export interface WeeklyReadingSummary {
  weekStartDate: string;       // ISO date (YYYY-MM-DD) of week start (Monday)
  totalDurationMs: number;     // Total reading across the week
  totalSessions: number;       // Total sessions across the week
  booksRead: number;           // Number of distinct books read
  daysWithReading: number;     // Number of days with any reading
  daysGoalMet: number;         // Number of days where daily goal was met
  weeklyGoalMet: boolean;      // Whether weekly goal was met (if set)
  averageDailyMs: number;      // Average reading time per day (of days with reading)
}

// Monthly reading summary
export interface MonthlyReadingSummary {
  month: string;               // ISO month (YYYY-MM)
  totalDurationMs: number;     // Total reading across the month
  totalSessions: number;       // Total sessions across the month
  booksRead: number;           // Number of distinct books read
  daysWithReading: number;     // Number of days with any reading
  daysGoalMet: number;         // Number of days where daily goal was met
  averageDailyMs: number;      // Average reading time per day (of days with reading)
  booksCompleted: number;      // Books finished this month
}

// Combined response for reading goals API
export interface ReadingGoalsResponse {
  goals: ReadingGoals;
  streak: ReadingStreak;
  todayProgress: DailyReadingSummary;
  weekHistory: DailyReadingSummary[];  // Last 7 days
  weekSummary: WeeklyReadingSummary;   // Current week aggregated stats
  streakAtRisk: StreakRiskInfo | null; // Info about streak risk status
  upcomingFreezeDays: string[];        // Next freeze days in the upcoming week
}

// Information about streak risk status
export interface StreakRiskInfo {
  isAtRisk: boolean;           // Whether the streak is at risk today
  minutesRemaining: number;    // Minutes of reading needed to save streak
  hoursUntilMidnight: number;  // Hours until midnight (deadline)
  graceDaysRemaining: number;  // Grace days still available
  isFreezeDay: boolean;        // Whether today is a pre-scheduled freeze day
  nextFreezeDay: string | null; // Next upcoming freeze day (YYYY-MM-DD)
}

// Breakdown of highlights by category
export interface HighlightCategoryBreakdown {
  highlight: number;
  important: number;
  question: number;
  todo: number;
  definition: number;
}

// Breakdown of books by rating
export interface RatingBreakdown {
  rated5: number;
  rated4: number;
  rated3: number;
  rated2: number;
  rated1: number;
  unrated: number;
}

// Books completed by year breakdown
export interface YearlyCompletionBreakdown {
  [year: number]: number;  // year -> count of books completed
}

// Aggregated library statistics
export interface LibraryStatistics {
  totalBooks: number;
  totalPdfBooks: number;
  totalEpubBooks: number;
  totalReadingTimeMs: number;
  totalHighlights: number;
  totalBookmarks: number;
  booksCompleted: number;
  booksInProgress: number;
  booksUnread: number;
  averageProgress: number;
  collectionsCount: number;
  // Detailed statistics
  totalPagesRead: number;
  totalSessions: number;
  averageReadingSpeedPagesPerHour: number | null;
  averageSessionDurationMs: number | null;
  longestSessionMs: number | null;
  highlightsByCategory: HighlightCategoryBreakdown;
  booksByRating: RatingBreakdown;
  booksWithEstimatedCompletion: number;
  averageDaysToComplete: number | null;
  // Yearly statistics
  booksCompletedByYear: YearlyCompletionBreakdown;
  booksCompletedThisYear: number;
  currentYear: number;
}

// WebSocket event types
export type WebSocketEvent =
  | FileChangedEvent
  | FileDeletedEvent
  | LibraryUpdatedEvent
  | ClientOpenNoteEvent;

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

export interface ClientOpenNoteEvent {
  type: 'client:open-note';
  noteId: string;
  page?: number;
  cfi?: string;
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

export interface OpenNoteCommand {
  noteId: string;
  page?: number;
  cfi?: string;
}

// Highlight export types
export type HighlightExportFormat = 'markdown' | 'json' | 'csv' | 'plaintext';

export interface HighlightExportRequest {
  format: HighlightExportFormat;
  includeNotes?: boolean;        // Include note annotations (default true)
  includeCategories?: boolean;   // Include category information (default true)
  includeTimestamps?: boolean;   // Include created/updated timestamps (default true)
  groupByCategory?: boolean;     // Group highlights by category (default false)
}

export interface HighlightExportResponse {
  content: string;               // The exported content
  filename: string;              // Suggested filename
  mimeType: string;              // MIME type for download
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
