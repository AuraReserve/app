/**
 * Password Validation Utilities
 * Provides password strength validation and security requirements
 * Note: Hashing functions should only be used server-side
 */

import bcrypt from "bcryptjs";

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

/**
 * Default password requirements
 */
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
};

/**
 * Validate password against security requirements
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): PasswordValidationResult {
  const errors: string[] = [];

  // Check minimum length
  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters long`);
  }

  // Check for uppercase letters
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letters
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for numbers
  if (requirements.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for symbols/special characters
  if (requirements.requireSymbols && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get password strength score (0-4)
 * 0 = Very Weak, 1 = Weak, 2 = Fair, 3 = Good, 4 = Strong
 */
export function getPasswordStrength(password: string): number {
  let score = 0;

  // Length score
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety score
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;

  return Math.min(4, score);
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(password: string): string {
  const strength = getPasswordStrength(password);
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return labels[strength];
}

/**
 * Check if password meets minimum security requirements
 */
export function isPasswordSecure(password: string): boolean {
  return validatePassword(password).isValid;
}

/**
 * Hash a password using bcrypt
 * SERVER-SIDE ONLY - This should never be called from client code
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 * SERVER-SIDE ONLY - This should never be called from client code
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
