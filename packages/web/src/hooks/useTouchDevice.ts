import { useEffect, useState } from 'react';

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0;
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
    : false;
  const touchEvent = 'ontouchstart' in window;

  return hasTouchPoints || coarsePointer || touchEvent;
}

export function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);

  useEffect(() => {
    const update = () => setIsTouchDevice(detectTouchDevice());
    const coarseQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: none) and (pointer: coarse)')
      : null;

    window.addEventListener('resize', update);
    coarseQuery?.addEventListener?.('change', update);

    return () => {
      window.removeEventListener('resize', update);
      coarseQuery?.removeEventListener?.('change', update);
    };
  }, []);

  return isTouchDevice;
}
