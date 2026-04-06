import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useNote } from '../hooks/useNote';
import { ReaderShell } from '../components/readers/ReaderShell';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: note, isLoading, error, refetch } = useNote(id);

  // Get initial page from URL query parameter (for deep linking from search)
  const initialPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
  const initialCfi = searchParams.get('cfi') || undefined;

  if (isLoading) {
    return <ReaderSkeleton />;
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
          {is404 ? 'Document not found' : 'Failed to load document'}
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

  return <ReaderShell note={note} initialPage={initialPage} initialCfi={initialCfi} />;
}

function ReaderSkeleton() {
  return (
    <div className="h-full flex flex-col" role="status" aria-label="Loading document">
      <span className="sr-only">Loading document...</span>

      {/* Toolbar skeleton */}
      <div className="h-12 flex items-center gap-3 px-4 border-b border-subtle bg-bg-surface/50">
        {/* Back button */}
        <div className="w-8 h-8 skeleton rounded-lg" />
        {/* Title area */}
        <div className="w-40 h-4 skeleton rounded" />
        <div className="flex-1" />
        {/* Page indicator */}
        <div className="w-20 h-6 skeleton rounded-lg" />
        {/* Toolbar buttons */}
        <div className="flex gap-2">
          <div className="w-8 h-8 skeleton rounded-lg" />
          <div className="w-8 h-8 skeleton rounded-lg" />
          <div className="w-8 h-8 skeleton rounded-lg" />
        </div>
      </div>

      {/* Document area */}
      <div className="flex-1 flex items-center justify-center bg-bg-deep p-8">
        {/* Page skeleton */}
        <div className="w-full max-w-[600px] aspect-[8.5/11] bg-bg-surface rounded-lg overflow-hidden flex flex-col p-8 gap-4">
          {/* Title block */}
          <div className="flex flex-col gap-2 items-center pt-8 pb-4">
            <div className="w-3/4 h-5 skeleton rounded" />
            <div className="w-1/2 h-3 skeleton rounded mt-1" />
          </div>
          {/* Text lines */}
          <div className="flex flex-col gap-2.5 mt-4">
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-11/12 h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-4/5 h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-3/4 h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-11/12 h-2.5 skeleton rounded" />
            <div className="w-full h-2.5 skeleton rounded" />
            <div className="w-2/3 h-2.5 skeleton rounded" />
          </div>
        </div>
      </div>
    </div>
  );
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
