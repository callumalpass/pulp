import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

const CHAPTER_SYNC_DEBOUNCE_MS = 750;

export function useEpubChapterSync(
  noteId: string,
  chapter: string | null,
  initialChapter: string | null
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedChapterRef = useRef<string | null>(initialChapter);

  useEffect(() => {
    if (chapter === lastSyncedChapterRef.current) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const nextChapter = chapter ?? null;
      api.readerPreferences.updateChapter(noteId, nextChapter).catch((error) => {
        console.warn('Failed to sync EPUB chapter', error);
      });
      lastSyncedChapterRef.current = nextChapter;
      timeoutRef.current = null;
    }, CHAPTER_SYNC_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [chapter, noteId]);
}
