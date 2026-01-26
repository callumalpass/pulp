import type { FastifyPluginAsync } from 'fastify';
import type { LibraryScanner } from '../services/library-scanner.js';

interface LibraryStatsRouteOptions {
  scanner: LibraryScanner;
}

export interface LibraryStatistics {
  totalBooks: number;
  totalPdfBooks: number;
  totalEpubBooks: number;
  totalReadingTimeMs: number;
  totalHighlights: number;
  totalBookmarks: number;
  booksCompleted: number;
  booksInProgress: number;
  booksUnread: number;
  averageProgress: number;
  collectionsCount: number;
}

export const libraryStatsRoutes: FastifyPluginAsync<LibraryStatsRouteOptions> = async (fastify, opts) => {
  const { scanner } = opts;

  // GET /api/library-stats - Get aggregated library statistics
  fastify.get<{
    Reply: LibraryStatistics;
  }>('/api/library-stats', async () => {
    const notes = scanner.getAll();

    let totalReadingTimeMs = 0;
    let totalHighlights = 0;
    let totalBookmarks = 0;
    let totalPdfBooks = 0;
    let totalEpubBooks = 0;
    let booksCompleted = 0;
    let booksInProgress = 0;
    let booksUnread = 0;
    let totalProgress = 0;
    const collectionsSet = new Set<string>();

    for (const note of notes) {
      // Count by source type
      if (note.sourceType === 'pdf') {
        totalPdfBooks++;
      } else {
        totalEpubBooks++;
      }

      // Aggregate reading time
      if (note.readingStats?.totalReadingTimeMs) {
        totalReadingTimeMs += note.readingStats.totalReadingTimeMs;
      }

      // Count highlights and bookmarks
      totalHighlights += note.highlights.length;
      totalBookmarks += note.bookmarks.length;

      // Count by progress status
      if (note.progress === 100) {
        booksCompleted++;
      } else if (note.progress > 0) {
        booksInProgress++;
      } else {
        booksUnread++;
      }

      totalProgress += note.progress;

      // Collect unique collections
      for (const collection of note.collections) {
        collectionsSet.add(collection);
      }
    }

    const totalBooks = notes.length;
    const averageProgress = totalBooks > 0 ? Math.round(totalProgress / totalBooks) : 0;

    return {
      totalBooks,
      totalPdfBooks,
      totalEpubBooks,
      totalReadingTimeMs,
      totalHighlights,
      totalBookmarks,
      booksCompleted,
      booksInProgress,
      booksUnread,
      averageProgress,
      collectionsCount: collectionsSet.size,
    };
  });
};
