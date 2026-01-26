import matter from 'gray-matter';
import { readFileSync } from 'node:fs';

/** Maximum number of days of reading history to retain */
const READING_HISTORY_MAX_DAYS = 90;

/** Minimum valid rating value */
const MIN_RATING = 1;

/** Maximum valid rating value */
const MAX_RATING = 5;

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function parseNoteFrontmatter(filePath: string): ParsedNote {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    frontmatter: data,
    content,
  };
}

export function hasTag(frontmatter: Record<string, unknown>, tag: string): boolean {
  const tags = frontmatter.tags;

  if (!tags) return false;

  const normalizedTarget = normalizeTag(tag);

  if (Array.isArray(tags)) {
    // Match exact tag or tag with suffix (e.g., literature_note matches literature_note/read)
    return tags.some(t => {
      const normalized = normalizeTag(String(t));
      return normalized === normalizedTarget || normalized.startsWith(normalizedTarget + '/');
    });
  }

  if (typeof tags === 'string') {
    // Handle comma-separated tags
    return tags.split(',').some(t => {
      const normalized = normalizeTag(t.trim());
      return normalized === normalizedTarget || normalized.startsWith(normalizedTarget + '/');
    });
  }

  return false;
}

function normalizeTag(tag: string): string {
  // Remove # prefix if present and lowercase
  return tag.replace(/^#/, '').toLowerCase();
}

export function getSourcePath(
  frontmatter: Record<string, unknown>,
  sourceKey: string
): string | null {
  let source = frontmatter[sourceKey];

  if (!source) return null;

  // Handle array format (e.g., attachment: ["[[path|display]]"])
  if (Array.isArray(source)) {
    source = source[0];
  }

  if (typeof source === 'string') {
    // Handle Obsidian wiki-link format: [[path/to/file.pdf|displayName]]
    // The path may include a display name after |
    const wikiMatch = source.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
    if (wikiMatch) {
      return wikiMatch[1];
    }
    // Also handle quoted strings in YAML
    return source.replace(/^['"]|['"]$/g, '');
  }

  return null;
}

export function getProgress(
  frontmatter: Record<string, unknown>,
  progressKey: string
): number {
  const progress = frontmatter[progressKey];

  if (typeof progress === 'number') {
    return Math.max(0, Math.min(100, progress));
  }

  if (typeof progress === 'string') {
    const parsed = parseFloat(progress);
    if (!isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return 0;
}

export function getLastRead(
  frontmatter: Record<string, unknown>,
  lastReadKey: string
): string | null {
  const lastRead = frontmatter[lastReadKey];

  if (!lastRead) return null;

  if (lastRead instanceof Date) {
    return lastRead.toISOString();
  }

  if (typeof lastRead === 'string') {
    const date = new Date(lastRead);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export function getLastOpenedCfi(
  frontmatter: Record<string, unknown>,
  lastOpenedCfiKey: string
): string | null {
  const cfi = frontmatter[lastOpenedCfiKey];

  if (typeof cfi === 'string' && cfi.trim()) {
    return cfi.trim();
  }

  return null;
}

export function getDateCreated(
  frontmatter: Record<string, unknown>,
  dateCreatedKey: string
): string | null {
  const dateCreated = frontmatter[dateCreatedKey];

  if (!dateCreated) return null;

  if (dateCreated instanceof Date) {
    return dateCreated.toISOString();
  }

  if (typeof dateCreated === 'string') {
    const date = new Date(dateCreated);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export function getDateFinished(
  frontmatter: Record<string, unknown>,
  dateFinishedKey: string
): string | null {
  const dateFinished = frontmatter[dateFinishedKey];

  if (!dateFinished) return null;

  if (dateFinished instanceof Date) {
    return dateFinished.toISOString();
  }

  if (typeof dateFinished === 'string') {
    const date = new Date(dateFinished);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export function getCollections(
  frontmatter: Record<string, unknown>,
  collectionsKey: string
): string[] {
  const collections = frontmatter[collectionsKey];

  if (!collections) return [];

  if (Array.isArray(collections)) {
    return collections
      .filter((c): c is string => typeof c === 'string')
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }

  if (typeof collections === 'string') {
    return collections
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }

  return [];
}

export function getTitle(frontmatter: Record<string, unknown>, fileName: string): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  // Fallback to filename without extension
  return fileName.replace(/\.md$/, '');
}

export function getPinned(
  frontmatter: Record<string, unknown>,
  pinnedKey: string
): boolean {
  const pinned = frontmatter[pinnedKey];
  return pinned === true || pinned === 'true';
}

export function getAuthor(
  frontmatter: Record<string, unknown>,
  authorKey: string
): string | null {
  const author = frontmatter[authorKey];

  if (typeof author === 'string' && author.trim()) {
    return author.trim();
  }

  // Handle array format (multiple authors)
  if (Array.isArray(author) && author.length > 0) {
    return author.map(a => String(a).trim()).join(', ');
  }

  return null;
}

export function getRating(
  frontmatter: Record<string, unknown>,
  ratingKey: string
): number | null {
  const rating = frontmatter[ratingKey];

  if (typeof rating === 'number') {
    // Clamp to valid range
    const clamped = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating)));
    return clamped;
  }

  if (typeof rating === 'string') {
    const parsed = parseFloat(rating);
    if (!isNaN(parsed)) {
      return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(parsed)));
    }
  }

  return null;
}

export function getTotalPages(
  frontmatter: Record<string, unknown>,
  totalPagesKey: string
): number | null {
  const totalPages = frontmatter[totalPagesKey];

  if (typeof totalPages === 'number' && totalPages > 0) {
    return Math.round(totalPages);
  }

  if (typeof totalPages === 'string') {
    const parsed = parseInt(totalPages, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export interface ParsedBookmark {
  id: string;
  label: string;
  page?: number;
  cfi?: string;
  createdAt: string;
}

/**
 * Parse bookmarks from frontmatter.
 * Bookmarks are stored as wikilinks:
 * - PDF: [[source.pdf#page=18|Chapter 3]]
 * - EPUB: [[source.epub#cfi=epubcfi(/6/4)|Introduction]]
 *
 * Can also include a timestamp suffix: [[source.pdf#page=18|Chapter 3|2024-01-15]]
 */
export function getBookmarks(
  frontmatter: Record<string, unknown>,
  bookmarksKey: string
): ParsedBookmark[] {
  const bookmarks = frontmatter[bookmarksKey];

  if (!bookmarks || !Array.isArray(bookmarks)) return [];

  const parsed: ParsedBookmark[] = [];

  for (const bookmark of bookmarks) {
    if (typeof bookmark !== 'string') continue;

    // Parse wikilink format: [[path#fragment|label]] or [[path#fragment|label|timestamp]]
    const wikiMatch = bookmark.match(/^\[\[([^\]|]+)(?:\|([^\]|]+))?(?:\|([^\]]+))?\]\]$/);
    if (!wikiMatch) continue;

    const [, pathWithFragment, label, timestamp] = wikiMatch;
    if (!pathWithFragment) continue;

    // Extract fragment (page or cfi)
    const fragmentMatch = pathWithFragment.match(/#(.+)$/);
    if (!fragmentMatch) continue;

    const fragment = fragmentMatch[1];
    const parsedBookmark: ParsedBookmark = {
      id: `bm-${Buffer.from(pathWithFragment).toString('base64').slice(0, 12)}`,
      label: label || 'Bookmark',
      createdAt: timestamp || new Date().toISOString(),
    };

    // Parse page number for PDFs
    const pageMatch = fragment.match(/page=(\d+)/);
    if (pageMatch) {
      parsedBookmark.page = parseInt(pageMatch[1], 10);
    }

    // Parse CFI for EPUBs
    const cfiMatch = fragment.match(/cfi=(.+)$/);
    if (cfiMatch) {
      try {
        parsedBookmark.cfi = decodeURIComponent(cfiMatch[1]);
      } catch (decodeError) {
        // If URL decoding fails, use the raw value
        console.warn(`Failed to decode CFI: ${cfiMatch[1]}`, decodeError);
        parsedBookmark.cfi = cfiMatch[1];
      }
    }

    parsed.push(parsedBookmark);
  }

  return parsed;
}

/**
 * Convert a bookmark to an Obsidian wikilink string for storage in frontmatter.
 */
export function bookmarkToWikilink(
  sourceRelative: string,
  bookmark: { label: string; page?: number; cfi?: string; createdAt?: string }
): string {
  let fragment = '';

  if (bookmark.page !== undefined) {
    fragment = `#page=${bookmark.page}`;
  } else if (bookmark.cfi) {
    // URL-encode the CFI for safety in wikilinks
    fragment = `#cfi=${encodeURIComponent(bookmark.cfi)}`;
  }

  const timestamp = bookmark.createdAt || new Date().toISOString();

  return `[[${sourceRelative}${fragment}|${bookmark.label}|${timestamp}]]`;
}

export interface ParsedReadingStats {
  totalReadingTimeMs: number;
  totalSessions: number;
  averageSessionMs: number;
  firstReadDate: string | null;
  pagesPerHour: number | null;
  totalPagesRead: number;
  longestSessionMs: number | null;
}

/**
 * Parse reading statistics from frontmatter.
 * Stats are stored as a simple object:
 * reading_stats:
 *   total_time_ms: 3600000
 *   total_sessions: 5
 *   first_read: "2024-01-15T10:30:00Z"
 */
export function getReadingStats(
  frontmatter: Record<string, unknown>,
  readingStatsKey: string
): ParsedReadingStats | null {
  const stats = frontmatter[readingStatsKey];

  if (!stats || typeof stats !== 'object') return null;

  const statsObj = stats as Record<string, unknown>;

  const totalReadingTimeMs = typeof statsObj.total_time_ms === 'number'
    ? statsObj.total_time_ms
    : 0;

  const totalSessions = typeof statsObj.total_sessions === 'number'
    ? statsObj.total_sessions
    : 0;

  let firstReadDate: string | null = null;
  if (statsObj.first_read) {
    if (statsObj.first_read instanceof Date) {
      firstReadDate = statsObj.first_read.toISOString();
    } else if (typeof statsObj.first_read === 'string') {
      const date = new Date(statsObj.first_read);
      if (!isNaN(date.getTime())) {
        firstReadDate = date.toISOString();
      }
    }
  }

  // Parse reading speed metrics
  const pagesPerHour = typeof statsObj.pages_per_hour === 'number'
    ? statsObj.pages_per_hour
    : null;

  const totalPagesRead = typeof statsObj.total_pages === 'number'
    ? statsObj.total_pages
    : 0;

  const longestSessionMs = typeof statsObj.longest_session_ms === 'number'
    ? statsObj.longest_session_ms
    : null;

  return {
    totalReadingTimeMs,
    totalSessions,
    averageSessionMs: totalSessions > 0 ? totalReadingTimeMs / totalSessions : 0,
    firstReadDate,
    pagesPerHour,
    totalPagesRead,
    longestSessionMs,
  };
}

/**
 * Create reading stats object for frontmatter storage.
 */
export function createReadingStatsForFrontmatter(
  stats: ParsedReadingStats
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    total_time_ms: stats.totalReadingTimeMs,
    total_sessions: stats.totalSessions,
    first_read: stats.firstReadDate,
  };

  // Only include new fields if they have values (backward compatibility)
  if (stats.pagesPerHour !== null) {
    result.pages_per_hour = stats.pagesPerHour;
  }
  if (stats.totalPagesRead > 0) {
    result.total_pages = stats.totalPagesRead;
  }
  if (stats.longestSessionMs !== null) {
    result.longest_session_ms = stats.longestSessionMs;
  }

  return result;
}

export interface ParsedDailyReadingEntry {
  date: string;              // YYYY-MM-DD
  durationMs: number;
  sessions: number;
  pagesRead: number;
}

/**
 * Parse daily reading history from frontmatter.
 * History is stored as an array of objects:
 * reading_history:
 *   - date: "2024-01-15"
 *     duration_ms: 1800000
 *     sessions: 2
 *     pages: 15
 */
export function getDailyReadingHistory(
  frontmatter: Record<string, unknown>,
  historyKey: string
): ParsedDailyReadingEntry[] {
  const history = frontmatter[historyKey];

  if (!history || !Array.isArray(history)) return [];

  const entries: ParsedDailyReadingEntry[] = [];

  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;

    const entryObj = entry as Record<string, unknown>;

    // Parse date - accept both Date objects and strings
    let date: string | null = null;
    if (entryObj.date instanceof Date) {
      date = entryObj.date.toISOString().split('T')[0];
    } else if (typeof entryObj.date === 'string') {
      // Validate YYYY-MM-DD format
      const match = entryObj.date.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) {
        date = match[0];
      }
    }

    if (!date) continue;

    entries.push({
      date,
      durationMs: typeof entryObj.duration_ms === 'number' ? entryObj.duration_ms : 0,
      sessions: typeof entryObj.sessions === 'number' ? entryObj.sessions : 0,
      pagesRead: typeof entryObj.pages === 'number' ? entryObj.pages : 0,
    });
  }

  // Sort by date descending (most recent first)
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Create daily reading history entry for frontmatter storage.
 */
export function createDailyReadingEntryForFrontmatter(
  entry: ParsedDailyReadingEntry
): Record<string, unknown> {
  return {
    date: entry.date,
    duration_ms: entry.durationMs,
    sessions: entry.sessions,
    pages: entry.pagesRead,
  };
}

/**
 * Update or add a daily reading entry in the history array.
 * Keeps only the last 90 days of history to avoid bloating frontmatter.
 */
export function updateDailyReadingHistory(
  existingHistory: ParsedDailyReadingEntry[],
  date: string,
  sessionDurationMs: number,
  pagesRead: number
): ParsedDailyReadingEntry[] {
  const updated = [...existingHistory];

  // Find existing entry for this date
  const existingIndex = updated.findIndex(e => e.date === date);

  if (existingIndex >= 0) {
    // Update existing entry
    updated[existingIndex] = {
      ...updated[existingIndex],
      durationMs: updated[existingIndex].durationMs + sessionDurationMs,
      sessions: updated[existingIndex].sessions + 1,
      pagesRead: updated[existingIndex].pagesRead + pagesRead,
    };
  } else {
    // Add new entry
    updated.push({
      date,
      durationMs: sessionDurationMs,
      sessions: 1,
      pagesRead,
    });
  }

  // Sort by date descending and keep only recent history
  return updated
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, READING_HISTORY_MAX_DAYS);
}

/** Valid zoom modes */
const VALID_ZOOM_MODES = ['fit-width', 'fit-page', 'custom'] as const;

/** Valid reader themes */
const VALID_THEMES = ['light', 'dark', 'sepia', 'eink'] as const;

export interface ParsedReaderPreferences {
  zoomLevel?: number;
  zoomMode?: 'fit-width' | 'fit-page' | 'custom';
  theme?: 'light' | 'dark' | 'sepia' | 'eink';
  fontSize?: number;
  lineHeight?: number;
  dailyGoalMinutes?: number;
}

/** Maximum number of reading sessions to retain per book */
const READING_SESSIONS_MAX_COUNT = 100;

export interface ParsedReadingSession {
  startTime: string;
  endTime: string;
  durationMs: number;
  pagesRead: number;
  startPage: number;
  endPage: number;
}

/**
 * Parse reader preferences from frontmatter.
 * Preferences are stored as a simple object:
 * reader_preferences:
 *   zoom_level: 1.25
 *   zoom_mode: fit-width
 *   theme: dark
 *   font_size: 18
 *   line_height: 1.6
 */
export function getReaderPreferences(
  frontmatter: Record<string, unknown>,
  readerPreferencesKey: string
): ParsedReaderPreferences | null {
  const prefs = frontmatter[readerPreferencesKey];

  if (!prefs || typeof prefs !== 'object') return null;

  const prefsObj = prefs as Record<string, unknown>;
  const result: ParsedReaderPreferences = {};

  // Parse zoom level (0.25 - 5.0)
  if (typeof prefsObj.zoom_level === 'number') {
    result.zoomLevel = Math.max(0.25, Math.min(5, prefsObj.zoom_level));
  }

  // Parse zoom mode
  if (typeof prefsObj.zoom_mode === 'string' && VALID_ZOOM_MODES.includes(prefsObj.zoom_mode as typeof VALID_ZOOM_MODES[number])) {
    result.zoomMode = prefsObj.zoom_mode as ParsedReaderPreferences['zoomMode'];
  }

  // Parse theme
  if (typeof prefsObj.theme === 'string' && VALID_THEMES.includes(prefsObj.theme as typeof VALID_THEMES[number])) {
    result.theme = prefsObj.theme as ParsedReaderPreferences['theme'];
  }

  // Parse font size (8 - 48)
  if (typeof prefsObj.font_size === 'number') {
    result.fontSize = Math.max(8, Math.min(48, Math.round(prefsObj.font_size)));
  }

  // Parse line height (1.0 - 3.0)
  if (typeof prefsObj.line_height === 'number') {
    result.lineHeight = Math.max(1, Math.min(3, prefsObj.line_height));
  }

  // Parse daily goal minutes override (1 - 1440)
  if (typeof prefsObj.daily_goal_minutes === 'number') {
    result.dailyGoalMinutes = Math.max(1, Math.min(1440, Math.round(prefsObj.daily_goal_minutes)));
  }

  // Return null if no valid preferences found
  if (Object.keys(result).length === 0) return null;

  return result;
}

/**
 * Create reader preferences object for frontmatter storage.
 */
export function createReaderPreferencesForFrontmatter(
  prefs: ParsedReaderPreferences
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (prefs.zoomLevel !== undefined) {
    result.zoom_level = Math.round(prefs.zoomLevel * 100) / 100; // Round to 2 decimals
  }
  if (prefs.zoomMode !== undefined) {
    result.zoom_mode = prefs.zoomMode;
  }
  if (prefs.theme !== undefined) {
    result.theme = prefs.theme;
  }
  if (prefs.fontSize !== undefined) {
    result.font_size = prefs.fontSize;
  }
  if (prefs.lineHeight !== undefined) {
    result.line_height = Math.round(prefs.lineHeight * 10) / 10; // Round to 1 decimal
  }
  if (prefs.dailyGoalMinutes !== undefined) {
    result.daily_goal_minutes = prefs.dailyGoalMinutes;
  }

  return result;
}

/**
 * Get current chapter name from frontmatter.
 */
export function getCurrentChapter(
  frontmatter: Record<string, unknown>,
  currentChapterKey: string
): string | null {
  const chapter = frontmatter[currentChapterKey];
  if (typeof chapter === 'string' && chapter.trim()) {
    return chapter.trim();
  }
  return null;
}

/**
 * Parse reading sessions from frontmatter.
 * Sessions are stored as an array of objects:
 * reading_sessions:
 *   - start: "2024-01-15T10:30:00Z"
 *     end: "2024-01-15T11:00:00Z"
 *     duration_ms: 1800000
 *     pages: 15
 *     start_page: 10
 *     end_page: 25
 */
export function getReadingSessions(
  frontmatter: Record<string, unknown>,
  sessionsKey: string
): ParsedReadingSession[] {
  const sessions = frontmatter[sessionsKey];

  if (!sessions || !Array.isArray(sessions)) return [];

  const entries: ParsedReadingSession[] = [];

  for (const session of sessions) {
    if (!session || typeof session !== 'object') continue;

    const sessionObj = session as Record<string, unknown>;

    // Parse start time
    let startTime: string | null = null;
    if (sessionObj.start instanceof Date) {
      startTime = sessionObj.start.toISOString();
    } else if (typeof sessionObj.start === 'string') {
      const date = new Date(sessionObj.start);
      if (!isNaN(date.getTime())) {
        startTime = date.toISOString();
      }
    }

    // Parse end time
    let endTime: string | null = null;
    if (sessionObj.end instanceof Date) {
      endTime = sessionObj.end.toISOString();
    } else if (typeof sessionObj.end === 'string') {
      const date = new Date(sessionObj.end);
      if (!isNaN(date.getTime())) {
        endTime = date.toISOString();
      }
    }

    if (!startTime || !endTime) continue;

    entries.push({
      startTime,
      endTime,
      durationMs: typeof sessionObj.duration_ms === 'number' ? sessionObj.duration_ms : 0,
      pagesRead: typeof sessionObj.pages === 'number' ? sessionObj.pages : 0,
      startPage: typeof sessionObj.start_page === 'number' ? sessionObj.start_page : 0,
      endPage: typeof sessionObj.end_page === 'number' ? sessionObj.end_page : 0,
    });
  }

  // Sort by start time descending (most recent first)
  return entries.sort((a, b) => b.startTime.localeCompare(a.startTime));
}

/**
 * Create reading session entry for frontmatter storage.
 */
export function createReadingSessionForFrontmatter(
  session: ParsedReadingSession
): Record<string, unknown> {
  return {
    start: session.startTime,
    end: session.endTime,
    duration_ms: session.durationMs,
    pages: session.pagesRead,
    start_page: session.startPage,
    end_page: session.endPage,
  };
}

/**
 * Add a new reading session to the sessions array.
 * Keeps only the most recent sessions to avoid bloating frontmatter.
 */
export function addReadingSession(
  existingSessions: ParsedReadingSession[],
  newSession: ParsedReadingSession
): ParsedReadingSession[] {
  const updated = [newSession, ...existingSessions];

  // Sort by start time descending and keep only recent sessions
  return updated
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, READING_SESSIONS_MAX_COUNT);
}
