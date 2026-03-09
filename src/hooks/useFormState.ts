/**
 * useFormState Hook
 *
 * Manages error and success message state with auto-clear functionality.
 * Eliminates duplicate error/success handling code across 11+ pages.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface FormState {
  error: string | null;
  success: string | null;
  isSubmitting: boolean;
}

export interface FormStateActions {
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  clearMessages: () => void;
  reset: () => void;
}

export interface UseFormStateOptions {
  /**
   * Auto-clear messages after timeout (ms)
   * Set to 0 to disable auto-clear
   * @default 5000
   */
  autoClearTimeout?: number;

  /**
   * Clear messages on unmount
   * @default true
   */
  clearOnUnmount?: boolean;
}

export type UseFormStateReturn = FormState & FormStateActions;

/**
 * Hook for managing form error/success state with auto-clear
 *
 * @example
 * ```tsx
 * const { error, success, setError, setSuccess, isSubmitting, setIsSubmitting } = useFormState();
 *
 * const handleSubmit = async () => {
 *   setIsSubmitting(true);
 *   try {
 *     await submitForm();
 *     setSuccess('Form submitted successfully!');
 *   } catch (err) {
 *     setError(err.message);
 *   } finally {
 *     setIsSubmitting(false);
 *   }
 * };
 * ```
 */
export function useFormState(options: UseFormStateOptions = {}): UseFormStateReturn {
  const {
    autoClearTimeout = 5000,
    clearOnUnmount = true,
  } = options;

  const [error, setErrorState] = useState<string | null>(null);
  const [success, setSuccessState] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear existing timeout
  const clearTimeoutRef = (ref: { current: ReturnType<typeof setTimeout> | null }) => {
    if (ref.current) {
      globalThis.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  // Set error with auto-clear
  const setError = useCallback((error: string | null) => {
    clearTimeoutRef(errorTimeoutRef);
    setErrorState(error);

    if (error && autoClearTimeout > 0) {
      errorTimeoutRef.current = globalThis.setTimeout(() => {
        setErrorState(null);
      }, autoClearTimeout);
    }
  }, [autoClearTimeout]);

  // Set success with auto-clear
  const setSuccess = useCallback((success: string | null) => {
    clearTimeoutRef(successTimeoutRef);
    setSuccessState(success);

    if (success && autoClearTimeout > 0) {
      successTimeoutRef.current = globalThis.setTimeout(() => {
        setSuccessState(null);
      }, autoClearTimeout);
    }
  }, [autoClearTimeout]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    clearTimeoutRef(errorTimeoutRef);
    clearTimeoutRef(successTimeoutRef);
    setErrorState(null);
    setSuccessState(null);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    clearMessages();
    setIsSubmitting(false);
  }, [clearMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeoutRef(errorTimeoutRef);
      clearTimeoutRef(successTimeoutRef);

      if (clearOnUnmount) {
        setErrorState(null);
        setSuccessState(null);
      }
    };
  }, [clearOnUnmount]);

  return {
    error,
    success,
    isSubmitting,
    setError,
    setSuccess,
    setIsSubmitting,
    clearMessages,
    reset,
  };
}
