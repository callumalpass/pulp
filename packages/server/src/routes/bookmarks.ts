import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { Bookmark, CreateBookmarkRequest, UpdateBookmarkRequest } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { bookmarkToWikilink, getBookmarks } from '../services/frontmatter-parser.js';

interface BookmarkRouteOptions {
  scanner: LibraryScanner;
  config: Config;
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

    const { label, page, cfi } = request.body;
    const now = new Date().toISOString();

    // Generate a unique ID based on location
    const locationKey = page !== undefined ? `page-${page}` : `cfi-${cfi}`;
    const id = `bm-${Buffer.from(locationKey).toString('base64').slice(0, 12)}`;

    const newBookmark: Bookmark = {
      id,
      label,
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
      const bookmarksArray: string[] = Array.isArray(existingBookmarks) ? [...existingBookmarks] : [];

      // Convert bookmark to wikilink and add
      const wikilink = bookmarkToWikilink(note.sourceRelative, newBookmark);
      bookmarksArray.push(wikilink);

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

  // PATCH /api/library/:id/bookmarks/:bookmarkId - Update a bookmark's label
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
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { bookmarkId } = request.params;
    const { label } = request.body;

    // Find the bookmark in the current list
    const bookmarkIndex = note.bookmarks.findIndex(b => b.id === bookmarkId);
    if (bookmarkIndex === -1) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    const existingBookmark = note.bookmarks[bookmarkIndex];

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get bookmarks array
      const bookmarksArray = frontmatter[config.bookmarks_key];
      if (!Array.isArray(bookmarksArray)) {
        return reply.code(500).send({ error: 'Bookmarks not found in frontmatter' });
      }

      // Create updated bookmark
      const updatedBookmark: Bookmark = {
        ...existingBookmark,
        label: label || existingBookmark.label,
      };

      // Replace the old wikilink with the updated one
      const oldWikilink = bookmarkToWikilink(note.sourceRelative, existingBookmark);
      const newWikilink = bookmarkToWikilink(note.sourceRelative, updatedBookmark);

      const newBookmarksArray = bookmarksArray.map((bm: string) =>
        bm === oldWikilink ? newWikilink : bm
      );

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

      // Remove the bookmark wikilink
      const wikilinkToRemove = bookmarkToWikilink(note.sourceRelative, bookmark);
      const newBookmarksArray = bookmarksArray.filter((bm: string) => bm !== wikilinkToRemove);

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
