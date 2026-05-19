// Cloudflare Worker — Standalone CUKCUK API CORS Proxy
// Deployed as: cukcuk-proxy.dmt-kgwork.workers.dev

const ALLOWED_ORIGINS = [
  'https://kg-cashier.pages.dev',
  'https://kg-cashier.dmt-kgwork.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/ping') {
      return new Response('pong', { status: 200, headers: getCorsHeaders(request) });
    }

    // Reject requests from unauthorized origins
    const origin = request.headers.get('Origin') || '';
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight — return immediately, never touch upstream
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Build target URL: /api/Account/Login → https://graphapi.cukcuk.vn/api/Account/Login
    const path = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    const targetUrl = 'https://graphapi.cukcuk.vn/' + path;

    try {
      const upstreamHeaders = new Headers();
      upstreamHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');

      const auth = request.headers.get('Authorization');
      if (auth) upstreamHeaders.set('Authorization', auth);

      const companyCode = request.headers.get('CompanyCode');
      if (companyCode) upstreamHeaders.set('CompanyCode', companyCode);

      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.text();
      }

      const resp = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: body,
      });

      const respBody = await resp.text();

      // Always add CORS headers to upstream response
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', resp.headers.get('Content-Type') || 'application/json');
      for (const [k, v] of Object.entries(corsHeaders)) {
        responseHeaders.set(k, v);
      }

      return new Response(respBody, {
        status: resp.status,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(JSON.stringify({
        Success: false,
        ErrorMessage: 'Proxy error: ' + error.message
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  }
};
