'use strict';
// Minimal helper: make an HTTPS request, parse the response body as JSON.
// Extracted from auth.js's own private copy (same shape) since
// connector-oauth.js needs the identical primitive — no OAuth-specific
// logic lives here, just the raw request/parse plumbing.
const https = require('https');

function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const upReq = https.request(options, (upRes) => {
      let data = '';
      upRes.on('data', (c) => { data += c; });
      upRes.on('end', () => {
        try { resolve({ status: upRes.statusCode, body: JSON.parse(data) }); }
        catch (err) { reject(err); }
      });
    });
    upReq.on('error', reject);
    if (body) upReq.write(body);
    upReq.end();
  });
}

module.exports = { httpsJson };
