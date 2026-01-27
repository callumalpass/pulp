import { useConnection } from '../../contexts/ConnectionContext';

export function ConnectionStatus() {
  const { status } = useConnection();

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  // More subtle connection indicator that doesn't dominate the UI
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-bg-deep/50"
      role="status"
      aria-live="polite"
    >
      {status === 'connecting' ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80 animate-pulse" />
          <span className="text-text-secondary">Connecting...</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
          <span className="text-text-secondary">Offline</span>
        </>
      )}
    </div>
  );
}
