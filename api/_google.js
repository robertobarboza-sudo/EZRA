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

// Normaliza os jeitos mais comuns de colar a chave errado: aspas em volta
// (se copiaram o valor de dentro do .json com as aspas do JSON incluídas),
// \r\n do Windows, e \n escapado (texto literal) em vez de quebra de linha real.
function normalizePrivateKey(raw) {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  return key;
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY não configuradas');
  const privateKey = normalizePrivateKey(rawKey);
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_PRIVATE_KEY não parece um PEM válido (faltando "BEGIN PRIVATE KEY"). ' +
      'Tamanho recebido: ' + privateKey.length + ' caracteres.'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  // Escopo leitura+escrita (pedido do Roberto em 2026-08-13, feature de tags
  // no Monitor - Live) — antes era spreadsheets.readonly. O resto do projeto
  // continua só lendo; só api/outbound.js (aba monitor_tags_pulso) escreve.
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
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

async function fetchSheetsMeta(token, spreadsheetId) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets metadata: ' + (body.error?.message || r.status));
  return body.sheets || [];
}

// Resolve o título real da aba a partir do gid (evita depender do nome, que pode mudar)
async function resolveTabTitle(token, spreadsheetId, gid) {
  const sheets = await fetchSheetsMeta(token, spreadsheetId);
  const sheet = sheets.find(s => String(s.properties.sheetId) === String(gid));
  if (!sheet) throw new Error('Aba com gid ' + gid + ' não encontrada na planilha');
  return sheet.properties.title;
}

// Lista as abas (título + gid) de uma planilha — usado só pra onboarding manual
// de novas planilhas, nunca chamado pelo front-end.
async function listTabs(spreadsheetId) {
  const token = await getAccessToken();
  const sheets = await fetchSheetsMeta(token, spreadsheetId);
  return sheets.map(s => ({ title: s.properties.title, gid: s.properties.sheetId }));
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

async function fetchTabRawValues(spreadsheetId, gid) {
  const token = await getAccessToken();
  const title = await resolveTabTitle(token, spreadsheetId, gid);
  const range = `'${title.replace(/'/g, "''")}'`;
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets values: ' + (body.error?.message || r.status));
  return { title, values: body.values || [] };
}

async function fetchTabByGid(spreadsheetId, gid) {
  const { title, values } = await fetchTabRawValues(spreadsheetId, gid);
  return { title, rows: rowsToObjects(values) };
}

// ── Escrita (usado só pela feature de tags do Monitor - Live, ver
// api/outbound.js) — resto do projeto é só leitura. `range` já vem pronto
// (ex: "'monitor_tags_pulso'!A:D"), não passa por resolveTabTitle porque
// essas abas são criadas/nomeadas pelo próprio código, não abas externas
// cujo nome pode mudar.
async function readRange(spreadsheetId, range) {
  const token = await getAccessToken();
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets values (read): ' + (body.error?.message || r.status));
  return body.values || [];
}

// Limpa o range inteiro e reescreve do zero — mais simples que rastrear
// índice de linha pra deletar/atualizar seletivamente, e o volume de dados
// (tags ativas, TTL de 10 dias) é pequeno o bastante pra isso ser barato.
// ponytail: sem lock — dois writes concorrentes podem se sobrepor (last
// write wins); upgrade se o volume de uso crescer.
async function writeRange(spreadsheetId, range, values) {
  const token = await getAccessToken();
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + token } }
  );
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) }
  );
  const body = await r.json();
  if (!r.ok) throw new Error('Sheets values (write): ' + (body.error?.message || r.status));
}

// Cria a aba se ainda não existir (idempotente) — usado pra provisionar
// monitor_tags_pulso no primeiro uso da feature de tags, sem exigir setup
// manual do Roberto na planilha.
async function ensureSheetExists(spreadsheetId, title) {
  const token = await getAccessToken();
  const sheets = await fetchSheetsMeta(token, spreadsheetId);
  if (sheets.some(s => s.properties.title === title)) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  if (!r.ok) {
    const body = await r.json();
    throw new Error('Sheets addSheet: ' + (body.error?.message || r.status));
  }
}

module.exports = { fetchTabByGid, fetchTabRawValues, listTabs, readRange, writeRange, ensureSheetExists };
