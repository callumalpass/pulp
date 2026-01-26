import { type ReactNode } from 'react';
import { usePreferencesStore } from '../../../stores/preferences';

interface MetadataSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
}

/**
 * Collapsible section wrapper for metadata pane content.
 * Remembers expanded/collapsed state via preferences store.
 */
export function MetadataSection({ id, title, icon, children, defaultExpanded = false }: MetadataSectionProps) {
  const { metadataPanelExpandedSections, toggleMetadataPanelSection } = usePreferencesStore();

  // Check if this section is expanded (use default if not explicitly set)
  const isExpanded = metadataPanelExpandedSections.includes(id) ||
    (defaultExpanded && !metadataPanelExpandedSections.some(s => s.startsWith(id)));

  const handleToggle = () => {
    toggleMetadataPanelSection(id);
  };

  return (
    <div className="metadata-section">
      <button
        onClick={handleToggle}
        className="metadata-section-header"
        aria-expanded={isExpanded}
        aria-controls={`metadata-section-${id}`}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="metadata-section-icon">{icon}</span>}
          <span className="metadata-section-title">{title}</span>
        </div>
        <ChevronIcon expanded={isExpanded} />
      </button>

      <div
        id={`metadata-section-${id}`}
        className={`metadata-section-content ${isExpanded ? 'expanded' : 'collapsed'}`}
        aria-hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`metadata-section-chevron ${expanded ? 'expanded' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
