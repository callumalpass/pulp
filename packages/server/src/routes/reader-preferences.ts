import type { FastifyPluginAsync } from 'fastify';
import type { ReaderPreferencesUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { createReaderPreferencesForFrontmatter } from '../services/frontmatter-parser.js';
import { NoteNotFoundError, updateNoteMetadata } from '../services/note-metadata.js';

interface ReaderPreferencesRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const readerPreferencesRoutes: FastifyPluginAsync<ReaderPreferencesRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/reader-preferences - Update reader preferences
  fastify.patch<{
    Params: { id: string };
    Body: ReaderPreferencesUpdate;
  }>('/api/library/:id/reader-preferences', {
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
        properties: {
          zoomLevel: { type: 'number', minimum: 0.25, maximum: 5 },
          zoomMode: { type: 'string', enum: ['fit-width', 'fit-page', 'custom'] },
          theme: { type: 'string', enum: ['light', 'dark', 'sepia', 'eink'] },
          fontSize: { type: 'number', minimum: 8, maximum: 48 },
          lineHeight: { type: 'number', minimum: 1, maximum: 3 },
        },
      },
    },
  }, async (request, reply) => {
    const updates = request.body;

    try {
      const { derived: newPrefs } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter, note }) => {
          const existingPrefs = note.readerPreferences || {};
          const nextPrefs = {
            ...existingPrefs,
            ...updates,
          };

          const prefsForFrontmatter = createReaderPreferencesForFrontmatter(nextPrefs);
          if (Object.keys(prefsForFrontmatter).length > 0) {
            frontmatter[config.reader_preferences_key] = prefsForFrontmatter;
          } else {
            delete frontmatter[config.reader_preferences_key];
          }

          return nextPrefs;
        },
        mapUpdates: (readerPreferences) => ({ readerPreferences }),
      });

      return { success: true, readerPreferences: newPrefs };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update reader preferences');
      return reply.code(500).send({ error: 'Failed to update reader preferences' });
    }
  });

  // PATCH /api/library/:id/current-chapter - Update current chapter name
  fastify.patch<{
    Params: { id: string };
    Body: { chapter: string | null };
  }>('/api/library/:id/current-chapter', {
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
        required: ['chapter'],
        properties: {
          chapter: { type: ['string', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const { chapter } = request.body;

    try {
      const { derived } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter }) => {
          if (chapter) {
            frontmatter[config.current_chapter_key] = chapter;
          } else {
            delete frontmatter[config.current_chapter_key];
          }
          return chapter;
        },
        mapUpdates: (currentChapter) => ({ currentChapter }),
      });

      return { success: true, currentChapter: derived };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update current chapter');
      return reply.code(500).send({ error: 'Failed to update current chapter' });
    }
  });
};
