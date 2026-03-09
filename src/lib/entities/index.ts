/**
 * Entity System - Client-Side API
 * Provides a consistent API for database operations that works in both server and client components
 */

import type {
  Space as SpaceType,
  ApiCall as ApiCallType,
  AuditLog as AuditLogType,
  User as UserType,
  AssetType as AssetTypeType,
} from './types';

/**
 * Handle API response - redirects to sign-in on 401 Unauthorized
 * This ensures users with invalid/expired sessions are logged out automatically
 */
async function handleResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (response.status === 401) {
    // Session is invalid - redirect to sign-in
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signin';
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (!response.ok) {
    // Try to extract the server's error message
    let serverMessage: string | undefined;
    try {
      const body = await response.json();
      serverMessage = body?.error;
    } catch {
      // response wasn't JSON — fall through to generic message
    }
    throw new Error(serverMessage || errorMessage);
  }

  return response.json();
}

// Base Entity Class with API Routes
class EntityBase<T extends { id: string; created_date: string }> {
  constructor(private endpoint: string) {}

  async list(sort?: string, limit?: number): Promise<T[]> {
    const params = new URLSearchParams();
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit.toString());

    const url = `/api/entities/${this.endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, { credentials: 'include' });

    return handleResponse<T[]>(response, `Failed to fetch ${this.endpoint}`);
  }

  async filter(criteria: Partial<T>, sort?: string, limit?: number): Promise<T[]> {
    const params = new URLSearchParams();
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit.toString());

    // Add filter criteria to params
    for (const [key, value] of Object.entries(criteria)) {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    }

    const url = `/api/entities/${this.endpoint}?${params.toString()}`;
    const response = await fetch(url, { credentials: 'include' });

    return handleResponse<T[]>(response, `Failed to filter ${this.endpoint}`);
  }

  async create(data: Omit<T, 'id' | 'created_date'>): Promise<T> {
    const response = await fetch(`/api/entities/${this.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    return handleResponse<T>(response, `Failed to create ${this.endpoint}`);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const response = await fetch(`/api/entities/${this.endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ id, ...data }),
    });

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(`/api/entities/${this.endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
      return false;
    }

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result.success === true;
  }
}

// User Entity with special methods
class UserEntity extends EntityBase<UserType> {
  constructor() {
    super('users');
  }

  async me(): Promise<UserType> {
    const response = await fetch('/api/entities/users?action=me', { credentials: 'include' });

    return handleResponse<UserType>(response, 'Failed to fetch current user');
  }

  async logout(): Promise<void> {
    // Session cleanup is handled by Better Auth on the server side
  }
}

// Export entity instances
export const SpaceEntity = new EntityBase<SpaceType>('spaces');
export const ApiCallEntity = new EntityBase<ApiCallType>('api-calls');
export const AuditLogEntity = new EntityBase<AuditLogType>('audit-logs');
export const AssetTypeEntity = new EntityBase<AssetTypeType>('asset-types');
export const UserEntity_Instance = new UserEntity();

// Export for backward compatibility with migration code
export const Space = SpaceEntity;
export const ApiCall = ApiCallEntity;
export const AuditLog = AuditLogEntity;
export const AssetType = AssetTypeEntity;
export const User = UserEntity_Instance;

// Export types
export type * from './types';
