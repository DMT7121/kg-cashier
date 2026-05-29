export const APP_ENV = import.meta.env.VITE_APP_ENV || 'production';

export const CANONICAL_URL =
  import.meta.env.VITE_CANONICAL_URL || 'https://kg-cashier.pages.dev';

export const APP_BASE_URL =
  import.meta.env.VITE_APP_BASE_URL || CANONICAL_URL;

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || CANONICAL_URL;

export const CUKCUK_PROXY_URL =
  import.meta.env.VITE_CUKCUK_PROXY_URL || `${CANONICAL_URL}/cukcuk-api`;

export const GAS_WEBAPP_URL =
  import.meta.env.VITE_GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y/exec';

export function normalizeUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function joinUrl(base, path) {
  const cleanBase = normalizeUrl(base);
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Validates if the current environment is running on the canonical host.
 * If running on a preview or alias URL in production environment, it returns false.
 */
export function isCurrentHostCanonical() {
  if (APP_ENV !== 'production') return true;
  const currentHost = window.location.hostname;
  // Canonical host must be exactly 'kg-cashier.pages.dev'
  return currentHost === 'kg-cashier.pages.dev';
}
