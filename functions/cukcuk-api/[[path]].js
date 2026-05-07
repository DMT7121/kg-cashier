// Cloudflare Pages Function — CUKCUK API CORS Proxy
// This handles ALL methods: GET, POST, PUT, DELETE, OPTIONS

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
  'Access-Control-Max-Age': '86400',
};

async function handleProxy(context) {
  const { request, params } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

// Export ALL method handlers explicitly
export const onRequestGet = handleProxy;
export const onRequestPost = handleProxy;
export const onRequestPut = handleProxy;
export const onRequestDelete = handleProxy;
export const onRequestOptions = handleProxy;
