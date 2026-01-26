import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { Card } from '../ui/Card';
import { ProgressIndicator } from './ProgressIndicator';
import { api } from '../../lib/api';

interface BookCardProps {
  note: LiteratureNoteSummary;
}

export function BookCard({ note }: BookCardProps) {
  return (
    <Link to={`/read/${note.id}`}>
      <Card hover className="flex flex-col">
        <div className="aspect-[2/3] bg-bg-deep relative overflow-hidden">
          {note.cover ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Hide broken image and show fallback
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <DefaultCover title={note.title} type={note.sourceType} />
          )}

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
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-secondary uppercase">
              {note.sourceType}
            </span>
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
