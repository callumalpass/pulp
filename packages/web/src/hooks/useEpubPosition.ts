import { useCallback, useEffect, useState } from 'react';
import type { EpubReaderPosition, LiteratureNote } from '@pulp/shared';
import type { NavItem, Book } from 'epubjs';
import { findEpubChapter, getProgressFromEpubLocation } from '../lib/epub-location';
import { useEpubChapterSync } from './useEpubChapterSync';

interface RelocatedLocation {
  start: {
    cfi: string;
    href: string;
    location: number;
  };
}

interface UseEpubPositionArgs {
  note: LiteratureNote;
  setCurrentPage: (page: number) => void;
  updateProgress: (progress: number, lastOpenedCfi?: string) => void;
}

function createInitialPosition(note: LiteratureNote): EpubReaderPosition {
  return {
    sourceType: 'epub',
    progressPercent: note.progress,
    cfi: note.lastOpenedCfi,
    chapter: note.currentChapter,
    href: null,
    estimatedPage: 1,
    totalLocations: 0,
  };
}

export function useEpubPosition({
  note,
  setCurrentPage,
  updateProgress,
}: UseEpubPositionArgs) {
  const [currentPosition, setCurrentPosition] = useState<EpubReaderPosition>(() => createInitialPosition(note));

  useEffect(() => {
    setCurrentPosition(createInitialPosition(note));
  }, [note.id]);

  useEpubChapterSync(note.id, currentPosition.chapter, note.currentChapter);

  const handleRelocated = useCallback((
    location: RelocatedLocation,
    book: Book,
    toc: NavItem[],
    onNavigationSettled?: () => void
  ) => {
    const locationIndex = location.start.location;
    const estimatedPage = locationIndex >= 0 ? locationIndex + 1 : currentPosition.estimatedPage;
    const progressPercent = getProgressFromEpubLocation(book.locations, location.start.cfi, locationIndex) ?? note.progress;
    const totalLocations = book.locations.length();
    const chapter = findEpubChapter(toc, location.start.href)?.label ?? null;

    if (locationIndex >= 0) {
      setCurrentPage(estimatedPage);
    }

    updateProgress(progressPercent, location.start.cfi);
    setCurrentPosition({
      sourceType: 'epub',
      progressPercent,
      cfi: location.start.cfi,
      chapter,
      href: location.start.href || null,
      estimatedPage,
      totalLocations,
    });

    onNavigationSettled?.();
  }, [currentPosition.estimatedPage, note.progress, setCurrentPage, updateProgress]);

  return {
    currentPosition,
    handleRelocated,
  };
}
