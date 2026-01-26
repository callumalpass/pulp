import { useParams, Link } from 'react-router-dom';
import { useNote } from '../hooks/useNote';
import { ReaderShell } from '../components/readers/ReaderShell';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading, error } = useNote(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <p className="mb-4">Failed to load document</p>
        <Link
          to="/"
          className="text-accent-primary hover:underline"
        >
          Back to library
        </Link>
      </div>
    );
  }

  return <ReaderShell note={note} />;
}
