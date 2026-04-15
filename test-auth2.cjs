const crypto = require('crypto');

const appId = "CUKCUKOpenPlatform";
const domain = "kinggrill";
const secret = "838678be15cd8c84f3cb28cd943a4279c22d89e9bf9f69095927f2af20c129e4";
const secretBytes = Buffer.from(secret, 'hex');

async function tryLogin(label, sig) {
  const lt = global._lt;
  try {
    const res = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt, SignatureInfo: sig })
    });
    const data = await res.json();
    const ok = data.Success ? '✅ SUCCESS' : `❌ ${data.ErrorMessage}`;
    console.log(`  ${label}: ${ok}`);
    if (data.Success) console.log(`    TOKEN: ${String(data.Data).substring(0, 40)}...`);
    return data;
  } catch (e) {
    console.log(`  ${label}: ERROR ${e.message}`);
    return null;
  }
}

function h(msg, key) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex'); }
function b(msg, key) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('base64'); }

async function run() {
  global._lt = new Date().toISOString().split('.')[0] + 'Z';
  const lt = global._lt;
  console.log(`LoginTime: ${lt}\n`);

  // ── Approach A: key=value query string (alphabetical), HEX/B64 with both secret forms ──
  console.log("=== A. Query string format (key=value&...) sorted ===");
  const qs = `AppID=${appId}&Domain=${domain}&LoginTime=${lt}`;
  console.log(`  ${qs}`);
  await tryLogin("hex+utf8sec", h(qs, secret));
  await tryLogin("b64+utf8sec", b(qs, secret));
  await tryLogin("hex+hexsec", h(qs, secretBytes));
  await tryLogin("b64+hexsec", b(qs, secretBytes));

  // ── Approach B: key=value no ampersand ──
  console.log("\n=== B. KeyValue concatenated (no separator) ===");
  const kv = `AppID${appId}Domain${domain}LoginTime${lt}`;
  console.log(`  ${kv}`);
  await tryLogin("hex+utf8sec", h(kv, secret));
  await tryLogin("hex+hexsec", h(kv, secretBytes));

  // ── Approach C: Just the request body JSON exactly ──
  console.log("\n=== C. Full request body JSON ===");
  const fullBody = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt, SignatureInfo: "" });
  console.log(`  ${fullBody}`);
  await tryLogin("hex+utf8sec (sig=\"\")", h(fullBody, secret));
  const fullBody2 = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt });
  await tryLogin("hex+utf8sec (no sig field)", h(fullBody2, secret));

  // ── Approach D: LoginTime without Z ──
  console.log("\n=== D. LoginTime without trailing Z ===");
  const ltNoZ = lt.replace('Z', '');
  const jsonNoZ = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: ltNoZ });
  console.log(`  ${jsonNoZ}`);
  await tryLogin("hex+utf8sec", h(jsonNoZ, secret));
  await tryLogin("hex+hexsec", h(jsonNoZ, secretBytes));
  // Also try sending LoginTime without Z in the body
  try {
    const sig = h(jsonNoZ, secret);
    const res = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ AppID: appId, Domain: domain, LoginTime: ltNoZ, SignatureInfo: sig })
    });
    const data = await res.json();
    console.log(`  NoZ in body too: ${data.Success ? '✅' : '❌ ' + data.ErrorMessage}`);
  } catch(e) { console.log(`  Error: ${e.message}`); }

  // ── Approach E: LoginTime as local VN time format ──
  console.log("\n=== E. Different time formats ===");
  const now = new Date();
  const vnLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const json5 = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: vnLocal });
  console.log(`  VN local: ${json5}`);
  await tryLogin("hex+utf8sec", h(json5, secret));
  // Also UTC format: "yyyy-MM-dd HH:mm:ss"
  const utcFormatted = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')} ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}:${String(now.getUTCSeconds()).padStart(2,'0')}`;
  const json6 = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: utcFormatted });
  console.log(`  UTC formatted: ${json6}`);
  await tryLogin("hex+utf8sec", h(json6, secret));

  // ── Approach F: Different AppID/Domain comboes ──
  console.log("\n=== F. Different AppID possibilities ===");
  for (const aid of ["CUKCUKOpenPlatform", "cukcukopenplatform", "CUKCUK", domain]) {
    const j = JSON.stringify({ AppID: aid, Domain: domain, LoginTime: lt });
    await tryLogin(`AppID="${aid}" hex`, h(j, secret));
  }
}

run().catch(console.error);
