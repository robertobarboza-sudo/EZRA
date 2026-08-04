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

// Cutoff operacional (padrão pra todos os reports/gráficos do PULSO,
// confirmado com o Roberto em 2026-08-04): o "dia" da operação vai das 6h
// da manhã do dia D até as 5:59 do dia D+1 — não é o dia-calendário
// 00h-23:59h. A maioria das abas (Outbound, ASM, Inbound...) já entrega
// esse corte pronto num campo cutoff/data_operacional/data_eta_ajustado
// vindo da própria planilha, então essas páginas não precisam de nada
// daqui — só usam os helpers abaixo onde o PULSO calcula a data sozinho:
// (1) resolver "hoje" (o relógio do servidor não sabe do cutoff) e (2)
// bucketizar um timestamp cru (ex.: snapshot_hora do Backlog) numa data
// operacional. Horário de Brasília fixo (UTC-3, sem horário de verão desde
// 2019) — mesma convenção que o resto do PULSO já usa pros timestamps
// crus da planilha (ver horaDe() em inbound-lh.js).
const CUTOFF_HORA = 6;
const BR_OFFSET_MS = -3 * 60 * 60 * 1000;

// "hoje" operacional: antes das 6h locais, o dia operacional vigente ainda
// é o de ontem.
function hojeOperacionalIso() {
  const agora = new Date(Date.now() + BR_OFFSET_MS);
  if (agora.getUTCHours() < CUTOFF_HORA) agora.setUTCDate(agora.getUTCDate() - 1);
  return agora.toISOString().slice(0, 10);
}

// Dado um timestamp cru "YYYY-MM-DD HH:MM:SS" (já em horário local, mesma
// convenção usada em todo o PULSO), devolve a data operacional (cutoff 6h)
// a que ele pertence — ex.: "2026-08-03 02:00:00" -> "2026-08-02".
function dataOperacionalDe(tsRaw) {
  const m = String(tsRaw || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):\d{2}:\d{2}$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (+m[4] < CUTOFF_HORA) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { periodStart, periodEnd, periodBefore, fmtDate, toNum, parseCSV, pctDelta, hojeOperacionalIso, dataOperacionalDe };
