export interface ParsedBookmark {
  id: string;
  label: string;
  notes?: string;
  page?: number;
  cfi?: string;
  createdAt: string;
}

/**
 * Parse bookmarks from frontmatter.
 * Supports legacy wikilink strings and object entries with notes.
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

    if (typeof bookmark === 'string') {
      wikilink = bookmark;
    } else if (bookmark && typeof bookmark === 'object') {
      const bookmarkObj = bookmark as Record<string, unknown>;
      if (typeof bookmarkObj.link === 'string') {
        wikilink = bookmarkObj.link;
        notes =
          typeof bookmarkObj.notes === 'string' && bookmarkObj.notes.trim()
            ? bookmarkObj.notes.trim()
            : undefined;
      } else {
        continue;
      }
    } else {
      continue;
    }

    const wikiMatch = wikilink.match(
      /^\[\[([^\]|]+)(?:\|([^\]|]+))?(?:\|([^\]]+))?\]\]$/
    );
    if (!wikiMatch) continue;

    const [, pathWithFragment, label, timestamp] = wikiMatch;
    if (!pathWithFragment) continue;

    const fragmentMatch = pathWithFragment.match(/#(.+)$/);
    if (!fragmentMatch) continue;

    const fragment = fragmentMatch[1];
    const parsedBookmark: ParsedBookmark = {
      id: `bm-${Buffer.from(pathWithFragment).toString('base64').slice(0, 12)}`,
      label: label || 'Bookmark',
      notes,
      createdAt: timestamp || new Date().toISOString(),
    };

    const pageMatch = fragment.match(/page=(\d+)/);
    if (pageMatch) {
      parsedBookmark.page = parseInt(pageMatch[1], 10);
    }

    const cfiMatch = fragment.match(/cfi=(.+)$/);
    if (cfiMatch) {
      try {
        parsedBookmark.cfi = decodeURIComponent(cfiMatch[1]);
      } catch (decodeError) {
        console.warn(`Failed to decode CFI: ${cfiMatch[1]}`, decodeError);
        parsedBookmark.cfi = cfiMatch[1];
      }
    }

    parsed.push(parsedBookmark);
  }

  return parsed;
}

/**
 * Convert a bookmark to an Obsidian wikilink string for frontmatter storage.
 */
export function bookmarkToWikilink(
  sourceRelative: string,
  bookmark: { label: string; page?: number; cfi?: string; createdAt?: string }
): string {
  let fragment = '';

  if (bookmark.page !== undefined) {
    fragment = `#page=${bookmark.page}`;
  } else if (bookmark.cfi) {
    fragment = `#cfi=${encodeURIComponent(bookmark.cfi)}`;
  }

  const timestamp = bookmark.createdAt || new Date().toISOString();
  return `[[${sourceRelative}${fragment}|${bookmark.label}|${timestamp}]]`;
}

/**
 * Convert a bookmark to frontmatter storage format.
 */
export function bookmarkToFrontmatter(
  sourceRelative: string,
  bookmark: { label: string; notes?: string; page?: number; cfi?: string; createdAt?: string }
): string | { link: string; notes: string } {
  const wikilink = bookmarkToWikilink(sourceRelative, bookmark);

  if (bookmark.notes?.trim()) {
    return { link: wikilink, notes: bookmark.notes.trim() };
  }

  return wikilink;
}
