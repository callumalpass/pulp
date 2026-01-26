import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { ReaderPreferencesUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { createReaderPreferencesForFrontmatter } from '../services/frontmatter-parser.js';

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
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const updates = request.body;

    // Merge with existing preferences
    const existingPrefs = note.readerPreferences || {};
    const newPrefs = {
      ...existingPrefs,
      ...updates,
    };

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Update the preferences key
      const prefsForFrontmatter = createReaderPreferencesForFrontmatter(newPrefs);
      if (Object.keys(prefsForFrontmatter).length > 0) {
        frontmatter[config.reader_preferences_key] = prefsForFrontmatter;
      } else {
        delete frontmatter[config.reader_preferences_key];
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, { readerPreferences: newPrefs });

      return { success: true, readerPreferences: newPrefs };
    } catch (error) {
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
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { chapter } = request.body;

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Update or remove the chapter key
      if (chapter) {
        frontmatter[config.current_chapter_key] = chapter;
      } else {
        delete frontmatter[config.current_chapter_key];
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, { currentChapter: chapter });

      return { success: true, currentChapter: chapter };
    } catch (error) {
      fastify.log.error(error, 'Failed to update current chapter');
      return reply.code(500).send({ error: 'Failed to update current chapter' });
    }
  });
};
