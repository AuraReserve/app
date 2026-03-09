/**
 * Pagination & Data Fetching Limits
 *
 * Standardized limits for data fetching across the application.
 */

export const PAGINATION_LIMITS = {
  /** Dashboard - number of spaces to display */
  DASHBOARD_SPACES: 20,

  /** Dashboard - number of recent reserve entries */
  DASHBOARD_RESERVES: 10,

  /** Dashboard - number of recent API calls */
  DASHBOARD_API_CALLS: 100,

  /** Dashboard - number of audit log entries */
  DASHBOARD_AUDIT_LOGS: 5,

  /** Space detail - number of API calls to fetch */
  SPACE_API_CALLS: 100,

  /** Analytics - number of API calls to analyze */
  ANALYTICS_API_CALLS: 500,

  /** Overview - number of spaces to show in widget */
  OVERVIEW_SPACES: 6,

  /** Default page size for tables */
  DEFAULT_PAGE_SIZE: 20,

  /** Maximum items per page */
  MAX_PAGE_SIZE: 100,
} as const;
