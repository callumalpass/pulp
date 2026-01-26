import matter from 'gray-matter';
import { readFileSync } from 'node:fs';

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
      parsedBookmark.cfi = decodeURIComponent(cfiMatch[1]);
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

  return {
    totalReadingTimeMs,
    totalSessions,
    averageSessionMs: totalSessions > 0 ? totalReadingTimeMs / totalSessions : 0,
    firstReadDate,
  };
}

/**
 * Create reading stats object for frontmatter storage.
 */
export function createReadingStatsForFrontmatter(
  stats: ParsedReadingStats
): Record<string, unknown> {
  return {
    total_time_ms: stats.totalReadingTimeMs,
    total_sessions: stats.totalSessions,
    first_read: stats.firstReadDate,
  };
}
