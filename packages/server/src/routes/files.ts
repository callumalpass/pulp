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
      const startStr = parts[0];
      const endStr = parts[1];

      // Validate range format
      if (startStr === '' && endStr === '') {
        // Invalid: "bytes=-" with nothing specified
        return reply.code(416).send({
          error: 'Invalid range',
          message: 'Range header must specify start and/or end position',
        });
      }

      let start: number;
      let end: number;

      if (startStr === '') {
        // Suffix range: "bytes=-500" means last 500 bytes
        const suffix = parseInt(endStr, 10);
        if (isNaN(suffix) || suffix <= 0) {
          return reply.code(416).send({
            error: 'Invalid range',
            message: 'Suffix length must be a positive number',
          });
        }
        start = Math.max(0, fileSize - suffix);
        end = fileSize - 1;
      } else {
        start = parseInt(startStr, 10);

        if (isNaN(start) || start < 0) {
          return reply.code(416).send({
            error: 'Invalid range',
            message: 'Range start must be a non-negative number',
          });
        }

        if (endStr !== '' && endStr !== undefined) {
          end = parseInt(endStr, 10);
          if (isNaN(end)) {
            return reply.code(416).send({
              error: 'Invalid range',
              message: 'Range end must be a valid number',
            });
          }
        } else {
          end = fileSize - 1;
        }
      }

      // Validate range is satisfiable
      if (start >= fileSize) {
        return reply.code(416).send({
          error: 'Range not satisfiable',
          message: `Start position ${start} is beyond file size ${fileSize}`,
        });
      }

      // Clamp end to file size and ensure valid range
      end = Math.min(end, fileSize - 1);

      if (start > end) {
        return reply.code(416).send({
          error: 'Invalid range',
          message: `Start position ${start} is greater than end position ${end}`,
        });
      }

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
