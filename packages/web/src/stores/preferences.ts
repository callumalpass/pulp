import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  theme: 'light' | 'dark';
  readerTheme: 'light' | 'dark' | 'sepia' | 'eink';
  fontSize: number;
  lineHeight: number;
  markdownPanelOverlay: boolean;
  markdownPanelWidth: number;
  markdownPanelVimMode: boolean;

  setTheme: (theme: 'light' | 'dark') => void;
  setReaderTheme: (theme: 'light' | 'dark' | 'sepia' | 'eink') => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setMarkdownPanelOverlay: (overlay: boolean) => void;
  setMarkdownPanelWidth: (width: number) => void;
  setMarkdownPanelVimMode: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      readerTheme: 'dark',
      fontSize: 16,
      lineHeight: 1.6,
      markdownPanelOverlay: false,
      markdownPanelWidth: 400,
      markdownPanelVimMode: false,

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setReaderTheme: (readerTheme) => set({ readerTheme }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(14, Math.min(28, fontSize)) }),
      setLineHeight: (lineHeight) => set({ lineHeight: Math.max(1.2, Math.min(2, lineHeight)) }),
      setMarkdownPanelOverlay: (markdownPanelOverlay) => set({ markdownPanelOverlay }),
      setMarkdownPanelWidth: (markdownPanelWidth) => set({ markdownPanelWidth: Math.max(280, Math.min(800, markdownPanelWidth)) }),
      setMarkdownPanelVimMode: (markdownPanelVimMode) => set({ markdownPanelVimMode }),
    }),
    {
      name: 'pulp-preferences',
    }
  )
);
