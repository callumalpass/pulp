import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { Card } from '../ui/Card';
import { ProgressIndicator } from './ProgressIndicator';
import { usePinned } from '../../hooks/usePinned';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';

interface BookCardProps {
  note: LiteratureNoteSummary;
}

export function BookCard({ note }: BookCardProps) {
  const [imageError, setImageError] = useState(false);
  const { togglePin } = usePinned();
  const { getFormattedReadingTime } = useReadingStatsStore();
  // Use stats from note data (from API)
  const bookStats = note.readingStats;

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePin(note.id, note.pinned);
  };

  return (
    <Link to={`/read/${note.id}`}>
      <Card hover className="flex flex-col group">
        <div className="aspect-[2/3] bg-bg-deep relative overflow-hidden">
          {note.cover && !imageError ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <DefaultCover title={note.title} type={note.sourceType} />
          )}

          <button
            onClick={handlePinClick}
            className={`absolute top-2 right-2 p-1.5 rounded-full bg-bg-surface/80 backdrop-blur-sm transition-opacity ${
              note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <PinIcon filled={note.pinned} />
          </button>

          {note.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0">
              <ProgressIndicator progress={note.progress} />
            </div>
          )}
        </div>

        <div className="p-3">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2 leading-tight">
            {note.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-text-secondary uppercase">
              {note.sourceType}
            </span>
            {bookStats && bookStats.totalReadingTimeMs > 0 && (
              <span className="text-xs text-accent-primary flex items-center gap-1" title="Total reading time">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {getFormattedReadingTime(bookStats.totalReadingTimeMs)}
              </span>
            )}
            {note.lastRead && (
              <span className="text-xs text-text-secondary">
                {formatLastRead(note.lastRead)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={filled ? 'text-accent-primary' : 'text-text-secondary'}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function DefaultCover({ title, type }: { title: string; type: 'pdf' | 'epub' }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20">
      <div className="text-4xl mb-2">{type === 'pdf' ? '📄' : '📚'}</div>
      <p className="text-xs text-center text-text-secondary line-clamp-3">{title}</p>
    </div>
  );
}

function formatLastRead(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}
