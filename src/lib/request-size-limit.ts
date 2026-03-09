/**
 * Request Size Limit Utilities
 * Validates and enforces request body size limits
 */

import { NextRequest, NextResponse } from 'next/server';

export const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB default
export const MAX_FILE_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB for file uploads
export const MAX_JSON_SIZE = 1 * 1024 * 1024; // 1MB for JSON payloads

/**
 * Check if request body exceeds size limit
 */
export function isRequestTooLarge(request: NextRequest, maxSize: number = DEFAULT_MAX_SIZE): boolean {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return false; // Allow if no content-length header (will be caught later if too large)
  }

  const size = parseInt(contentLength, 10);
  return !isNaN(size) && size > maxSize;
}

/**
 * Get appropriate size limit based on content type
 */
export function getSizeLimit(request: NextRequest): number {
  const contentType = request.headers.get('content-type') || '';

  // File uploads (multipart/form-data)
  if (contentType.includes('multipart/form-data')) {
    return MAX_FILE_UPLOAD_SIZE;
  }

  // JSON payloads
  if (contentType.includes('application/json')) {
    return MAX_JSON_SIZE;
  }

  // Default
  return DEFAULT_MAX_SIZE;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create error response for request too large
 */
export function createRequestTooLargeResponse(maxSize: number): NextResponse {
  return NextResponse.json(
    {
      error: 'Request entity too large',
      code: 'REQUEST_TOO_LARGE',
      maxSize: formatBytes(maxSize),
      timestamp: new Date().toISOString(),
    },
    { status: 413 }
  );
}

/**
 * Middleware helper to check request size
 */
export function checkRequestSize(request: NextRequest): NextResponse | null {
  const maxSize = getSizeLimit(request);

  if (isRequestTooLarge(request, maxSize)) {
    return createRequestTooLargeResponse(maxSize);
  }

  return null;
}
