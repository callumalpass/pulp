import { useMemo } from 'react';

interface PerformanceConnection {
  effectiveType?: string;
  saveData?: boolean;
}

interface NavigatorWithPerformanceConnection extends Navigator {
  connection?: PerformanceConnection;
  mozConnection?: PerformanceConnection;
  webkitConnection?: PerformanceConnection;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

export interface PerformanceMode {
  isLowEnd: boolean;
}

function getIsLowEnd(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  const connection = (navigator as NavigatorWithPerformanceConnection).connection;
  const effectiveType = connection?.effectiveType ?? '';
  const saveData = !!connection?.saveData;

  const isLimitedCoreCount = cores > 0 && cores <= 2;
  const isLimitedMemory = typeof memory === 'number' && memory <= 2;
  const isSlowConnection =
    effectiveType === '2g' ||
    effectiveType === 'slow-2g' ||
    effectiveType === '3g';

  return isLimitedCoreCount || isLimitedMemory || saveData || isSlowConnection;
}

export function usePerformanceMode(): PerformanceMode {
  return useMemo(() => ({ isLowEnd: getIsLowEnd() }), []);
}
