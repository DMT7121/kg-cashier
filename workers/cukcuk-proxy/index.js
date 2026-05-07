// Cloudflare Worker — Standalone CUKCUK API CORS Proxy
// Deployed as: cukcuk-proxy.dmt-kgwork.workers.dev

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/ping') {
      return new Response('pong', { status: 200, headers: CORS_HEADERS });
    }

    // Handle CORS preflight — return immediately, never touch upstream
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
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
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, CompanyCode');

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
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
};
