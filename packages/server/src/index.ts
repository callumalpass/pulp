import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/loader.js';
import { LibraryScanner } from './services/library-scanner.js';
import { HighlightWriter } from './services/highlight-writer.js';
import { FileWatcher } from './services/file-watcher.js';
import { SearchIndex } from './services/search-index.js';
import { libraryRoutes } from './routes/library.js';
import { progressRoutes } from './routes/progress.js';
import { filesRoutes } from './routes/files.js';
import { highlightsRoutes } from './routes/highlights.js';
import { coversRoutes } from './routes/covers.js';
import { searchRoutes } from './routes/search.js';
import { websocketPlugin } from './plugins/websocket.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  console.log('Starting Pulp server...');

  // Load configuration
  const config = loadConfig();

  // Initialize services
  const scanner = new LibraryScanner(config);
  scanner.scan();

  const highlightWriter = new HighlightWriter(config);
  const fileWatcher = new FileWatcher(config);
  const searchIndex = new SearchIndex(config);

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register WebSocket plugin
  await fastify.register(websocketPlugin, { fileWatcher, scanner });

  // Register routes
  await fastify.register(libraryRoutes, { scanner });
  await fastify.register(progressRoutes, { scanner, config });
  await fastify.register(filesRoutes, { scanner });
  await fastify.register(highlightsRoutes, { scanner, highlightWriter });
  await fastify.register(coversRoutes, { scanner, config });
  await fastify.register(searchRoutes, { searchIndex, scanner });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);

    // Start file watcher
    fileWatcher.start();

    // Start background indexing for search
    const notes = scanner.getAll();
    searchIndex.indexAllNotes(notes).catch(error => {
      console.error('Background indexing error:', error);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down...');
    fileWatcher.stop();
    fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
