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
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-text-secondary">Connecting...</span>
        </>
      ) : (
        <>
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-red-400" />
          </span>
          <span className="text-red-400">Offline</span>
        </>
      )}
    </div>
  );
}
