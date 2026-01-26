import type { LiteratureNote } from '@pulp/shared';
import { PDFReader } from './PDFReader';
import { EPUBReader } from './EPUBReader';
import { ReaderErrorBoundary } from '../ui/ErrorBoundary';

interface ReaderShellProps {
  note: LiteratureNote;
}

export function ReaderShell({ note }: ReaderShellProps) {
  return (
    <div className="h-full flex flex-col" role="main" aria-label={`Reading: ${note.title}`}>
      <ReaderErrorBoundary>
        {note.sourceType === 'pdf' ? (
          <PDFReader note={note} />
        ) : (
          <EPUBReader note={note} />
        )}
      </ReaderErrorBoundary>
    </div>
  );
}
