export const APP_ENV = (import.meta.env.VITE_APP_ENV as string) || 'production';

export const CANONICAL_URL =
  (import.meta.env.VITE_CANONICAL_URL as string) || 'https://kg-cashier.pages.dev';

export const APP_BASE_URL =
  (import.meta.env.VITE_APP_BASE_URL as string) || CANONICAL_URL;

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || CANONICAL_URL;

export const CUKCUK_PROXY_URL =
  (import.meta.env.VITE_CUKCUK_PROXY_URL as string) || `${CANONICAL_URL}/cukcuk-api`;

export const GAS_WEBAPP_URL =
  (import.meta.env.VITE_GAS_WEBAPP_URL as string) ||
  (import.meta.env.VITE_GAS_URL as string) ||
  'https://script.google.com/macros/s/AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y/exec';

export function normalizeUrl(url: string | null | undefined): string {
  return String(url || '').replace(/\/+$/, '');
}

export function joinUrl(base: string, path: string | null | undefined): string {
  const cleanBase = normalizeUrl(base);
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Validates if the current environment is running on the canonical host.
 * If running on a preview or alias URL in production environment, it returns false.
 */
export function isCurrentHostCanonical(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
    return true;
  }
  if (APP_ENV !== 'production') return true;
  // Canonical host must be exactly 'kg-cashier.pages.dev'
  return host === 'kg-cashier.pages.dev';
}
