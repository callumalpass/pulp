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

export function getPaused(
  frontmatter: Record<string, unknown>,
  pausedKey: string
): boolean {
  const paused = frontmatter[pausedKey];
  return paused === true || paused === 'true';
}

export function getPausedAt(
  frontmatter: Record<string, unknown>,
  pausedAtKey: string
): string | null {
  const pausedAt = frontmatter[pausedAtKey];
  if (typeof pausedAt === 'string') {
    return pausedAt;
  }
  if (pausedAt instanceof Date) {
    return pausedAt.toISOString();
  }
  return null;
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
    return author.map(a => formatAuthorValue(a)).filter(Boolean).join(', ') || null;
  }

  // Handle object format (e.g., {first: "John", last: "Doe"} from citation managers)
  if (author && typeof author === 'object' && !Array.isArray(author)) {
    return formatAuthorValue(author);
  }

  return null;
}

/**
 * Format a single author value which could be a string or an object.
 * Handles common citation manager formats like {first: "John", last: "Doe"}.
 */
function formatAuthorValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Handle {first: "...", last: "..."} format
    if (typeof obj.first === 'string' || typeof obj.last === 'string') {
      const parts = [obj.first, obj.last].filter(p => typeof p === 'string' && p.trim());
      if (parts.length > 0) {
        return parts.join(' ').trim();
      }
    }

    // Handle {given: "...", family: "..."} format (CSL-JSON)
    if (typeof obj.given === 'string' || typeof obj.family === 'string') {
      const parts = [obj.given, obj.family].filter(p => typeof p === 'string' && p.trim());
      if (parts.length > 0) {
        return parts.join(' ').trim();
      }
    }

    // Handle {name: "..."} format
    if (typeof obj.name === 'string' && obj.name.trim()) {
      return obj.name.trim();
    }

    // Handle {literal: "..."} format (CSL-JSON)
    if (typeof obj.literal === 'string' && obj.literal.trim()) {
      return obj.literal.trim();
    }
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
  notes?: string;      // Optional notes/context about this bookmark
  page?: number;
  cfi?: string;
  createdAt: string;
}

/**
 * Parse bookmarks from frontmatter.
 * Supports two formats for backward compatibility:
 *
 * 1. Legacy wikilink format (string array):
 *    - PDF: [[source.pdf#page=18|Chapter 3]]
 *    - EPUB: [[source.epub#cfi=epubcfi(/6/4)|Introduction]]
 *    - With timestamp: [[source.pdf#page=18|Chapter 3|2024-01-15]]
 *
 * 2. New object format (with notes support):
 *    - { link: "[[source.pdf#page=18|Chapter 3|2024-01-15]]", notes: "My thoughts..." }
 */
export function getBookmarks(
  frontmatter: Record<string, unknown>,
  bookmarksKey: string
): ParsedBookmark[] {
  const bookmarks = frontmatter[bookmarksKey];

  if (!bookmarks || !Array.isArray(bookmarks)) return [];

  const parsed: ParsedBookmark[] = [];

  for (const bookmark of bookmarks) {
    let wikilink: string;
    let notes: string | undefined;

    // Handle both string (legacy) and object (new) formats
    if (typeof bookmark === 'string') {
      wikilink = bookmark;
    } else if (bookmark && typeof bookmark === 'object') {
      const bookmarkObj = bookmark as Record<string, unknown>;
      if (typeof bookmarkObj.link === 'string') {
        wikilink = bookmarkObj.link;
        notes = typeof bookmarkObj.notes === 'string' && bookmarkObj.notes.trim() ? bookmarkObj.notes.trim() : undefined;
      } else {
        continue;
      }
    } else {
      continue;
    }

    // Parse wikilink format: [[path#fragment|label]] or [[path#fragment|label|timestamp]]
    const wikiMatch = wikilink.match(/^\[\[([^\]|]+)(?:\|([^\]|]+))?(?:\|([^\]]+))?\]\]$/);
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
      notes,
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

/**
 * Convert a bookmark to frontmatter storage format.
 * Returns a string (wikilink) for bookmarks without notes,
 * or an object with link and notes for bookmarks with notes.
 */
export function bookmarkToFrontmatter(
  sourceRelative: string,
  bookmark: { label: string; notes?: string; page?: number; cfi?: string; createdAt?: string }
): string | { link: string; notes: string } {
  const wikilink = bookmarkToWikilink(sourceRelative, bookmark);

  // Only use object format if notes are present
  if (bookmark.notes?.trim()) {
    return { link: wikilink, notes: bookmark.notes.trim() };
  }

  return wikilink;
}

import type { ProgressMilestone, ReadingMomentum, ProgressMilestoneRecord, ReadingStats, CSLMetadata } from '@pulp/shared';

// Re-export ReadingStats as ParsedReadingStats for backward compatibility
// Uses the shared type which has optional milestones, momentum, momentumScore
export type ParsedReadingStats = ReadingStats;

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

  // Parse estimated completion date
  let estimatedCompletionDate: string | null = null;
  if (statsObj.estimated_completion) {
    if (statsObj.estimated_completion instanceof Date) {
      estimatedCompletionDate = statsObj.estimated_completion.toISOString().split('T')[0];
    } else if (typeof statsObj.estimated_completion === 'string') {
      // Accept either ISO date or YYYY-MM-DD
      const dateStr = statsObj.estimated_completion.split('T')[0];
      const date = new Date(dateStr + 'T12:00:00');
      if (!isNaN(date.getTime())) {
        estimatedCompletionDate = dateStr;
      }
    }
  }

  const averageDailyReadingMs = typeof statsObj.avg_daily_reading_ms === 'number'
    ? statsObj.avg_daily_reading_ms
    : null;

  // Parse milestones
  const milestones: ProgressMilestoneRecord[] = [];
  if (Array.isArray(statsObj.milestones)) {
    for (const m of statsObj.milestones) {
      if (m && typeof m === 'object') {
        const mObj = m as Record<string, unknown>;
        const milestone = mObj.milestone;
        if (typeof milestone === 'number' && [10, 25, 50, 75, 100].includes(milestone)) {
          milestones.push({
            milestone: milestone as ProgressMilestone,
            reachedAt: typeof mObj.reached_at === 'string' ? mObj.reached_at : new Date().toISOString(),
            daysFromStart: typeof mObj.days_from_start === 'number' ? mObj.days_from_start : null,
            totalReadingTimeMs: typeof mObj.total_time_ms === 'number' ? mObj.total_time_ms : 0,
          });
        }
      }
    }
  }

  // Parse momentum
  const validMomentumValues: ReadingMomentum[] = ['accelerating', 'steady', 'slowing', 'inactive'];
  const momentum = typeof statsObj.momentum === 'string' && validMomentumValues.includes(statsObj.momentum as ReadingMomentum)
    ? statsObj.momentum as ReadingMomentum
    : undefined;

  const momentumScore = typeof statsObj.momentum_score === 'number'
    ? Math.max(-100, Math.min(100, statsObj.momentum_score))
    : undefined;

  const result: ParsedReadingStats = {
    totalReadingTimeMs,
    totalSessions,
    averageSessionMs: totalSessions > 0 ? totalReadingTimeMs / totalSessions : 0,
    firstReadDate,
    pagesPerHour,
    totalPagesRead,
    longestSessionMs,
    estimatedCompletionDate,
    averageDailyReadingMs,
  };

  // Only add optional fields if they have values
  if (milestones.length > 0) {
    result.milestones = milestones;
  }
  if (momentum !== undefined) {
    result.momentum = momentum;
  }
  if (momentumScore !== undefined) {
    result.momentumScore = momentumScore;
  }

  return result;
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
  if (stats.estimatedCompletionDate !== null) {
    result.estimated_completion = stats.estimatedCompletionDate;
  }
  if (stats.averageDailyReadingMs !== null) {
    result.avg_daily_reading_ms = stats.averageDailyReadingMs;
  }
  // Save milestones if any
  if (stats.milestones && stats.milestones.length > 0) {
    result.milestones = stats.milestones.map(m => ({
      milestone: m.milestone,
      reached_at: m.reachedAt,
      days_from_start: m.daysFromStart,
      total_time_ms: m.totalReadingTimeMs,
    }));
  }
  // Save momentum if available
  if (stats.momentum !== undefined) {
    result.momentum = stats.momentum;
  }
  if (stats.momentumScore !== undefined) {
    result.momentum_score = stats.momentumScore;
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

import type { SessionQuality } from '@pulp/shared';

export interface ParsedReadingSession {
  startTime: string;
  endTime: string;
  durationMs: number;
  pagesRead: number;
  startPage: number;
  endPage: number;
  hourOfDay?: number;  // Hour when session started (0-23)
  quality?: SessionQuality; // Session quality based on focus metrics
  idlePauseCount?: number;  // Number of idle pauses during session
  idlePauseTotalMs?: number; // Total idle time during session
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
 * Get book notes from frontmatter.
 * Notes are stored as a simple string.
 */
export function getBookNotes(
  frontmatter: Record<string, unknown>,
  bookNotesKey: string
): string | null {
  const notes = frontmatter[bookNotesKey];
  if (typeof notes === 'string' && notes.trim()) {
    return notes.trim();
  }
  return null;
}

/**
 * Parse CSL (Citation Style Language) metadata from frontmatter.
 * Handles standard CSL-JSON field names used by citation managers like Zotero.
 */
export function getCSLMetadata(frontmatter: Record<string, unknown>): CSLMetadata | null {
  const csl: CSLMetadata = {
    type: getCSLString(frontmatter, 'type'),
    containerTitle: getCSLString(frontmatter, 'container-title'),
    publisher: getCSLString(frontmatter, 'publisher'),
    publisherPlace: getCSLString(frontmatter, 'publisher-place') || getCSLString(frontmatter, 'event-place'),
    issued: getCSLIssued(frontmatter),
    isbn: getCSLString(frontmatter, 'ISBN'),
    doi: getCSLDoi(frontmatter),
    url: getCSLString(frontmatter, 'URL'),
    edition: getCSLString(frontmatter, 'edition'),
    volume: getCSLString(frontmatter, 'volume'),
    issue: getCSLString(frontmatter, 'issue'),
    page: getCSLString(frontmatter, 'page'),
    collectionTitle: getCSLString(frontmatter, 'collection-title'),
    translator: getCSLPersons(frontmatter, 'translator'),
  };

  // Return null if no CSL metadata found
  const hasAnyValue = Object.values(csl).some(v => v !== null);
  return hasAnyValue ? csl : null;
}

/**
 * Get a string value from frontmatter, handling various formats.
 */
function getCSLString(frontmatter: Record<string, unknown>, key: string): string | null {
  const value = frontmatter[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

/**
 * Parse CSL issued date from frontmatter.
 * Handles both CSL date-parts format and simple year field.
 */
function getCSLIssued(frontmatter: Record<string, unknown>): string | null {
  // Try CSL issued format first: { date-parts: [[2023, 1, 15]] }
  const issued = frontmatter.issued;
  if (issued && typeof issued === 'object') {
    const issuedObj = issued as Record<string, unknown>;
    const dateParts = issuedObj['date-parts'];
    if (Array.isArray(dateParts) && dateParts.length > 0) {
      const parts = dateParts[0];
      if (Array.isArray(parts) && parts.length > 0) {
        // Extract year, month, day
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];

        if (typeof year === 'number' || typeof year === 'string') {
          const yearStr = String(year);
          if (month) {
            const monthStr = String(month).padStart(2, '0');
            if (day) {
              const dayStr = String(day).padStart(2, '0');
              return `${yearStr}-${monthStr}-${dayStr}`;
            }
            return `${yearStr}-${monthStr}`;
          }
          return yearStr;
        }
      }
    }
  }

  // Fallback to year field
  const year = frontmatter.year;
  if (typeof year === 'number') {
    return String(year);
  }
  if (typeof year === 'string' && year.trim()) {
    return year.trim();
  }

  return null;
}

/**
 * Parse DOI from frontmatter.
 * Handles both direct DOI field and note field with DOI.
 */
function getCSLDoi(frontmatter: Record<string, unknown>): string | null {
  // Direct DOI field
  const doi = frontmatter.DOI || frontmatter.doi;
  if (typeof doi === 'string' && doi.trim()) {
    return doi.trim();
  }

  // Check note field for DOI (common in Zotero exports)
  const note = frontmatter.note;
  if (typeof note === 'string') {
    const doiMatch = note.match(/DOI:\s*(\S+)/i);
    if (doiMatch) {
      return doiMatch[1];
    }
  }

  return null;
}

/**
 * Format CSL person array (authors, translators, etc.) to a string.
 */
function getCSLPersons(frontmatter: Record<string, unknown>, key: string): string | null {
  const persons = frontmatter[key];

  if (!persons) return null;

  if (typeof persons === 'string' && persons.trim()) {
    return persons.trim();
  }

  if (Array.isArray(persons) && persons.length > 0) {
    const formatted = persons.map(p => formatAuthorValue(p)).filter(Boolean);
    return formatted.length > 0 ? formatted.join(', ') : null;
  }

  if (typeof persons === 'object') {
    return formatAuthorValue(persons);
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

    // Extract hour of day from start time (or use stored value)
    let hourOfDay: number | undefined;
    if (typeof sessionObj.hour_of_day === 'number') {
      hourOfDay = sessionObj.hour_of_day;
    } else {
      // Calculate from startTime if not stored
      const startDate = new Date(startTime);
      hourOfDay = startDate.getHours();
    }

    // Parse quality metrics
    const validQualities: SessionQuality[] = ['deep', 'focused', 'normal', 'distracted'];
    const quality = typeof sessionObj.quality === 'string' && validQualities.includes(sessionObj.quality as SessionQuality)
      ? sessionObj.quality as SessionQuality
      : undefined;

    const idlePauseCount = typeof sessionObj.idle_pause_count === 'number' && sessionObj.idle_pause_count >= 0
      ? sessionObj.idle_pause_count
      : undefined;

    const idlePauseTotalMs = typeof sessionObj.idle_pause_total_ms === 'number' && sessionObj.idle_pause_total_ms >= 0
      ? sessionObj.idle_pause_total_ms
      : undefined;

    entries.push({
      startTime,
      endTime,
      durationMs: typeof sessionObj.duration_ms === 'number' ? sessionObj.duration_ms : 0,
      pagesRead: typeof sessionObj.pages === 'number' ? sessionObj.pages : 0,
      startPage: typeof sessionObj.start_page === 'number' ? sessionObj.start_page : 0,
      endPage: typeof sessionObj.end_page === 'number' ? sessionObj.end_page : 0,
      hourOfDay,
      quality,
      idlePauseCount,
      idlePauseTotalMs,
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
  const result: Record<string, unknown> = {
    start: session.startTime,
    end: session.endTime,
    duration_ms: session.durationMs,
    pages: session.pagesRead,
    start_page: session.startPage,
    end_page: session.endPage,
  };

  // Include hour of day if available
  if (session.hourOfDay !== undefined) {
    result.hour_of_day = session.hourOfDay;
  }

  // Include quality metrics if available
  if (session.quality !== undefined) {
    result.quality = session.quality;
  }
  if (session.idlePauseCount !== undefined) {
    result.idle_pause_count = session.idlePauseCount;
  }
  if (session.idlePauseTotalMs !== undefined) {
    result.idle_pause_total_ms = session.idlePauseTotalMs;
  }

  return result;
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

/**
 * Calculate session quality based on idle pause metrics.
 * - deep: No idle pauses, long sessions (30+ min)
 * - focused: 0-1 idle pauses, or short idle time (<5% of session)
 * - normal: 2-4 idle pauses, or moderate idle time (5-15% of session)
 * - distracted: 5+ idle pauses, or high idle time (>15% of session)
 */
export function calculateSessionQuality(
  durationMs: number,
  idlePauseCount: number | undefined,
  idlePauseTotalMs: number | undefined
): SessionQuality {
  // Minimum session duration for meaningful quality assessment (5 minutes)
  if (durationMs < 5 * 60 * 1000) {
    return 'normal';
  }

  const pauseCount = idlePauseCount ?? 0;
  const pauseTotalMs = idlePauseTotalMs ?? 0;
  const idlePercentage = durationMs > 0 ? (pauseTotalMs / durationMs) * 100 : 0;

  // Deep focus: no pauses and long session (30+ min)
  if (pauseCount === 0 && durationMs >= 30 * 60 * 1000) {
    return 'deep';
  }

  // Focused: minimal interruptions
  if (pauseCount <= 1 && idlePercentage < 5) {
    return 'focused';
  }

  // Distracted: many interruptions or lots of idle time
  if (pauseCount >= 5 || idlePercentage > 15) {
    return 'distracted';
  }

  // Normal: moderate interruptions
  return 'normal';
}

/**
 * Check if a progress milestone has been crossed.
 * Returns the highest milestone crossed that hasn't been recorded yet.
 */
export function checkMilestones(
  previousProgress: number,
  currentProgress: number,
  existingMilestones: ProgressMilestoneRecord[]
): ProgressMilestone | null {
  const milestones: ProgressMilestone[] = [10, 25, 50, 75, 100];
  const recordedMilestones = new Set(existingMilestones.map(m => m.milestone));

  // Find the highest milestone that was crossed and not yet recorded
  for (let i = milestones.length - 1; i >= 0; i--) {
    const milestone = milestones[i];
    if (currentProgress >= milestone && previousProgress < milestone && !recordedMilestones.has(milestone)) {
      return milestone;
    }
  }

  return null;
}

/**
 * Calculate days between two dates.
 */
function daysBetweenDates(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Create a milestone record.
 */
export function createMilestoneRecord(
  milestone: ProgressMilestone,
  firstReadDate: string | null,
  totalReadingTimeMs: number
): ProgressMilestoneRecord {
  const now = new Date().toISOString();
  return {
    milestone,
    reachedAt: now,
    daysFromStart: firstReadDate ? daysBetweenDates(firstReadDate, now) : null,
    totalReadingTimeMs,
  };
}

/**
 * Calculate reading momentum based on recent activity.
 * Compares reading activity in the last 7 days vs the previous 7 days.
 * Returns a momentum classification and a numeric score from -100 to 100.
 */
export function calculateMomentum(
  readingHistory: ParsedDailyReadingEntry[]
): { momentum: ReadingMomentum; score: number } {
  const today = new Date();

  // Get data for the last 14 days
  const last7Days: number[] = [];
  const previous7Days: number[] = [];

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const entry = readingHistory.find(h => h.date === dateStr);
    const durationMs = entry?.durationMs ?? 0;

    if (i < 7) {
      last7Days.push(durationMs);
    } else {
      previous7Days.push(durationMs);
    }
  }

  const recentTotal = last7Days.reduce((sum, d) => sum + d, 0);
  const previousTotal = previous7Days.reduce((sum, d) => sum + d, 0);

  // Count active days
  const recentActiveDays = last7Days.filter(d => d > 0).length;
  const previousActiveDays = previous7Days.filter(d => d > 0).length;

  // No reading in either period
  if (recentTotal === 0 && previousTotal === 0) {
    return { momentum: 'inactive', score: 0 };
  }

  // Calculate momentum score
  // Based on both total reading time and active days
  let score = 0;

  if (previousTotal > 0) {
    // Percentage change in reading time, weighted
    const timeChange = ((recentTotal - previousTotal) / previousTotal) * 50;
    score += Math.max(-50, Math.min(50, timeChange));
  } else if (recentTotal > 0) {
    // Coming back from inactivity - positive momentum
    score += 25;
  }

  // Active days change
  const daysDiff = recentActiveDays - previousActiveDays;
  score += daysDiff * 10; // Each additional active day adds 10 points

  // Clamp score to -100 to 100
  score = Math.max(-100, Math.min(100, Math.round(score)));

  // Classify momentum
  let momentum: ReadingMomentum;
  if (recentTotal === 0 && recentActiveDays === 0) {
    momentum = 'inactive';
  } else if (score >= 20) {
    momentum = 'accelerating';
  } else if (score <= -20) {
    momentum = 'slowing';
  } else {
    momentum = 'steady';
  }

  return { momentum, score };
}
