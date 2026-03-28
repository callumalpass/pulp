import type { LiteratureNote } from '@pulp/shared';
import type { LibraryScanner } from './library-scanner.js';
import { atomicFrontmatterUpdate, type ParsedFrontmatter } from './file-lock.js';

export class NoteNotFoundError extends Error {
  constructor(noteId: string) {
    super(`Note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
  }
}

interface UpdateNoteMetadataOptions<TDerived> {
  scanner: LibraryScanner;
  noteId: string;
  mutateFrontmatter: (parsed: ParsedFrontmatter & { note: LiteratureNote }) => TDerived;
  mapUpdates: (derived: TDerived, note: LiteratureNote) => Partial<LiteratureNote>;
}

export async function updateNoteMetadata<TDerived>({
  scanner,
  noteId,
  mutateFrontmatter,
  mapUpdates,
}: UpdateNoteMetadataOptions<TDerived>): Promise<{ note: LiteratureNote; derived: TDerived }> {
  const note = scanner.getById(noteId);
  if (!note) {
    throw new NoteNotFoundError(noteId);
  }

  let derived: TDerived | undefined;

  await atomicFrontmatterUpdate(note.notePath, (parsed) => {
    derived = mutateFrontmatter({ ...parsed, note });
    return parsed.frontmatter;
  });

  if (derived === undefined) {
    throw new Error(`No metadata update result produced for note: ${noteId}`);
  }

  scanner.updateNote(noteId, mapUpdates(derived, note));
  return { note, derived };
}
