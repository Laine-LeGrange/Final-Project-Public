"use client";
// mark as client component

// Import React
import * as React from "react";

// Options for the polling hook
type Opts = {
  intervalMs?: number;
  enabled?: boolean;
  refetchOnFocus?: boolean; 
  backoffOnError?: boolean; 
  maxIntervalMs?: number; 
};

// Custom hook for polling a function at specified intervals with various options
export function usePolling(fn: () => Promise<void> | void, opts: Opts = {}) {
  const {
    intervalMs = 1000, // default to 1 second
    enabled = true,
    refetchOnFocus = true,
    backoffOnError = true,
    maxIntervalMs = 60000, // 1 minute max interval
  } = opts;

  // Refs to manage timer and state
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIntervalRef = React.useRef(intervalMs);
  const runningRef = React.useRef(false);

  // Clear the polling timer
  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // The polling tick function
  const tick = React.useCallback(async () => {

    // Prevent overlapping executions
    if (runningRef.current) return;  
    if (document.hidden) return;  
    runningRef.current = true;
    try {
      await fn();

      // Reset interval on success
      currentIntervalRef.current = intervalMs;
    } catch {

      if (backoffOnError) {
        // Exponential backoff on error
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * 2,
          maxIntervalMs
        );
      }
    } finally {

      // Mark as not running
      runningRef.current = false;
      if (timerRef.current) {
        clearTimer();
        timerRef.current = setInterval(tick, currentIntervalRef.current);
      }
    }
  }, [fn, intervalMs, backoffOnError, maxIntervalMs]);

  // Effect to manage the polling lifecycle
  React.useEffect(() => {
    clearTimer();
    if (!enabled || !intervalMs) return;

    // Start the timer
    currentIntervalRef.current = intervalMs;
    timerRef.current = setInterval(tick, currentIntervalRef.current);
    void tick();

    // Cleanup on unmount
    return () => clearTimer();
  }, [enabled, intervalMs, tick]);


  // Effect to handle refetching on window focus
  React.useEffect(() => {
    if (!refetchOnFocus) return;
    // set up event listeners
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      // cleanup listeners
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refetchOnFocus, tick]);
}
