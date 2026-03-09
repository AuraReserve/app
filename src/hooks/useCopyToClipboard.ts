/**
 * useCopyToClipboard Hook
 *
 * Provides copy-to-clipboard functionality with visual feedback.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TIMEOUTS } from '@/constants/timing';

export interface UseCopyToClipboardOptions {
  /**
   * Duration to show "copied" feedback (ms)
   * @default 2000
   */
  timeout?: number;

  /**
   * Callback when copy succeeds
   */
  onSuccess?: (text: string) => void;

  /**
   * Callback when copy fails
   */
  onError?: (error: Error) => void;
}

export interface UseCopyToClipboardReturn {
  /**
   * ID of the last copied item (null if nothing copied or timeout expired)
   */
  copied: string | null;

  /**
   * Copy text to clipboard
   *
   * @param text - Text to copy
   * @param id - Optional identifier for this copy operation
   */
  copy: (text: string, id?: string) => Promise<void>;

  /**
   * Check if a specific ID was recently copied
   */
  isCopied: (id: string) => boolean;
}

/**
 * Hook for copying text to clipboard with feedback
 *
 * @example
 * ```tsx
 * const { copied, copy } = useCopyToClipboard();
 *
 * <Button onClick={() => copy(apiKey, 'api-key')}>
 *   {copied === 'api-key' ? 'Copied!' : 'Copy'}
 * </Button>
 * ```
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardReturn {
  const {
    timeout = TIMEOUTS.COPY_FEEDBACK,
    onSuccess,
    onError,
  } = options;

  const [copied, setCopied] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string, id: string = 'default') => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        onSuccess?.(text);

        // Clear previous timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Set new timeout
        timeoutRef.current = setTimeout(() => {
          setCopied(null);
        }, timeout);
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to copy');
        onError?.(err);
        console.error('Failed to copy to clipboard:', err);
      }
    },
    [timeout, onSuccess, onError]
  );

  const isCopied = useCallback(
    (id: string) => copied === id,
    [copied]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    copied,
    copy,
    isCopied,
  };
}
