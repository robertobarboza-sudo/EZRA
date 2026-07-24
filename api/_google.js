/**
 * Autenticação server-to-server com Google (Service Account, JWT Bearer)
 * e leitura de abas via Google Sheets API v4. Sem dependências externas —
 * só módulos nativos do Node, já que o projeto não tem build step.
 */

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY não configuradas');
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const crypto = require('crypto');
  const signature = crypto.createSign('RSA-SHA256').update(header + '.' + claim).sign(privateKey);
  const jwt = header + '.' + claim + '.' + base64url(signature);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error('OAuth token: ' + (body.error_description || body.error || r.status));
  return body.access_token;
}

// Resolve o título real da aba a partir do gid (evita depender do nome, que pode mudar)
async function resolveTabTitle(token, spreadsheetId, gid) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets metadata: ' + (body.error?.message || r.status));
  const sheet = (body.sheets || []).find(s => String(s.properties.sheetId) === String(gid));
  if (!sheet) throw new Error('Aba com gid ' + gid + ' não encontrada na planilha');
  return sheet.properties.title;
}

function rowsToObjects(values) {
  if (!values || values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim().toLowerCase());
  return values.slice(1)
    .filter(row => row.some(c => c !== '' && c != null))
    .map(row => {
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = row[i] !== undefined ? row[i] : ''; });
      return o;
    });
}

async function fetchTabByGid(spreadsheetId, gid) {
  const token = await getAccessToken();
  const title = await resolveTabTitle(token, spreadsheetId, gid);
  const range = `'${title.replace(/'/g, "''")}'`;
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets values: ' + (body.error?.message || r.status));
  return { title, rows: rowsToObjects(body.values) };
}

module.exports = { fetchTabByGid };
