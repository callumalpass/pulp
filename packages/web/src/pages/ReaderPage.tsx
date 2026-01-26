import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useNote } from '../hooks/useNote';
import { ReaderShell } from '../components/readers/ReaderShell';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: note, isLoading, error, refetch } = useNote(id);

  // Get initial page from URL query parameter (for deep linking from search)
  const initialPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-label="Loading document">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading document...</span>
      </div>
    );
  }

  if (error || !note) {
    const errorMessage = error instanceof Error ? error.message : 'Document not found';
    const is404 = errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found');

    return (
      <div
        className="flex flex-col items-center justify-center h-full text-text-secondary px-4"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-16 h-16 mb-4 text-text-secondary/50">
          <DocumentErrorIcon />
        </div>
        <h1 className="text-xl font-medium text-text-primary mb-2">
          {is404 ? 'Document Not Found' : 'Failed to Load Document'}
        </h1>
        <p className="mb-6 text-center max-w-md">
          {is404
            ? "The document you're looking for doesn't exist or may have been moved."
            : 'There was a problem loading this document. Please try again.'}
        </p>
        <div className="flex gap-4">
          {!is404 && (
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-deep"
            >
              Try Again
            </button>
          )}
          <Link
            to="/"
            className="px-4 py-2 bg-bg-surface text-text-primary rounded-lg hover:bg-bg-surface/80 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-deep"
          >
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return <ReaderShell note={note} initialPage={initialPage} />;
}

function DocumentErrorIcon() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}
