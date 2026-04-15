const crypto = require('crypto');

const appId = "CUKCUKOpenPlatform";
const domain = "kinggrill";
const secret = "5264a8521f0c687e4d6df96affa2d328ea16d61e1f315bcad33eb6fafed70f48";

function hmacHex(msg, key) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

async function login() {
  const lt = new Date().toISOString().split('.')[0] + 'Z';
  const p = JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt });
  const s = hmacHex(p, secret);
  const res = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ AppID: appId, Domain: domain, LoginTime: lt, SignatureInfo: s })
  });
  const d = await res.json();
  if (!d.Success) { console.log("Login failed:", d); process.exit(1); }
  return { token: d.Data.AccessToken, companyCode: d.Data.CompanyCode };
}

async function run() {
  console.log("=== LOGIN ===");
  const { token, companyCode } = await login();
  console.log("✅ OK\n");

  // 1. Fetch a page of invoices to see ALL fields
  console.log("=== INVOICE FIELDS (Page 1) ===");
  const res = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'CompanyCode': companyCode
    },
    body: JSON.stringify({ Page: 1, Limit: 5 })
  });
  const data = await res.json();
  if (!data.Success) { console.log("Failed:", data); return; }
  
  // Print ALL fields of first invoice
  console.log("--- All fields of invoice #1 ---");
  console.log(JSON.stringify(data.Data[0], null, 2));

  // Print payment-relevant fields for first 5 invoices
  console.log("\n--- Payment-relevant fields for 5 invoices ---");
  data.Data.forEach((inv, i) => {
    console.log(`\nBill #${i+1} (${inv.RefNo}):`);
    console.log(`  Amount: ${inv.Amount?.toLocaleString('vi-VN')}đ`);
    console.log(`  DepositAmount: ${inv.DepositAmount}`);
    console.log(`  PaymentStatus: ${inv.PaymentStatus}`);
    console.log(`  PaymentType: ${inv.PaymentType}`);
    console.log(`  PaymentTypeName: ${inv.PaymentTypeName}`);
    console.log(`  CashAmount: ${inv.CashAmount}`);
    console.log(`  CardAmount: ${inv.CardAmount}`);
    console.log(`  TransferAmount: ${inv.TransferAmount}`);
    console.log(`  BankAmount: ${inv.BankAmount}`);
    console.log(`  VoucherAmount: ${inv.VoucherAmount}`);
    console.log(`  DebitAmount: ${inv.DebitAmount}`);
    console.log(`  InternalAmount: ${inv.InternalAmount}`);
    console.log(`  TotalAmount: ${inv.TotalAmount}`);
    console.log(`  TotalCashAmount: ${inv.TotalCashAmount}`);
    console.log(`  TotalPayment: ${inv.TotalPayment}`);
  });

  // 2. Try detail endpoint for single invoice
  const refId = data.Data[0].RefId;
  console.log(`\n=== INVOICE DETAIL (${refId}) ===`);
  
  // Try various detail endpoints
  const detailUrls = [
    `/api/v1/sainvoices/${refId}`,
    `/api/v1/sainvoices/detail/${refId}`,
    `/api/v1/sainvoices/payment/${refId}`,
  ];
  
  for (const url of detailUrls) {
    try {
      const r = await fetch('https://graphapi.cukcuk.vn' + url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'CompanyCode': companyCode
        }
      });
      const text = await r.text();
      let d2;
      try { d2 = JSON.parse(text); } catch { d2 = text; }
      console.log(`[${r.status}] GET ${url}: ${JSON.stringify(d2).substring(0, 300)}`);
    } catch(e) {
      console.log(`[ERR] GET ${url}: ${e.message}`);
    }
  }

  // 3. Try POST detail
  try {
    const r = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/' + refId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'CompanyCode': companyCode
      },
      body: JSON.stringify({ RefId: refId })
    });
    const text = await r.text();
    let d2;
    try { d2 = JSON.parse(text); } catch { d2 = text; }
    console.log(`[${r.status}] POST detail: ${JSON.stringify(d2).substring(0, 500)}`);
  } catch(e) {
    console.log(`[ERR] POST detail: ${e.message}`);
  }
}

run().catch(console.error);
