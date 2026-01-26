import type { LiteratureNote } from '@pulp/shared';
import { PDFReader } from './PDFReader';
import { EPUBReader } from './EPUBReader';

interface ReaderShellProps {
  note: LiteratureNote;
}

export function ReaderShell({ note }: ReaderShellProps) {
  return (
    <div className="h-full flex flex-col">
      {note.sourceType === 'pdf' ? (
        <PDFReader note={note} />
      ) : (
        <EPUBReader note={note} />
      )}
    </div>
  );
}
