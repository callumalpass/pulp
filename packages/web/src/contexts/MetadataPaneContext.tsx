import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface MetadataPaneContextType {
  selectedNoteId: string | null;
  isOpen: boolean;
  openPane: (noteId: string) => void;
  closePane: () => void;
  togglePane: (noteId: string) => void;
}

const MetadataPaneContext = createContext<MetadataPaneContextType | null>(null);

export function MetadataPaneProvider({ children }: { children: ReactNode }) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openPane = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setIsOpen(true);
  }, []);

  const closePane = useCallback(() => {
    setIsOpen(false);
    // Keep selectedNoteId for animation purposes, clear after animation
    setTimeout(() => setSelectedNoteId(null), 300);
  }, []);

  const togglePane = useCallback((noteId: string) => {
    if (isOpen && selectedNoteId === noteId) {
      closePane();
    } else {
      openPane(noteId);
    }
  }, [isOpen, selectedNoteId, openPane, closePane]);

  return (
    <MetadataPaneContext.Provider value={{ selectedNoteId, isOpen, openPane, closePane, togglePane }}>
      {children}
    </MetadataPaneContext.Provider>
  );
}

export function useMetadataPane() {
  const context = useContext(MetadataPaneContext);
  if (!context) {
    throw new Error('useMetadataPane must be used within a MetadataPaneProvider');
  }
  return context;
}
