import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  theme: 'light' | 'dark';
  einkMode: boolean;
  readerTheme: 'light' | 'dark' | 'sepia' | 'eink';
  fontSize: number;
  lineHeight: number;
  metadataPanelWidth: number;
  metadataPanelExpandedSections: string[];

  setTheme: (theme: 'light' | 'dark') => void;
  setEinkMode: (enabled: boolean) => void;
  toggleEinkMode: () => void;
  setReaderTheme: (theme: 'light' | 'dark' | 'sepia' | 'eink') => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setMetadataPanelWidth: (width: number) => void;
  setMetadataPanelExpandedSections: (sections: string[]) => void;
  toggleMetadataPanelSection: (section: string) => void;
}

function applyEinkMode(enabled: boolean) {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute('data-eink-mode', enabled ? 'true' : 'false');

  if ('classList' in document.documentElement) {
    document.documentElement.classList.toggle('eink-mode', enabled);
  }
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      einkMode: false,
      readerTheme: 'dark',
      fontSize: 16,
      lineHeight: 1.6,
      metadataPanelWidth: 380,
      metadataPanelExpandedSections: ['publication', 'progress'],

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setEinkMode: (einkMode) => {
        applyEinkMode(einkMode);
        set({ einkMode });
      },
      toggleEinkMode: () => set((state) => {
        const next = !state.einkMode;
        applyEinkMode(next);
        return { einkMode: next };
      }),
      setReaderTheme: (readerTheme) => set({ readerTheme }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(14, Math.min(28, fontSize)) }),
      setLineHeight: (lineHeight) => set({ lineHeight: Math.max(1.2, Math.min(2, lineHeight)) }),
      setMetadataPanelWidth: (metadataPanelWidth) => set({ metadataPanelWidth: Math.max(320, Math.min(500, metadataPanelWidth)) }),
      setMetadataPanelExpandedSections: (metadataPanelExpandedSections) => set({ metadataPanelExpandedSections }),
      toggleMetadataPanelSection: (section) => set((state) => ({
        metadataPanelExpandedSections: state.metadataPanelExpandedSections.includes(section)
          ? state.metadataPanelExpandedSections.filter(s => s !== section)
          : [...state.metadataPanelExpandedSections, section]
      })),
    }),
    {
      name: 'pulp-preferences',
    }
  )
);
