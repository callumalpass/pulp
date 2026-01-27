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
    <div className="flex-1 flex items-center justify-center bg-bg-deep p-8" role="status" aria-label="Loading reader">
      <span className="sr-only">Loading reader...</span>
      <div className="w-full max-w-[600px] aspect-[8.5/11] bg-bg-surface rounded-lg overflow-hidden flex flex-col p-8 gap-4">
        <div className="flex flex-col gap-2 items-center pt-8 pb-4">
          <div className="w-3/4 h-5 skeleton rounded" />
          <div className="w-1/2 h-3 skeleton rounded mt-1" />
        </div>
        <div className="flex flex-col gap-2.5 mt-4">
          <div className="w-full h-2.5 skeleton rounded" />
          <div className="w-full h-2.5 skeleton rounded" />
          <div className="w-11/12 h-2.5 skeleton rounded" />
          <div className="w-full h-2.5 skeleton rounded" />
          <div className="w-4/5 h-2.5 skeleton rounded" />
          <div className="w-full h-2.5 skeleton rounded" />
          <div className="w-full h-2.5 skeleton rounded" />
          <div className="w-3/4 h-2.5 skeleton rounded" />
        </div>
      </div>
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
