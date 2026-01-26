import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CreateHighlightRequest, ProgressUpdate } from '@pulp/shared';

interface QueuedAction {
  id: string;
  type: 'highlight' | 'progress';
  noteId: string;
  data: CreateHighlightRequest | ProgressUpdate;
  timestamp: number;
}

interface OfflineState {
  queue: QueuedAction[];
  isOnline: boolean;
  isSyncing: boolean;

  addToQueue: (action: Omit<QueuedAction, 'id' | 'timestamp'>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setOnline: (online: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      queue: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,

      addToQueue: (action) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        set((state) => ({
          queue: [
            ...state.queue,
            { ...action, id, timestamp: Date.now() },
          ],
        }));
      },

      removeFromQueue: (id) => {
        set((state) => ({
          queue: state.queue.filter((a) => a.id !== id),
        }));
      },

      clearQueue: () => set({ queue: [] }),

      setOnline: (online) => set({ isOnline: online }),

      setIsSyncing: (syncing) => set({ isSyncing: syncing }),
    }),
    {
      name: 'pulp-offline-queue',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ queue: state.queue }),
    }
  )
);

// Sync queued actions when back online
export async function syncOfflineQueue() {
  const { queue, removeFromQueue, setIsSyncing, isOnline } = useOfflineStore.getState();

  if (!isOnline || queue.length === 0) return;

  setIsSyncing(true);

  for (const action of queue) {
    try {
      if (action.type === 'highlight') {
        await fetch(`/api/library/${action.noteId}/highlights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.data),
        });
      } else if (action.type === 'progress') {
        await fetch(`/api/library/${action.noteId}/progress`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.data),
        });
      }

      removeFromQueue(action.id);
    } catch (error) {
      console.error('Failed to sync action:', error);
      // Keep in queue for retry
      break;
    }
  }

  setIsSyncing(false);
}

// Set up online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineStore.getState().setOnline(true);
    syncOfflineQueue();
  });

  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOnline(false);
  });
}
