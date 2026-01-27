import { Link } from 'react-router-dom';
import type { SearchResult, SearchMatch } from '@pulp/shared';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  isLoading: boolean;
}

export function SearchResults({ results, query, isLoading }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Searching documents">
        {/* Skeleton summary */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 border-2 border-accent-primary/50 border-t-accent-primary rounded-full animate-spin" />
          <span className="text-sm text-text-secondary">Searching documents...</span>
        </div>

        {/* Skeleton search result cards */}
        {[1, 2, 3].map((i) => (
          <SearchResultSkeleton key={i} matchCount={4 - i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-secondary" role="status" aria-live="polite">
        <SearchIcon className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg">No results found</p>
        <p className="text-sm mt-1">Try different search terms</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-text-secondary mb-4" role="status" aria-live="polite">
        Found {results.reduce((sum, r) => sum + r.totalMatches, 0)} matches in {results.length} document{results.length !== 1 ? 's' : ''}
      </div>

      {results.map((result) => (
        <SearchResultCard key={result.noteId} result={result} query={query} />
      ))}
    </div>
  );
}

function SearchResultCard({ result, query }: { result: SearchResult; query: string }) {
  return (
    <article className="bg-bg-surface border border-text-secondary/20 rounded-lg overflow-hidden" aria-label={`Search results for ${result.title}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-text-secondary/10 flex items-center justify-between">
        <Link
          to={`/read/${result.noteId}`}
          className="font-medium text-text-primary hover:text-accent-primary transition-colors"
          aria-label={`Open ${result.title}`}
        >
          {result.title}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-text-secondary bg-bg-deep px-2 py-0.5 rounded">
            {result.sourceType}
          </span>
          <span className="text-xs text-text-secondary">
            {result.totalMatches} match{result.totalMatches !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {/* Matches */}
      <div className="divide-y divide-text-secondary/10">
        {result.matches.map((match, idx) => (
          <MatchRow
            key={idx}
            match={match}
            noteId={result.noteId}
            sourceType={result.sourceType}
            query={query}
          />
        ))}
      </div>

      {/* Show more link if there are more matches */}
      {result.totalMatches > result.matches.length && (
        <div className="px-4 py-2 bg-bg-deep text-center">
          <Link
            to={`/read/${result.noteId}`}
            className="text-sm text-accent-primary hover:underline"
            aria-label={`View all ${result.totalMatches} matches in ${result.title}`}
          >
            View all {result.totalMatches} matches in document
          </Link>
        </div>
      )}
    </article>
  );
}

function MatchRow({
  match,
  noteId,
  sourceType,
  query,
}: {
  match: SearchMatch;
  noteId: string;
  sourceType: 'pdf' | 'epub';
  query: string;
}) {
  // Build link to specific location
  const link = sourceType === 'pdf' && match.page
    ? `/read/${noteId}?page=${match.page}`
    : `/read/${noteId}`;

  // Highlight the query in the match text
  const highlightedText = highlightQuery(match.text, query);

  const locationLabel = sourceType === 'pdf'
    ? `Page ${match.pageLabel || match.page}`
    : match.chapter || 'Chapter';

  return (
    <Link
      to={link}
      className="block px-4 py-3 hover:bg-bg-deep/50 active:bg-bg-deep transition-all duration-150"
      aria-label={`Match on ${locationLabel}: ${match.text.substring(0, 50)}...`}
    >
      <div className="flex items-start gap-3">
        {/* Location indicator */}
        <div className="flex-shrink-0 text-xs text-text-secondary mt-0.5">
          {sourceType === 'pdf' ? (
            <span className="inline-flex items-center gap-1">
              <PageIcon className="w-3 h-3" />
              {match.pageLabel || match.page}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 max-w-[100px] truncate">
              <ChapterIcon className="w-3 h-3" />
              {match.chapter || 'Chapter'}
            </span>
          )}
        </div>

        {/* Match text */}
        <p
          className="text-sm text-text-primary leading-relaxed flex-1"
          dangerouslySetInnerHTML={{ __html: highlightedText }}
        />
      </div>
    </Link>
  );
}

function highlightQuery(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  return escapeHtml(text).replace(
    regex,
    '<mark class="bg-yellow-400/40 text-text-primary px-0.5 rounded">$1</mark>'
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function SearchResultSkeleton({ matchCount }: { matchCount: number }) {
  return (
    <div className="bg-bg-surface border border-text-secondary/20 rounded-lg overflow-hidden animate-fade-in">
      {/* Header skeleton */}
      <div className="px-4 py-3 border-b border-text-secondary/10 flex items-center justify-between">
        <div className="h-5 w-48 skeleton rounded" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-12 skeleton rounded" />
          <div className="h-4 w-16 skeleton rounded" />
        </div>
      </div>

      {/* Match rows skeleton */}
      <div className="divide-y divide-text-secondary/10">
        {Array.from({ length: matchCount }).map((_, idx) => (
          <div key={idx} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="h-4 w-10 skeleton rounded flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 skeleton rounded w-full" />
                <div className="h-4 skeleton rounded w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function PageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ChapterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
