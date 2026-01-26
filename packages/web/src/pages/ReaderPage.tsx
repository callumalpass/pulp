import { useParams, Link } from 'react-router-dom';
import { useNote } from '../hooks/useNote';
import { ReaderShell } from '../components/readers/ReaderShell';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading, error } = useNote(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-label="Loading document">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading document...</span>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-text-secondary"
        role="alert"
        aria-live="assertive"
      >
        <p className="mb-4 text-lg">Failed to load document</p>
        <Link
          to="/"
          className="text-accent-primary hover:underline focus:outline-none focus:ring-2 focus:ring-accent-primary"
        >
          Back to library
        </Link>
      </div>
    );
  }

  return <ReaderShell note={note} />;
}
