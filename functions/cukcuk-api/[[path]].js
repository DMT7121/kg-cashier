// Cloudflare Pages Function — CUKCUK API CORS Proxy
// Route: /cukcuk-api/* → https://graphapi.cukcuk.vn/*
// Handles: Login (POST), Invoice list (POST), Invoice detail (GET)

export async function onRequest(context) {
  const { request, params } = context;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Build target URL
  const path = params.path ? params.path.join('/') : '';
  const targetUrl = 'https://graphapi.cukcuk.vn/' + path;

  try {
    // Build headers for upstream request — only forward what CUKCUK needs
    const upstreamHeaders = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    // Forward Authorization header (Bearer token)
    const auth = request.headers.get('Authorization');
    if (auth) {
      upstreamHeaders['Authorization'] = auth;
    }

    // Forward CompanyCode header
    const companyCode = request.headers.get('CompanyCode');
    if (companyCode) {
      upstreamHeaders['CompanyCode'] = companyCode;
    }

    // Read request body for POST/PUT
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      body = await request.text();
    }

    // Make upstream request to CUKCUK API
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: body,
    });

    // Read response
    const responseBody = await upstreamResponse.text();

    // Return with CORS headers
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      Success: false, 
      ErrorMessage: 'Proxy error: ' + error.message 
    }), {
      status: 502,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    });
  }
}
