import { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { Button } from '../components/ui/Button';

type SortOption = 'lastRead' | 'title' | 'progress';

export function LibraryPage() {
  const [sort, setSort] = useState<SortOption>('lastRead');
  const { data: notes, isLoading, error, refetch } = useLibrary(sort);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <p className="mb-4">Failed to load library</p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          <SortButton
            active={sort === 'lastRead'}
            onClick={() => setSort('lastRead')}
          >
            Recent
          </SortButton>
          <SortButton
            active={sort === 'title'}
            onClick={() => setSort('title')}
          >
            Title
          </SortButton>
          <SortButton
            active={sort === 'progress'}
            onClick={() => setSort('progress')}
          >
            Progress
          </SortButton>
        </div>
      </div>

      <LibraryGrid notes={notes || []} />
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-stoody ${
        active
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
      }`}
    >
      {children}
    </button>
  );
}
