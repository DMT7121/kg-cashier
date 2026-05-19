// Cloudflare Pages Function — CUKCUK API CORS Proxy
// This handles ALL methods: GET, POST, PUT, DELETE, OPTIONS

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

async function handleProxy(context) {
  const { request, params } = context;

  // Reject requests from unauthorized origins
  const origin = request.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const corsHeaders = getCorsHeaders(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathSegments = params.path || [];
  const path = pathSegments.join('/');
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

    return new Response(respBody, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      Success: false,
      ErrorMessage: 'Proxy error: ' + error.message
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Export ALL method handlers explicitly
export const onRequestGet = handleProxy;
export const onRequestPost = handleProxy;
export const onRequestPut = handleProxy;
export const onRequestDelete = handleProxy;
export const onRequestOptions = handleProxy;
