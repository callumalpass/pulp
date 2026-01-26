import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { ProgressUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';

interface ProgressRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const progressRoutes: FastifyPluginAsync<ProgressRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/progress - Update reading progress
  fastify.patch<{
    Params: { id: string };
    Body: ProgressUpdate;
  }>('/api/library/:id/progress', {
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
        required: ['progress'],
        properties: {
          progress: { type: 'number', minimum: 0, maximum: 100 },
          lastOpenedCfi: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Clamp progress to valid range (defensive - schema should already enforce this)
    const progress = Math.max(0, Math.min(100, request.body.progress));
    const lastOpenedCfi = request.body.lastOpenedCfi;
    const now = new Date().toISOString();

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Update frontmatter
      frontmatter[config.progress_key] = progress;
      frontmatter[config.last_read_key] = now;

      // Update lastOpenedCfi for EPUBs
      if (lastOpenedCfi && note.sourceType === 'epub') {
        frontmatter[config.last_opened_cfi_key] = lastOpenedCfi;
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        progress,
        lastRead: now,
        ...(lastOpenedCfi && note.sourceType === 'epub' ? { lastOpenedCfi } : {}),
      });

      return { success: true, progress, lastRead: now, lastOpenedCfi };
    } catch (error) {
      fastify.log.error(error, 'Failed to update progress');
      return reply.code(500).send({ error: 'Failed to update progress' });
    }
  });
};
