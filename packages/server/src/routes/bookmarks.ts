import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { Bookmark, CreateBookmarkRequest, UpdateBookmarkRequest } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { bookmarkToWikilink, bookmarkToFrontmatter, getBookmarks } from '../services/frontmatter-parser.js';

interface BookmarkRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

/** Maximum allowed bookmark label length */
const MAX_LABEL_LENGTH = 500;

/** Minimum allowed bookmark label length */
const MIN_LABEL_LENGTH = 1;

/**
 * Validate and sanitize a bookmark label.
 * Returns the sanitized label or null if invalid.
 */
function validateLabel(label: string): { valid: true; label: string } | { valid: false; error: string } {
  if (typeof label !== 'string') {
    return { valid: false, error: 'Label must be a string' };
  }

  const trimmed = label.trim();

  if (trimmed.length < MIN_LABEL_LENGTH) {
    return { valid: false, error: 'Label cannot be empty' };
  }

  if (trimmed.length > MAX_LABEL_LENGTH) {
    return { valid: false, error: `Label cannot exceed ${MAX_LABEL_LENGTH} characters` };
  }

  return { valid: true, label: trimmed };
}

/**
 * Validate page number is within valid range.
 */
function validatePage(page: number | undefined, totalPages: number | null): { valid: true } | { valid: false; error: string } {
  if (page === undefined) {
    return { valid: true };
  }

  if (typeof page !== 'number' || !Number.isInteger(page)) {
    return { valid: false, error: 'Page must be an integer' };
  }

  if (page < 1) {
    return { valid: false, error: 'Page must be at least 1' };
  }

  if (totalPages !== null && page > totalPages) {
    return { valid: false, error: `Page ${page} exceeds document length of ${totalPages} pages` };
  }

  return { valid: true };
}

export const bookmarkRoutes: FastifyPluginAsync<BookmarkRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // GET /api/library/:id/bookmarks - Get all bookmarks for a note
  fastify.get<{
    Params: { id: string };
  }>('/api/library/:id/bookmarks', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return note.bookmarks;
  });

  // POST /api/library/:id/bookmarks - Add a new bookmark
  fastify.post<{
    Params: { id: string };
    Body: CreateBookmarkRequest;
  }>('/api/library/:id/bookmarks', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
          notes: { type: 'string' },
          page: { type: 'number' },
          cfi: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { label, notes, page, cfi } = request.body;

    // Validate label
    const labelResult = validateLabel(label);
    if (!labelResult.valid) {
      return reply.code(400).send({ error: labelResult.error });
    }

    // Validate page if provided
    const pageResult = validatePage(page, note.totalPages);
    if (!pageResult.valid) {
      return reply.code(400).send({ error: pageResult.error });
    }

    // Ensure either page or cfi is provided (but not both required)
    if (page === undefined && cfi === undefined) {
      return reply.code(400).send({ error: 'Either page or cfi must be provided' });
    }

    const now = new Date().toISOString();

    // Generate a unique ID based on location
    const locationKey = page !== undefined ? `page-${page}` : `cfi-${cfi}`;
    const id = `bm-${Buffer.from(locationKey).toString('base64').slice(0, 12)}`;

    const newBookmark: Bookmark = {
      id,
      label: labelResult.label,
      notes: notes?.trim() || undefined,
      page,
      cfi,
      createdAt: now,
    };

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get existing bookmarks array or create new one
      const existingBookmarks = frontmatter[config.bookmarks_key];
      const bookmarksArray: (string | { link: string; notes: string })[] = Array.isArray(existingBookmarks) ? [...existingBookmarks] : [];

      // Convert bookmark to frontmatter format (string or object based on whether notes exist)
      const bookmarkEntry = bookmarkToFrontmatter(note.sourceRelative, newBookmark);
      bookmarksArray.push(bookmarkEntry);

      // Update frontmatter
      frontmatter[config.bookmarks_key] = bookmarksArray;

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Re-parse bookmarks to get the full list with IDs
      const parsedBookmarks = getBookmarks(frontmatter, config.bookmarks_key);

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        bookmarks: parsedBookmarks,
      });

      return newBookmark;
    } catch (error) {
      fastify.log.error(error, 'Failed to add bookmark');
      return reply.code(500).send({ error: 'Failed to add bookmark' });
    }
  });

  // PATCH /api/library/:id/bookmarks/:bookmarkId - Update a bookmark's label and/or notes
  fastify.patch<{
    Params: { id: string; bookmarkId: string };
    Body: UpdateBookmarkRequest;
  }>('/api/library/:id/bookmarks/:bookmarkId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'bookmarkId'],
        properties: {
          id: { type: 'string' },
          bookmarkId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { bookmarkId } = request.params;
    const { label, notes } = request.body;

    // Find the bookmark in the current list
    const bookmarkIndex = note.bookmarks.findIndex(b => b.id === bookmarkId);
    if (bookmarkIndex === -1) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    const existingBookmark = note.bookmarks[bookmarkIndex];

    // Validate label if provided
    let validatedLabel: string | undefined;
    if (label !== undefined) {
      const labelResult = validateLabel(label);
      if (!labelResult.valid) {
        return reply.code(400).send({ error: labelResult.error });
      }
      validatedLabel = labelResult.label;
    }

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get bookmarks array
      const bookmarksArray = frontmatter[config.bookmarks_key];
      if (!Array.isArray(bookmarksArray)) {
        return reply.code(500).send({ error: 'Bookmarks not found in frontmatter' });
      }

      // Create updated bookmark - handle notes (empty string or undefined means remove)
      const updatedNotes = notes !== undefined
        ? (notes.trim() || undefined)
        : existingBookmark.notes;

      const updatedBookmark: Bookmark = {
        ...existingBookmark,
        label: validatedLabel ?? existingBookmark.label,
        notes: updatedNotes,
      };

      // Find and replace the old bookmark entry (handles both string and object formats)
      const oldWikilink = bookmarkToWikilink(note.sourceRelative, existingBookmark);
      const newEntry = bookmarkToFrontmatter(note.sourceRelative, updatedBookmark);

      const newBookmarksArray = bookmarksArray.map((bm: unknown) => {
        // Check if this is the bookmark we're looking for
        if (typeof bm === 'string' && bm === oldWikilink) {
          return newEntry;
        }
        if (bm && typeof bm === 'object' && (bm as { link?: string }).link === oldWikilink) {
          return newEntry;
        }
        return bm;
      });

      // Update frontmatter
      frontmatter[config.bookmarks_key] = newBookmarksArray;

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Re-parse bookmarks
      const parsedBookmarks = getBookmarks(frontmatter, config.bookmarks_key);

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        bookmarks: parsedBookmarks,
      });

      return updatedBookmark;
    } catch (error) {
      fastify.log.error(error, 'Failed to update bookmark');
      return reply.code(500).send({ error: 'Failed to update bookmark' });
    }
  });

  // DELETE /api/library/:id/bookmarks/:bookmarkId - Delete a bookmark
  fastify.delete<{
    Params: { id: string; bookmarkId: string };
  }>('/api/library/:id/bookmarks/:bookmarkId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'bookmarkId'],
        properties: {
          id: { type: 'string' },
          bookmarkId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { bookmarkId } = request.params;

    // Find the bookmark
    const bookmark = note.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get bookmarks array
      const bookmarksArray = frontmatter[config.bookmarks_key];
      if (!Array.isArray(bookmarksArray)) {
        return reply.code(500).send({ error: 'Bookmarks not found in frontmatter' });
      }

      // Remove the bookmark (handles both string and object formats)
      const wikilinkToRemove = bookmarkToWikilink(note.sourceRelative, bookmark);
      const newBookmarksArray = bookmarksArray.filter((bm: unknown) => {
        if (typeof bm === 'string') {
          return bm !== wikilinkToRemove;
        }
        if (bm && typeof bm === 'object' && (bm as { link?: string }).link) {
          return (bm as { link: string }).link !== wikilinkToRemove;
        }
        return true;
      });

      // Update frontmatter (remove key if empty)
      if (newBookmarksArray.length === 0) {
        delete frontmatter[config.bookmarks_key];
      } else {
        frontmatter[config.bookmarks_key] = newBookmarksArray;
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Re-parse bookmarks
      const parsedBookmarks = newBookmarksArray.length > 0
        ? getBookmarks(frontmatter, config.bookmarks_key)
        : [];

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        bookmarks: parsedBookmarks,
      });

      return { success: true };
    } catch (error) {
      fastify.log.error(error, 'Failed to delete bookmark');
      return reply.code(500).send({ error: 'Failed to delete bookmark' });
    }
  });
};
