/**
 * Timing Constants
 *
 * Centralized timeout and delay values used throughout the application.
 */

export const TIMEOUTS = {
  /** Auto-clear success/error messages after 5 seconds */
  AUTO_CLEAR_MESSAGE: 5000,

  /** Show "Copied!" feedback for 2 seconds */
  COPY_FEEDBACK: 2000,

  /** Dialog close animation delay */
  DIALOG_ANIMATION: 150,

  /** Debounce delay for slug validation */
  SLUG_VALIDATION_DEBOUNCE: 300,

  /** Success message display duration (shorter) */
  SUCCESS_MESSAGE_SHORT: 2500,
} as const;
