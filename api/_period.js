/**
 * Matemática de período (dia/semana/mês) compartilhada entre os
 * endpoints de dashboard (spr, leftover, ...). Semana = segunda a
 * domingo; tudo em UTC pra não depender do fuso do servidor.
 */

function periodStart(date, dim) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (dim === 'day') return d;
  if (dim === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const dow = (d.getUTCDay() + 6) % 7; // segunda=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function periodEnd(start, dim) {
  const e = new Date(start);
  if (dim === 'day') e.setUTCDate(e.getUTCDate() + 1);
  else if (dim === 'week') e.setUTCDate(e.getUTCDate() + 7);
  else e.setUTCMonth(e.getUTCMonth() + 1);
  return e;
}

function periodBefore(start, dim) {
  const s = new Date(start);
  if (dim === 'day') s.setUTCDate(s.getUTCDate() - 1);
  else if (dim === 'week') s.setUTCDate(s.getUTCDate() - 7);
  else s.setUTCMonth(s.getUTCMonth() - 1);
  return s;
}

const fmtDate = d => d.toISOString().slice(0, 10);

function toNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Cada valor vem individualmente com encodeURIComponent do front (ver
// pulsoQueryString em index.html) antes de juntar com vírgula — necessário
// porque alguns valores de filtro (ex: causas do Leftover) têm vírgula
// dentro do próprio texto, o que corromperia um split(',') ingênuo.
function parseCSV(v) {
  if (!v) return [];
  return String(v).split(',').map(s => {
    try { return decodeURIComponent(s.trim()); } catch (e) { return s.trim(); }
  }).filter(Boolean);
}

function pctDelta(atual, anterior) {
  if (!anterior) return atual ? 100 : 0;
  return +(((atual - anterior) / anterior) * 100).toFixed(1);
}

module.exports = { periodStart, periodEnd, periodBefore, fmtDate, toNum, parseCSV, pctDelta };
