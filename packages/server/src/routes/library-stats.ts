import type { FastifyPluginAsync } from 'fastify';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { HighlightCategory, LibraryStatistics, HighlightCategoryBreakdown, RatingBreakdown, YearlyCompletionBreakdown } from '@pulp/shared';

interface LibraryStatsRouteOptions {
  scanner: LibraryScanner;
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

    // New detailed stats
    let totalPagesRead = 0;
    let totalSessions = 0;
    let longestSessionMs: number | null = null;
    let booksWithEstimatedCompletion = 0;
    const completionDays: number[] = [];

    // Highlight category breakdown
    const highlightsByCategory: HighlightCategoryBreakdown = {
      highlight: 0,
      important: 0,
      question: 0,
      todo: 0,
      definition: 0,
    };

    // Rating breakdown
    const booksByRating: RatingBreakdown = {
      rated5: 0,
      rated4: 0,
      rated3: 0,
      rated2: 0,
      rated1: 0,
      unrated: 0,
    };

    // Yearly completion breakdown
    const booksCompletedByYear: YearlyCompletionBreakdown = {};
    const currentYear = new Date().getFullYear();
    let booksCompletedThisYear = 0;

    // Collect reading speed data for averaging
    const readingSpeeds: number[] = [];

    for (const note of notes) {
      // Count by source type
      if (note.sourceType === 'pdf') {
        totalPdfBooks++;
      } else {
        totalEpubBooks++;
      }

      // Aggregate reading time and stats
      if (note.readingStats) {
        totalReadingTimeMs += note.readingStats.totalReadingTimeMs || 0;
        totalPagesRead += note.readingStats.totalPagesRead || 0;
        totalSessions += note.readingStats.totalSessions || 0;

        if (note.readingStats.longestSessionMs !== null) {
          if (longestSessionMs === null || note.readingStats.longestSessionMs > longestSessionMs) {
            longestSessionMs = note.readingStats.longestSessionMs;
          }
        }

        if (note.readingStats.pagesPerHour !== null && note.readingStats.pagesPerHour > 0) {
          readingSpeeds.push(note.readingStats.pagesPerHour);
        }

        if (note.readingStats.estimatedCompletionDate) {
          booksWithEstimatedCompletion++;
        }
      }

      // Calculate days to complete for finished books
      if (note.dateFinished && note.readingStats?.firstReadDate) {
        const startDate = new Date(note.readingStats.firstReadDate);
        const endDate = new Date(note.dateFinished);
        const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          completionDays.push(diffDays);
        }
      }

      // Count highlights by category
      for (const highlight of note.highlights) {
        totalHighlights++;
        const category: HighlightCategory = highlight.category || 'highlight';
        if (category in highlightsByCategory) {
          highlightsByCategory[category]++;
        }
      }

      // Count bookmarks
      totalBookmarks += note.bookmarks.length;

      // Count by progress status
      if (note.progress === 100) {
        booksCompleted++;

        // Track year of completion
        if (note.dateFinished) {
          const yearCompleted = new Date(note.dateFinished).getFullYear();
          booksCompletedByYear[yearCompleted] = (booksCompletedByYear[yearCompleted] || 0) + 1;
          if (yearCompleted === currentYear) {
            booksCompletedThisYear++;
          }
        }
      } else if (note.progress > 0) {
        booksInProgress++;
      } else {
        booksUnread++;
      }

      totalProgress += note.progress;

      // Count by rating
      if (note.rating === null) {
        booksByRating.unrated++;
      } else if (note.rating >= 5) {
        booksByRating.rated5++;
      } else if (note.rating >= 4) {
        booksByRating.rated4++;
      } else if (note.rating >= 3) {
        booksByRating.rated3++;
      } else if (note.rating >= 2) {
        booksByRating.rated2++;
      } else {
        booksByRating.rated1++;
      }

      // Collect unique collections
      for (const collection of note.collections) {
        collectionsSet.add(collection);
      }
    }

    const totalBooks = notes.length;
    const averageProgress = totalBooks > 0 ? Math.round(totalProgress / totalBooks) : 0;

    // Calculate average reading speed
    const averageReadingSpeedPagesPerHour = readingSpeeds.length > 0
      ? Math.round((readingSpeeds.reduce((a, b) => a + b, 0) / readingSpeeds.length) * 10) / 10
      : null;

    // Calculate average session duration
    const averageSessionDurationMs = totalSessions > 0
      ? Math.round(totalReadingTimeMs / totalSessions)
      : null;

    // Calculate average days to complete
    const averageDaysToComplete = completionDays.length > 0
      ? Math.round(completionDays.reduce((a, b) => a + b, 0) / completionDays.length)
      : null;

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
      // Detailed statistics
      totalPagesRead,
      totalSessions,
      averageReadingSpeedPagesPerHour,
      averageSessionDurationMs,
      longestSessionMs,
      highlightsByCategory,
      booksByRating,
      booksWithEstimatedCompletion,
      averageDaysToComplete,
      // Yearly statistics
      booksCompletedByYear,
      booksCompletedThisYear,
      currentYear,
    };
  });
};
