import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { PinUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';

interface PinRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const pinRoutes: FastifyPluginAsync<PinRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/pin - Update pin status
  fastify.patch<{
    Params: { id: string };
    Body: PinUpdate;
  }>('/api/library/:id/pin', {
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
        required: ['pinned'],
        properties: {
          pinned: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { pinned } = request.body;

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Update or remove the pinned key
      if (pinned) {
        frontmatter[config.pinned_key] = true;
      } else {
        delete frontmatter[config.pinned_key];
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, { pinned });

      return { success: true, pinned };
    } catch (error) {
      fastify.log.error(error, 'Failed to update pin status');
      return reply.code(500).send({ error: 'Failed to update pin status' });
    }
  });
};
