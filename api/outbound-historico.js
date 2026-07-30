/**
 * PULSO — Outbound Histórico: mesmo modelo de período do SPR (dia/semana/mês
 * + comparação vs período anterior), agrupando por `cutoff` (dia
 * operacional, igual ao cutoff_date do SPR). Mesma lógica de turno/carro
 * compartilhado do On-time (ver api/_outbound.js) — aqui só muda que o
 * filtro de turno/período é aplicado sobre a base inteira, não fixado no
 * cutoff mais recente.
 *
 * Query params:
 *   dim, date                    iguais ao /api/spr (baseado em "cutoff")
 *   turno                        lista separada por vírgula (T1,T2,T3)
 *   destino, agencia, veiculo    listas separadas por vírgula
 *   q                            busca livre em lh_trips
 */
const { fetchTabByGid } = require('./_google');
const { periodStart, periodEnd, periodBefore, fmtDate, parseCSV, pctDelta } = require('./_period');
const { enrich, pertenceAoTurno, aggregate, toCarroRow } = require('./_outbound');

const OUTBOUND_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '0' };

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(OUTBOUND_SHEET.spreadsheetId, OUTBOUND_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  // `status` (CONSIDERAR/DESCONSIDERAR) é só um espelho derivado do
  // status_agrupado — DESCONSIDERAR = CANCELADO+INFRUTÍFERA+NO SHOW+NÃO
  // CONSUMIDA somados, nada mais. NÃO filtrar por ele: são exatamente os
  // status que o Roberto pediu pra evidenciar em cards próprios.
  const withDate = rows
    .map(r => enrich({ ...r, __date: r.cutoff ? new Date(r.cutoff + 'T00:00:00Z') : null }))
    .filter(r => r.__date && !isNaN(r.__date));

  const dim = ['day', 'week', 'month'].includes(req.query.dim) ? req.query.dim : 'day';
  const maisRecente = withDate.reduce((max, r) => (r.__date > max ? r.__date : max), withDate[0]?.__date || new Date());
  const refDate = req.query.date ? new Date(req.query.date + 'T00:00:00Z') : maisRecente;

  const turnos = parseCSV(req.query.turno);
  const destinos = parseCSV(req.query.destino);
  const agencias = parseCSV(req.query.agencia);
  const veiculos = parseCSV(req.query.veiculo);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!turnos.length || turnos.some(t => pertenceAoTurno(r, t))) &&
    (!destinos.length || destinos.includes(r.destination_station_code)) &&
    (!agencias.length || agencias.includes(r.used_agency_name)) &&
    (!veiculos.length || veiculos.includes(r.used_vehicle)) &&
    (!busca || String(r.lh_trips || '').toLowerCase().includes(busca));

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

  const dataMinima = withDate.reduce((min, r) => (r.__date < min ? r.__date : min), withDate[0]?.__date || refDate);
  const dataMaxima = maisRecente;

  const LIMITE = 500;
  const ordenadas = [...doPeriodo].sort((a, b) => b.__date - a.__date);
  const carros = ordenadas.slice(0, LIMITE).map(toCarroRow);

  const uniq = key => [...new Set(withDate.map(r => r[key]).filter(Boolean))].sort();

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    periodo: { dim, inicio: fmtDate(inicio), fim: fmtDate(new Date(fim - 86400000)), inicioAnterior: fmtDate(inicioAnt), fimAnterior: fmtDate(new Date(fimAnt - 86400000)) },
    cobertura: { inicio: fmtDate(dataMinima), fim: fmtDate(dataMaxima) },
    atual, anterior, delta,
    carros, carrosTotal: doPeriodo.length,
    opcoesFiltro: {
      turno: ['T1', 'T2', 'T3'],
      destino: uniq('destination_station_code'),
      agencia: uniq('used_agency_name'),
      veiculo: uniq('used_vehicle'),
    },
  });
};
