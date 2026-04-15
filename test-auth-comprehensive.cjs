const crypto = require('crypto');

const appId = "CUKCUKOpenPlatform";
const domain = "kinggrill";
const secret = "838678be15cd8c84f3cb28cd943a4279c22d89e9bf9f69095927f2af20c129e4";

function hmacHex(message, key) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest('hex');
}
function hmacBase64(message, key) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest('base64');
}

async function tryLogin(label, sig) {
  const loginTime = global._loginTime;
  const reqBody = { AppID: appId, Domain: domain, LoginTime: loginTime, SignatureInfo: sig };
  try {
    const res = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    const data = await res.json();
    const status = data.Success ? '✅ SUCCESS' : `❌ FAIL (${data.ErrorMessage || data.Message})`;
    console.log(`  ${label}: ${status}`);
    if (data.Success) console.log(`    TOKEN: ${data.Data?.substring(0, 30)}...`);
    return data;
  } catch (e) {
    console.log(`  ${label}: ❌ ERROR: ${e.message}`);
    return null;
  }
}

async function run() {
  global._loginTime = new Date().toISOString().split('.')[0] + 'Z';
  const lt = global._loginTime;
  console.log(`LoginTime: ${lt}\n`);

  // ── Approach 1: JSON payload, Hex ──
  console.log("=== 1. JSON payload (alphabetical keys), HEX ===");
  const json1 = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt });
  console.log(`  Payload: ${json1}`);
  await tryLogin("HEX", hmacHex(json1, secret));
  await tryLogin("B64", hmacBase64(json1, secret));

  // ── Approach 2: LoginData only (no AppID wrapper) ──
  console.log("\n=== 2. JSON LoginData only, HEX ===");
  const json2 = JSON.stringify({ Domain: domain, LoginTime: lt });
  console.log(`  Payload: ${json2}`);
  await tryLogin("HEX", hmacHex(json2, secret));

  // ── Approach 3: CRLF separated ──
  console.log("\n=== 3. CRLF separated: AppID + Domain + LoginTime ===");
  const crlf1 = `${appId}\r\n${domain}\r\n${lt}`;
  console.log(`  Payload: ${JSON.stringify(crlf1)}`);
  await tryLogin("HEX", hmacHex(crlf1, secret));
  await tryLogin("B64", hmacBase64(crlf1, secret));

  // ── Approach 4: POST + CRLF separated ──
  console.log("\n=== 4. POST + CRLF: method + AppID + Domain + LoginTime ===");
  const crlf2 = `POST\r\n${appId}\r\n${domain}\r\n${lt}`;
  console.log(`  Payload: ${JSON.stringify(crlf2)}`);
  await tryLogin("HEX", hmacHex(crlf2, secret));
  await tryLogin("B64", hmacBase64(crlf2, secret));

  // ── Approach 5: Newline separated ──
  console.log("\n=== 5. Newline (LF) separated ===");
  const lf1 = `${appId}\n${domain}\n${lt}`;
  console.log(`  Payload: ${JSON.stringify(lf1)}`);
  await tryLogin("HEX", hmacHex(lf1, secret));
  await tryLogin("B64", hmacBase64(lf1, secret));

  // ── Approach 6: Concatenated without separator ──
  console.log("\n=== 6. Concatenated (no separator) ===");
  const concat1 = `${appId}${domain}${lt}`;
  console.log(`  Payload: ${concat1}`);
  await tryLogin("HEX", hmacHex(concat1, secret));
  await tryLogin("B64", hmacBase64(concat1, secret));

  // ── Approach 7: JSON different key order ──
  console.log("\n=== 7. JSON different key orders ===");
  const json3 = `{"Domain":"${domain}","AppID":"${appId}","LoginTime":"${lt}"}`;
  console.log(`  Payload: ${json3}`);
  await tryLogin("HEX", hmacHex(json3, secret));
  
  const json4 = `{"LoginTime":"${lt}","AppID":"${appId}","Domain":"${domain}"}`;
  console.log(`  Payload: ${json4}`);
  await tryLogin("HEX", hmacHex(json4, secret));

  // ── Approach 8: Secret as hex bytes instead of utf8 ──
  console.log("\n=== 8. JSON payload + Secret as HEX bytes ===");
  const secretBytes = Buffer.from(secret, 'hex');
  const sig8hex = crypto.createHmac('sha256', secretBytes).update(json1, 'utf8').digest('hex');
  const sig8b64 = crypto.createHmac('sha256', secretBytes).update(json1, 'utf8').digest('base64');
  await tryLogin("HEX (secret=hex-bytes)", sig8hex);
  await tryLogin("B64 (secret=hex-bytes)", sig8b64);

  // ── Approach 9: CRLF + Secret as hex bytes ──
  console.log("\n=== 9. CRLF separated + Secret as HEX bytes ===");
  const sig9hex = crypto.createHmac('sha256', secretBytes).update(crlf1, 'utf8').digest('hex');
  const sig9b64 = crypto.createHmac('sha256', secretBytes).update(crlf1, 'utf8').digest('base64');
  await tryLogin("HEX (secret=hex-bytes)", sig9hex);
  await tryLogin("B64 (secret=hex-bytes)", sig9b64);

  // ── Approach 10: Domain with .cukcuk.vn suffix ──
  console.log("\n=== 10. Domain='kinggrill.cukcuk.vn' with JSON ===");
  const fullDomain = "kinggrill.cukcuk.vn";
  const json10 = JSON.stringify({ AppID: appId, Domain: fullDomain, LoginTime: lt });
  console.log(`  Payload: ${json10}`);
  await tryLogin("HEX (utf8-secret)", hmacHex(json10, secret));
  const sig10 = crypto.createHmac('sha256', secretBytes).update(json10, 'utf8').digest('hex');
  await tryLogin("HEX (hex-secret)", sig10);
}

run().catch(console.error);
