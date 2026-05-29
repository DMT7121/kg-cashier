import { CUKCUK_PROXY_URL, GAS_WEBAPP_URL, joinUrl } from './env.js';

export const ENDPOINTS = {
  cukcuk: {
    health: joinUrl(CUKCUK_PROXY_URL, 'health'),
    refresh: joinUrl(CUKCUK_PROXY_URL, 'auth/refresh'),
    clear: joinUrl(CUKCUK_PROXY_URL, 'auth/clear'),
    api: CUKCUK_PROXY_URL
  },
  gas: GAS_WEBAPP_URL
};
