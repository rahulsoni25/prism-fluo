/**
 * Input Validation Utilities
 * Sanitizes and validates all user input across the application
 */

import { NextRequest, NextResponse } from 'next/server';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'uuid' | 'email' | 'url' | 'boolean';
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
}

/**
 * Validate input against rules
 */
export function validateInput(data: any, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  rules.forEach(rule => {
    const value = data[rule.field];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${rule.field} is required`);
      return;
    }

    if (value === undefined || value === null) return;

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${rule.field} must be a string`);
        } else {
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
          }
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${rule.field} must be a number`);
        }
        break;

      case 'uuid':
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          errors.push(`${rule.field} must be a valid UUID`);
        }
        break;

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push(`${rule.field} must be a valid email`);
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          errors.push(`${rule.field} must be a valid URL`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${rule.field} must be a boolean`);
        }
        break;
    }

    // Custom pattern validation
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      errors.push(`${rule.field} format is invalid`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 10000);
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    const recentRequests = requests.filter(time => now - time < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }
}

export const limiter = new RateLimiter(100, 60000);
