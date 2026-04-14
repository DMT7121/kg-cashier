const crypto = require('crypto');

function generateSignatureBase64(payloadStr, secret) {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('base64');
}

function generateSignatureHex(payloadStr, secret) {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

async function testApi() {
  const loginTime = new Date().toISOString().split('.')[0] + 'Z';
  const appId = "DemoCUKCUK";
  const domain = "demo.cukcuk.vn";
  const secret = "invalid_secret";

  const variants = [
    { name: "Alphabetical", payloadStr: JSON.stringify({ AppID: appId, Domain: domain, LoginTime: loginTime }) },
    { name: "Domain First", payloadStr: `{"Domain":"${domain}","AppID":"${appId}","LoginTime":"${loginTime}"}` },
    { name: "No Z in time", payloadStr: `{"Domain":"${domain}","AppID":"${appId}","LoginTime":"${loginTime.replace('Z','')}"}` }
  ];

  for(let format of ["base64", "hex"]) {
    for (let variant of variants) {
      console.log(`\n--- Testing format: ${format}, String: ${variant.name} ---`);
      console.log(`Payload String: ${variant.payloadStr}`);
      const sig = format === 'base64' ? generateSignatureBase64(variant.payloadStr, secret) 
                                      : generateSignatureHex(variant.payloadStr, secret);
      
      const reqBody = {
        AppID: appId,
        Domain: domain,
        LoginTime: loginTime,
        SignatureInfo: sig
      };

      try {
        const res = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });
        const data = await res.json();
        console.log("Response:", JSON.stringify(data));
      } catch (e) {
        console.log("Error:", e.message);
      }
    }
  }
}

testApi();
