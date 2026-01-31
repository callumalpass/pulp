import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook for animating a number from 0 to a target value.
 * Creates a smooth counting animation effect with ease-out cubic deceleration.
 * Respects prefers-reduced-motion by skipping the animation entirely.
 */
export function useAnimatedCounter(target: number, duration: number = 800): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [count, setCount] = useState(safeTarget);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  // Keep a ref to the target so the rAF callback always reads the latest value
  const targetRef = useRef(safeTarget);
  targetRef.current = safeTarget;

  useEffect(() => {
    if (safeTarget === 0) {
      setCount(0);
      return;
    }

    // Skip animation when the user prefers reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(safeTarget);
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const currentTarget = targetRef.current;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1) {
        // Settle to the exact target on the final frame
        setCount(currentTarget);
        return;
      }

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * currentTarget);
      // Guard against any arithmetic edge case producing NaN/Infinity
      const safeCurrent = Number.isFinite(value) ? value : currentTarget;

      // Only call setState when the rounded value actually changes
      setCount((prev) => (prev === safeCurrent ? prev : safeCurrent));
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [safeTarget, duration]);

  // Final safety check - ensure we never return NaN
  return Number.isFinite(count) ? count : safeTarget;
}
