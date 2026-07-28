/**
 * PULSO — agregação da base SPR (viagens/trips).
 *
 * A aba spr_pulso tem ~20 mil linhas / ~15MB em JSON — grande demais pra
 * mandar pro navegador a cada mudança de filtro. Esta function busca a
 * planilha, filtra e agrega no servidor, devolvendo só os números prontos
 * pros cards (+ as opções disponíveis pra popular os filtros).
 *
 * Query params:
 *   dim         'day' | 'week' | 'month' (default 'day')
 *   date        data de referência 'YYYY-MM-DD' (default: data mais recente na base)
 *   turno       lista separada por vírgula (ex: T1,T2)
 *   solicitation_by, destination, vehicle, agency  idem, listas separadas por vírgula
 *   q           texto livre pra busca em destination_station_code (contains)
 */
const { fetchTabByGid } = require('./_google');

const SPR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1276487267' };

function toNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseCSV(v) {
  return v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [];
}

// Início do dia/semana(seg-dom)/mês que contém `date`, em UTC pra evitar fuso.
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

function aggregate(rows) {
  const tripCount = rows.length;
  const totalOrders = rows.reduce((s, r) => s + toNum(r.total_orders), 0);
  return {
    viagens: tripCount,
    pedidosPorViagem: tripCount ? +(totalOrders / tripCount).toFixed(1) : 0,
    ordersScuttle: rows.reduce((s, r) => s + toNum(r.orders_scuttle), 0),
    ordersSaca: rows.reduce((s, r) => s + toNum(r.orders_saca), 0),
    toScuttle: rows.reduce((s, r) => s + toNum(r.to_scuttle), 0),
    toSaca: rows.reduce((s, r) => s + toNum(r.to_saca), 0),
  };
}

function pctDelta(atual, anterior) {
  if (!anterior) return atual ? 100 : 0;
  return +(((atual - anterior) / anterior) * 100).toFixed(1);
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SPR_SHEET.spreadsheetId, SPR_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const withDate = rows
    .map(r => ({ ...r, __date: r.cutoff_date ? new Date(r.cutoff_date + 'T00:00:00Z') : null }))
    .filter(r => r.__date && !isNaN(r.__date));

  const dim = ['day', 'week', 'month'].includes(req.query.dim) ? req.query.dim : 'day';
  const maisRecente = withDate.reduce((max, r) => (r.__date > max ? r.__date : max), withDate[0]?.__date || new Date());
  const refDate = req.query.date ? new Date(req.query.date + 'T00:00:00Z') : maisRecente;

  const turnos = parseCSV(req.query.turno);
  const solicitantes = parseCSV(req.query.solicitation_by);
  const destinos = parseCSV(req.query.destination);
  const veiculos = parseCSV(req.query.vehicle);
  const agencias = parseCSV(req.query.agency);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!turnos.length || turnos.includes(r.turno)) &&
    (!solicitantes.length || solicitantes.includes(r.solicitation_by)) &&
    (!destinos.length || destinos.includes(r.destination_station_code)) &&
    (!veiculos.length || veiculos.includes(r.used_vehicle)) &&
    (!agencias.length || agencias.includes(r.used_agency_name)) &&
    (!busca || String(r.destination_station_code || '').toLowerCase().includes(busca));

  const filtradas = withDate.filter(passaFiltros);

  const inicio = periodStart(refDate, dim);
  const fim = periodEnd(inicio, dim);
  const inicioAnt = periodBefore(inicio, dim);
  const fimAnt = inicio;

  const doPeriodo = filtradas.filter(r => r.__date >= inicio && r.__date < fim);
  const doPeriodoAnterior = filtradas.filter(r => r.__date >= inicioAnt && r.__date < fimAnt);

  const atual = aggregate(doPeriodo);
  const anterior = aggregate(doPeriodoAnterior);
  const delta = {};
  Object.keys(atual).forEach(k => { delta[k] = pctDelta(atual[k], anterior[k]); });

  const uniq = key => [...new Set(withDate.map(r => r[key]).filter(Boolean))].sort();

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    periodo: { dim, inicio: fmtDate(inicio), fim: fmtDate(new Date(fim - 86400000)), inicioAnterior: fmtDate(inicioAnt), fimAnterior: fmtDate(new Date(fimAnt - 86400000)) },
    atual, anterior, delta,
    opcoesFiltro: {
      turno: uniq('turno'),
      solicitation_by: uniq('solicitation_by'),
      destination_station_code: uniq('destination_station_code'),
      used_vehicle: uniq('used_vehicle'),
      used_agency_name: uniq('used_agency_name'),
    },
  });
};
