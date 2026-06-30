'use client';

import { useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/config';

/**
 * Generates a short random token for cancel correlation.
 */
function makeToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * Hook that:
 * 1. Provides a cancel token to include in every batch API request body.
 * 2. On page unload (tab close / refresh / navigation) sends a cancel beacon.
 * 3. On React unmount (route change / component destroy) sends a cancel fetch.
 * 4. Provides an AbortController signal for fetch() calls so in-flight HTTP
 *    requests are also aborted locally.
 * 5. Provides an explicit `cancel()` function for cancel buttons.
 *
 * Usage:
 *   const { cancelToken, fetchSignal, newRequest, cancel } = useSessionCleanup();
 *
 *   // Before each new operation, call newRequest() to refresh the token + signal:
 *   const signal = newRequest();
 *   const res = await fetch(url, {
 *     method: 'POST',
 *     signal,
 *     body: JSON.stringify({ ...data, cancel_token: cancelToken }),
 *   });
 */
export function useSessionCleanup() {
  const tokenRef    = useRef<string | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const sendCancel = useCallback((token: string, useBeacon = false) => {
    const url = `${API_BASE_URL}/api/cancel/${token}`;
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (tokenRef.current) {
        sendCancel(tokenRef.current, true);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also fire on React unmount (route navigation away)
      if (tokenRef.current) {
        sendCancel(tokenRef.current, false);
        tokenRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [sendCancel]);

  /**
   * Call before starting a new batch operation.
   * Returns the AbortSignal to pass to fetch().
   * The cancel token is available via `cancelToken` (reads tokenRef).
   */
  const newRequest = useCallback((): AbortSignal => {
    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    // Assign a fresh token
    tokenRef.current = makeToken();
    // Fresh AbortController
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }, []);

  /**
   * Explicit cancel (e.g. a Cancel button).
   */
  const cancel = useCallback(() => {
    if (tokenRef.current) {
      sendCancel(tokenRef.current, false);
      tokenRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [sendCancel]);

  /**
   * Call when the operation finishes successfully/with error to stop the
   * disconnect watcher from firing a spurious cancel later.
   */
  const clearToken = useCallback(() => {
    tokenRef.current = null;
  }, []);

  return {
    /** The current cancel token string — include in request body as `cancel_token`. */
    get cancelToken() { return tokenRef.current; },
    /** Start a new request — returns an AbortSignal and refreshes the cancel token. */
    newRequest,
    /** Explicitly cancel the current operation (cancel button). */
    cancel,
    /** Clear the token after a request completes normally. */
    clearToken,
  };
}
