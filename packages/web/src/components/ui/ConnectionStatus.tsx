import { useConnection } from '../../contexts/ConnectionContext';

export function ConnectionStatus() {
  const { status } = useConnection();

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
      role="status"
      aria-live="polite"
    >
      {status === 'connecting' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-400">Connecting...</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-red-400">Disconnected</span>
        </>
      )}
    </div>
  );
}
