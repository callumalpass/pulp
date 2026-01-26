import type { FastifyPluginAsync } from 'fastify';
import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { LibraryScanner } from '../services/library-scanner.js';

interface FilesRouteOptions {
  scanner: LibraryScanner;
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
};

export const filesRoutes: FastifyPluginAsync<FilesRouteOptions> = async (fastify, opts) => {
  const { scanner } = opts;

  // GET /api/files/:id - Stream file with range support
  fastify.get<{
    Params: { id: string };
  }>('/api/files/:id', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const filePath = note.filePath;
    let stat;

    try {
      stat = statSync(filePath);
    } catch {
      return reply.code(404).send({ error: 'Source file not found' });
    }

    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileSize = stat.size;

    // Handle range requests
    const range = request.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      reply.code(206);
      reply.headers({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      return reply.send(createReadStream(filePath, { start, end }));
    }

    // Full file response
    reply.headers({
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });

    return reply.send(createReadStream(filePath));
  });
};
