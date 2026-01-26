import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  theme: 'light' | 'dark';
  readerTheme: 'light' | 'dark' | 'sepia';
  fontSize: number;
  lineHeight: number;

  setTheme: (theme: 'light' | 'dark') => void;
  setReaderTheme: (theme: 'light' | 'dark' | 'sepia') => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      readerTheme: 'dark',
      fontSize: 16,
      lineHeight: 1.6,

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setReaderTheme: (readerTheme) => set({ readerTheme }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(12, Math.min(24, fontSize)) }),
      setLineHeight: (lineHeight) => set({ lineHeight: Math.max(1.2, Math.min(2, lineHeight)) }),
    }),
    {
      name: 'pulp-preferences',
    }
  )
);
