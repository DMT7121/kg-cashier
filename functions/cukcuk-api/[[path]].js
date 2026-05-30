// Cloudflare Pages Function — CUKCUK API CORS Proxy & Token Manager
// This manages the token lifecycle, caching, rate-limit retries, and proxies business API requests safely.

const ALLOWED_ORIGINS = [
  'https://kg-cashier.pages.dev',
  'https://kg-cashier.dmt-kgwork.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const protocol = url.protocol;
    if ((protocol === 'http:' || protocol === 'https:') && 
        (hostname === 'localhost' || hostname === '127.0.0.1' || 
         /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname))) {
      return true;
    }
  } catch (e) {}
  return false;
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, CompanyCode, X-Gas-Url, X-Admin-Password, X-Cukcuk-Pin',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Single-flight promise variable at the isolate global scope
let activeRefreshPromise = null;

// Helper to clean domain strings
function cleanDomainStr(domain) {
  return (domain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.cukcuk\.vn\/?$/, '')
    .replace(/\/$/, '');
}

// Helper to generate HMAC-SHA256 signature
async function generateSignature(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const array = new Uint8Array(signature);
  let hex = '';
  for (let i = 0; i < array.length; i++) {
    hex += array[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Fetch CUKCUK credentials (prioritize CF secrets, fallback to secure GAS check)
async function getCukcukConfig(context, request) {
  const env = context.env || {};
  
  // 1. Prioritize Cloudflare environment variables / secrets
  let domain = env.CUKCUK_DOMAIN || '';
  let appId = env.CUKCUK_APP_ID || '';
  let secretKey = env.CUKCUK_SECRET_KEY || '';

  if (domain && appId && secretKey) {
    return { domain, appId, secretKey, source: 'environment' };
  }

  // 2. Fallback to GAS ScriptProperties via client header instructions
  const gasUrl = request.headers.get('X-Gas-Url') || '';
  const adminPassword = request.headers.get('X-Admin-Password') || '';
  const pin = request.headers.get('X-Cukcuk-Pin') || '';

  if (gasUrl) {
    try {
      const response = await fetch(gasUrl + '?action=getCukcukConfigSecure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, pin })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.domain && result.appId && result.secretKey) {
          return {
            domain: result.domain,
            appId: result.appId,
            secretKey: result.secretKey,
            source: 'gas_properties'
          };
        }
      }
    } catch(err) {
      console.error('[CF Proxy] Failed to fetch config from GAS:', err);
    }
  }

  return { domain: '', appId: '', secretKey: '', source: 'none' };
}

// Build Cache API key
function getCacheKey(config) {
  const domain = cleanDomainStr(config.domain);
  const appId = config.appId.trim();
  const cacheUrl = `https://cukcuk-token-cache.local/${encodeURIComponent(appId)}/${encodeURIComponent(domain)}`;
  return new Request(cacheUrl, { method: 'GET' });
}

// Clear token cache
async function clearTokenCache(context, config) {
  const cacheKey = getCacheKey(config);
  try {
    await caches.default.delete(cacheKey);
  } catch(e) {
    console.error('[CF Proxy] Failed to delete cache:', e);
  }
}

// Perform active login to CUKCUK
async function loginToCukcuk(domain, appId, secretKey) {
  const loginTime = new Date().toISOString().split('.')[0] + 'Z';
  const cleanDomain = cleanDomainStr(domain);
  const cleanAppId = appId.trim();

  const payloadStr = JSON.stringify({
    AppID: cleanAppId,
    Domain: cleanDomain,
    LoginTime: loginTime
  });

  const signature = await generateSignature(payloadStr, secretKey);
  const upstreamUrl = 'https://graphapi.cukcuk.vn/api/Account/Login';

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      AppID: cleanAppId,
      Domain: cleanDomain,
      LoginTime: loginTime,
      SignatureInfo: signature
    })
  });

  if (!response.ok) {
    throw new Error('Đăng nhập CUKCUK thất bại với mã lỗi HTTP ' + response.status);
  }

  const data = await response.json();
  if (data && data.Success && data.Data) {
    const accessToken = data.Data.AccessToken || data.Data;
    const companyCode = data.Data.CompanyCode || cleanDomain;
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(); // 23 hours safety margin
    const refreshBefore = new Date(Date.now() + 22.5 * 60 * 60 * 1000).toISOString(); // Refresh 30m before expiry

    return {
      accessToken: accessToken,
      companyCode: companyCode,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
      refreshBefore: refreshBefore
    };
  } else {
    throw new Error(data.ErrorMessage || data.Message || 'Lỗi không rõ từ API CUKCUK');
  }
}

// Get valid token from Cache or perform Login (uses single-flight lock)
async function getValidToken(context, request, config, forceRefresh = false) {
  const cacheKey = getCacheKey(config);

  if (!forceRefresh) {
    try {
      const cachedResponse = await caches.default.match(cacheKey);
      if (cachedResponse) {
        const tokenInfo = await cachedResponse.json();
        const now = Date.now();
        const refreshBefore = new Date(tokenInfo.refreshBefore).getTime();

        if (now < refreshBefore) {
          return tokenInfo;
        }
      }
    } catch(e) {
      console.error('[CF Proxy] Cache read error:', e);
    }
  }

  // If already refreshing, wait for active promise
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const tokenInfo = await loginToCukcuk(config.domain, config.appId, config.secretKey);
      
      const response = new Response(JSON.stringify(tokenInfo), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=86400'
        }
      });

      try {
        if (context.waitUntil) {
          context.waitUntil(caches.default.put(cacheKey, response));
        } else {
          await caches.default.put(cacheKey, response);
        }
      } catch(e) {
        await caches.default.put(cacheKey, response).catch(() => {});
      }

      return tokenInfo;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

// Fetch helper with exponential backoff for error code 102
async function fetchWithBackoff(url, fetchOpts, maxRetries = 3) {
  let delay = 500;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOpts);
      const clonedResponse = response.clone();
      try {
        const bodyText = await clonedResponse.text();
        const bodyJson = JSON.parse(bodyText);
        if (bodyJson && !bodyJson.Success) {
          const errMsg = (bodyJson.ErrorMessage || bodyJson.Message || '').toLowerCase();
          const errCode = bodyJson.ErrorCode || 0;
          if (errCode === 102 || errMsg.indexOf('102') !== -1 || errMsg.indexOf('đang xử lý') !== -1) {
            console.log(`[CUKCUK Proxy] Concurrency Lock (102) detected. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
            continue;
          }
        }
      } catch(e) {}
      
      return response;
    } catch(error) {
      if (attempt === maxRetries - 1) throw error;
      console.log(`[CUKCUK Proxy] Connection error (attempt ${attempt + 1}): ${error.message}. Retrying...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return fetch(url, fetchOpts);
}

// ── Health Check Handler ──
async function handleHealthCheck(context, request, corsHeaders) {
  try {
    const config = await getCukcukConfig(context, request);
    if (!config.domain || !config.appId || !config.secretKey) {
      return new Response(JSON.stringify({
        success: false,
        status: 'disconnected',
        message: 'Chưa cấu hình thông tin CUKCUK API hoặc chưa xác thực admin.'
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tokenInfo = await getValidToken(context, request, config);
    
    // Active ping upstream to check connection validity
    const pingUrl = 'https://graphapi.cukcuk.vn/api/v1/sainvoices/paging';
    const pingResp = await fetch(pingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tokenInfo.accessToken,
        'CompanyCode': tokenInfo.companyCode
      },
      body: JSON.stringify({ Page: 1, Limit: 1 })
    });
    
    const pingResult = await pingResp.json();
    const connected = pingResp.ok && pingResult && pingResult.Success;

    return new Response(JSON.stringify({
      success: true,
      status: connected ? 'connected' : 'auth_error',
      message: connected ? 'Kết nối CUKCUK thành công!' : (pingResult.ErrorMessage || 'Lỗi xác thực token CUKCUK'),
      auth: {
        hasConfig: true,
        hasToken: !!tokenInfo.accessToken,
        issuedAt: tokenInfo.issuedAt,
        expiresAt: tokenInfo.expiresAt,
        companyCode: tokenInfo.companyCode,
        configSource: config.source
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch(err) {
    return new Response(JSON.stringify({
      success: false,
      status: 'error',
      message: 'Lỗi kiểm tra kết nối: ' + err.message
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ── Force Refresh Handler ──
async function handleAuthRefresh(context, request, corsHeaders) {
  try {
    const config = await getCukcukConfig(context, request);
    if (!config.domain || !config.appId || !config.secretKey) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Không tìm thấy cấu hình kết nối CUKCUK.'
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await clearTokenCache(context, config);
    const tokenInfo = await getValidToken(context, request, config, true);

    return new Response(JSON.stringify({
      success: true,
      message: 'Lấy lại token kết nối mới thành công',
      auth: {
        issuedAt: tokenInfo.issuedAt,
        expiresAt: tokenInfo.expiresAt,
        companyCode: tokenInfo.companyCode
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch(err) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Làm mới token thất bại: ' + err.message
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ── Clear Cache Handler ──
async function handleAuthClear(context, request, corsHeaders) {
  try {
    const config = await getCukcukConfig(context, request);
    await clearTokenCache(context, config);
    return new Response(JSON.stringify({
      success: true,
      message: 'Xóa bộ nhớ đệm token thành công'
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch(err) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Xóa cache thất bại: ' + err.message
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ── Business Routing Proxy Handler ──
async function handleCukcukProxy(context, request, path, corsHeaders) {
  try {
    const config = await getCukcukConfig(context, request);
    if (!config.domain || !config.appId || !config.secretKey) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: 'CUKCUK_CONFIG_MISSING',
          message: 'Chưa cấu hình kết nối CUKCUK. Vui lòng thiết lập trong Cài đặt.'
        }
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tokenInfo = await getValidToken(context, request, config);

    let method = request.method;
    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await request.text();
    }

    const targetUrl = 'https://graphapi.cukcuk.vn/' + path;

    const makeRequest = async (token) => {
      const upstreamHeaders = new Headers();
      upstreamHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
      upstreamHeaders.set('Authorization', 'Bearer ' + token.accessToken);
      upstreamHeaders.set('CompanyCode', token.companyCode);

      return await fetchWithBackoff(targetUrl, {
        method: method,
        headers: upstreamHeaders,
        body: body
      });
    };

    let resp = await makeRequest(tokenInfo);

    // Auto-retry once on 401 Unauthorized
    if (resp.status === 401) {
      console.log('[CUKCUK Proxy] HTTP 401: Token expired, refreshing...');
      await clearTokenCache(context, config);
      const freshToken = await getValidToken(context, request, config, true);
      resp = await makeRequest(freshToken);
    }

    let respBody = await resp.text();
    
    // Check if JSON response is an authorization error inside HTTP 200
    try {
      const data = JSON.parse(respBody);
      if (data && !data.Success) {
        const errMsg = (data.ErrorMessage || data.Message || '').toLowerCase();
        if (errMsg.indexOf('authorization') !== -1 || errMsg.indexOf('denied') !== -1 || 
            errMsg.indexOf('token') !== -1 || errMsg.indexOf('expired') !== -1 ||
            errMsg.indexOf('hết hạn') !== -1) {
          
          console.log('[CUKCUK Proxy] JSON Auth Error: Token expired, refreshing...');
          await clearTokenCache(context, config);
          const freshToken = await getValidToken(context, request, config, true);
          resp = await makeRequest(freshToken);
          respBody = await resp.text();
        }
      }
    } catch(e) {}

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', resp.headers.get('Content-Type') || 'application/json');
    for (const [k, v] of Object.entries(corsHeaders)) {
      responseHeaders.set(k, v);
    }

    return new Response(respBody, {
      status: resp.status,
      headers: responseHeaders
    });
  } catch(error) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'CUKCUK_PROXY_ERROR',
        message: 'Lỗi máy chủ proxy CUKCUK: ' + error.message
      }
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleProxy(context) {
  const { request, params } = context;

  // Origin check
  const origin = request.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const corsHeaders = getCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathSegments = params.path || [];
  const path = pathSegments.join('/');

  if (path === 'health') {
    return handleHealthCheck(context, request, corsHeaders);
  }
  if (path === 'auth/refresh') {
    return handleAuthRefresh(context, request, corsHeaders);
  }
  if (path === 'auth/clear') {
    return handleAuthClear(context, request, corsHeaders);
  }

  return handleCukcukProxy(context, request, path, corsHeaders);
}

export const onRequestGet = handleProxy;
export const onRequestPost = handleProxy;
export const onRequestPut = handleProxy;
export const onRequestDelete = handleProxy;
export const onRequestOptions = handleProxy;
