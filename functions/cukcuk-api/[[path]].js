// Cloudflare Pages Function — CUKCUK API CORS Proxy
// Proxies /cukcuk-api/* → https://graphapi.cukcuk.vn/*
// This solves CORS issues when deployed to production (kg-cashier.pages.dev)

export async function onRequest(context) {
  const { request, params } = context;
  const path = params.path ? params.path.join('/') : '';
  const targetUrl = 'https://graphapi.cukcuk.vn/' + path;

  // Build proxy request
  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set('Host', 'graphapi.cukcuk.vn');
  proxyHeaders.delete('cookie');

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  });

  try {
    const response = await fetch(proxyRequest);

    // Build response with CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    // Add CORS headers to response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
