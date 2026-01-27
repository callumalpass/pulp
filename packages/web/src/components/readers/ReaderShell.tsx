import { lazy, Suspense } from 'react';
import type { LiteratureNote } from '@pulp/shared';
import { ReaderErrorBoundary } from '../ui/ErrorBoundary';

// Lazy load readers - PDF.js (~500KB) and EPUB.js (~200KB) are loaded only when needed
const PDFReader = lazy(() => import('./PDFReader').then(m => ({ default: m.PDFReader })));
const EPUBReader = lazy(() => import('./EPUBReader').then(m => ({ default: m.EPUBReader })));

interface ReaderShellProps {
  note: LiteratureNote;
  initialPage?: number;
}

function ReaderLoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function ReaderShell({ note, initialPage }: ReaderShellProps) {
  return (
    <div className="h-full flex flex-col" role="main" aria-label={`Reading: ${note.title}`}>
      <ReaderErrorBoundary>
        <Suspense fallback={<ReaderLoadingSpinner />}>
          {note.sourceType === 'pdf' ? (
            <PDFReader note={note} initialPage={initialPage} />
          ) : (
            <EPUBReader note={note} />
          )}
        </Suspense>
      </ReaderErrorBoundary>
    </div>
  );
}
