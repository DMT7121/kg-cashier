// Cloudflare Worker — Standalone CUKCUK API CORS Proxy
// Deployed as: cukcuk-proxy.<account>.workers.dev
// ALL origins can call this Worker — no CORS issues

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    // Strip leading /api/ prefix if present, forward rest to CUKCUK
    // e.g. /api/Account/Login → https://graphapi.cukcuk.vn/api/Account/Login
    const path = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    const targetUrl = 'https://graphapi.cukcuk.vn/' + path;

    try {
      // Build upstream headers
      const upstreamHeaders = new Headers();
      upstreamHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');

      const auth = request.headers.get('Authorization');
      if (auth) upstreamHeaders.set('Authorization', auth);

      const companyCode = request.headers.get('CompanyCode');
      if (companyCode) upstreamHeaders.set('CompanyCode', companyCode);

      // Read body for non-GET methods
      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.text();
      }

      // Forward to CUKCUK API
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: body,
      });

      const respBody = await resp.text();

      return new Response(respBody, {
        status: resp.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        Success: false,
        ErrorMessage: 'Proxy error: ' + error.message
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }
};
