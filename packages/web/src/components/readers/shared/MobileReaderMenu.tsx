import { useReaderStore, type ZoomMode, type PDFViewMode, type PDFColorMode } from '../../../stores/reader';

interface MobileReaderMenuProps {
  onZoomModeChange?: (mode: ZoomMode) => void;
  onViewModeChange?: (mode: PDFViewMode) => void;
  onEnterPresentation?: () => void;
  onClose: () => void;
}

export function MobileReaderMenu({
  onZoomModeChange,
  onViewModeChange,
  onEnterPresentation,
  onClose,
}: MobileReaderMenuProps) {
  const {
    zoom,
    zoomMode,
    pdfViewMode,
    pdfColorMode,
    toggleSearch,
    toggleMarkdownPanel,
    setPdfColorMode,
    setZoom,
    setPdfViewMode,
  } = useReaderStore();

  const handleZoomOption = (mode: ZoomMode | number) => {
    if (typeof mode === 'number') {
      setZoom(mode / 100);
    } else {
      onZoomModeChange?.(mode);
    }
    onClose();
  };

  const handleViewMode = (mode: PDFViewMode) => {
    if (mode === 'presentation') {
      onEnterPresentation?.();
    } else {
      setPdfViewMode(mode);
      onViewModeChange?.(mode);
    }
    onClose();
  };

  const handleSearch = () => {
    toggleSearch();
    onClose();
  };

  const handleNotes = () => {
    toggleMarkdownPanel();
    onClose();
  };

  const handleColorMode = (mode: PDFColorMode) => {
    setPdfColorMode(mode);
    onClose();
  };

  const getZoomLabel = () => {
    if (zoomMode === 'fit-width') return 'Fit Width';
    if (zoomMode === 'fit-page') return 'Fit Page';
    return `${Math.round(zoom * 100)}%`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-bottom-sheet-backdrop animate-fade-in"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div className="mobile-bottom-sheet animate-slide-up pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-text-secondary/30 rounded-full" />
        </div>

        {/* Menu Content */}
        <div className="px-4 pb-6">
          {/* Zoom Options */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Zoom ({getZoomLabel()})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <MenuButton
                active={zoomMode === 'fit-width'}
                onClick={() => handleZoomOption('fit-width')}
              >
                Fit Width
              </MenuButton>
              <MenuButton
                active={zoomMode === 'fit-page'}
                onClick={() => handleZoomOption('fit-page')}
              >
                Fit Page
              </MenuButton>
              <MenuButton
                active={zoomMode === 'custom' && Math.round(zoom * 100) === 100}
                onClick={() => handleZoomOption(100)}
              >
                100%
              </MenuButton>
              <MenuButton
                active={zoomMode === 'custom' && Math.round(zoom * 100) === 75}
                onClick={() => handleZoomOption(75)}
              >
                75%
              </MenuButton>
              <MenuButton
                active={zoomMode === 'custom' && Math.round(zoom * 100) === 125}
                onClick={() => handleZoomOption(125)}
              >
                125%
              </MenuButton>
              <MenuButton
                active={zoomMode === 'custom' && Math.round(zoom * 100) === 150}
                onClick={() => handleZoomOption(150)}
              >
                150%
              </MenuButton>
            </div>
          </div>

          {/* View Mode */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              View Mode
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <MenuButton
                active={pdfViewMode === 'single'}
                onClick={() => handleViewMode('single')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="3" width="12" height="18" rx="2" />
                  </svg>
                }
              >
                Single
              </MenuButton>
              <MenuButton
                active={pdfViewMode === 'spread'}
                onClick={() => handleViewMode('spread')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="8" height="16" rx="1" />
                    <rect x="14" y="4" width="8" height="16" rx="1" />
                  </svg>
                }
              >
                Spread
              </MenuButton>
              <MenuButton
                onClick={() => handleViewMode('presentation')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
              >
                Present
              </MenuButton>
            </div>
          </div>

          {/* Display Mode */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Display
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <MenuButton
                active={pdfColorMode === 'light'}
                onClick={() => handleColorMode('light')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                }
              >
                Light
              </MenuButton>
              <MenuButton
                active={pdfColorMode === 'dark'}
                onClick={() => handleColorMode('dark')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                }
              >
                Dark
              </MenuButton>
              <MenuButton
                active={pdfColorMode === 'eink'}
                onClick={() => handleColorMode('eink')}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="8" y1="6" x2="16" y2="6" />
                    <line x1="8" y1="10" x2="16" y2="10" />
                    <line x1="8" y1="14" x2="12" y2="14" />
                  </svg>
                }
              >
                E-ink
              </MenuButton>
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MenuButton
                onClick={handleSearch}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                }
              >
                Search
              </MenuButton>
              <MenuButton
                onClick={handleNotes}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                }
              >
                Notes
              </MenuButton>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface MenuButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}

function MenuButton({ children, onClick, active, icon }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`touch-target flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-colors ${
        active
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'bg-bg-deep text-text-primary hover:bg-bg-deep/80'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{children}</span>
    </button>
  );
}
