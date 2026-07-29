/**
 * PULSO — agregação da base Leftover (pacotes remanescentes por hub/CPT).
 *
 * Mesma lógica de agregação server-side do SPR (ver api/spr.js): filtra e
 * agrega no servidor, devolve só os números prontos pros cards.
 *
 * Métrica principal: leftover_until_cap (packages que sobraram dentro da
 * capacidade do hub). leftover_over_cap é quase sempre "[INFO] Sem Volumes
 * a Justificar" (>97% das linhas) — não é usado nos totais.
 *
 * Classificação de causa (leftover_until_cap_causa_l1), decidida com o time:
 *   [SOC]  -> Operacional
 *   [GOV]  -> Inconsistência de Dados (fora dos 2 cards, aparece só no Pipboy)
 *   demais ([LH], [3PL], [XPT], [EXT], [INFO], outros) -> Externo
 *
 * Query params:
 *   dim, date                          iguais ao /api/spr
 *   turno, type_cpt                    listas separadas por vírgula
 *   hub, causa1 (causa_l1), causa2 (causa_l2)  idem
 *   q                                  busca livre em hub + observacao
 */
const { fetchTabByGid } = require('./_google');
const { periodStart, periodEnd, periodBefore, fmtDate, toNum, parseCSV, pctDelta } = require('./_period');

const LEFTOVER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '352174025' };

function classificarCausa(causa) {
  const c = String(causa || '');
  if (c.startsWith('[SOC]')) return 'operacional';
  if (c.startsWith('[GOV]')) return 'inconsistencia';
  return 'externo';
}

function aggregate(rows) {
  const registros = rows.length;
  const destinos = new Set(rows.map(r => r.hub).filter(Boolean)).size;
  const pacotesLeftover = rows.reduce((s, r) => s + toNum(r.leftover_until_cap), 0);

  let pacotesOperacional = 0, pacotesExterno = 0, pacotesInconsistencia = 0;
  rows.forEach(r => {
    const qtd = toNum(r.leftover_until_cap);
    const cls = classificarCausa(r.leftover_until_cap_causa_l1);
    if (cls === 'operacional') pacotesOperacional += qtd;
    else if (cls === 'inconsistencia') pacotesInconsistencia += qtd;
    else pacotesExterno += qtd;
  });

  return {
    registros,
    destinos,
    pacotesLeftover,
    pctOperacional: pacotesLeftover ? +(pacotesOperacional / pacotesLeftover * 100).toFixed(1) : 0,
    pacotesOperacional,
    pctExterno: pacotesLeftover ? +(pacotesExterno / pacotesLeftover * 100).toFixed(1) : 0,
    pacotesExterno,
    pacotesInconsistencia,
  };
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(LEFTOVER_SHEET.spreadsheetId, LEFTOVER_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const withDate = rows
    .map(r => ({ ...r, __date: r.data ? new Date(r.data + 'T00:00:00Z') : null }))
    .filter(r => r.__date && !isNaN(r.__date));

  const dim = ['day', 'week', 'month'].includes(req.query.dim) ? req.query.dim : 'day';
  const maisRecente = withDate.reduce((max, r) => (r.__date > max ? r.__date : max), withDate[0]?.__date || new Date());
  const refDate = req.query.date ? new Date(req.query.date + 'T00:00:00Z') : maisRecente;

  const turnos = parseCSV(req.query.turno);
  const tiposCpt = parseCSV(req.query.type_cpt);
  const hubs = parseCSV(req.query.hub);
  const causas1 = parseCSV(req.query.causa1);
  const causas2 = parseCSV(req.query.causa2);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!turnos.length || turnos.includes(r.turno)) &&
    (!tiposCpt.length || tiposCpt.includes(r.type_cpt)) &&
    (!hubs.length || hubs.includes(r.hub)) &&
    (!causas1.length || causas1.includes(r.leftover_until_cap_causa_l1)) &&
    (!causas2.length || causas2.includes(r.leftover_until_cap_causa_l2)) &&
    (!busca || String(r.hub || '').toLowerCase().includes(busca) || String(r.observacao || '').toLowerCase().includes(busca));

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

  // Cobertura real da base (não o período filtrado) — pra avisar até quando os dados vão.
  const dataMinima = withDate.reduce((min, r) => (r.__date < min ? r.__date : min), withDate[0]?.__date || refDate);
  const dataMaxima = maisRecente;

  const LIMITE = 500;
  const ordenadas = [...doPeriodo].sort((a, b) => b.__date - a.__date);
  const leftovers = ordenadas.slice(0, LIMITE).map(r => ({
    hub: r.hub,
    type_cpt: r.type_cpt,
    turno: r.turno,
    hora: toNum(r.hora),
    cpt_planejado: r.cpt_planejado,
    leftover_until_cap: toNum(r.leftover_until_cap),
    leftover_until_cap_causa_l1: r.leftover_until_cap_causa_l1,
    leftover_until_cap_causa_l2: r.leftover_until_cap_causa_l2,
    expedido: toNum(r.expedido),
    backlog_2hrs_cpt: toNum(r.backlog_2hrs_cpt),
    observacao: r.observacao,
  }));

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    periodo: { dim, inicio: fmtDate(inicio), fim: fmtDate(new Date(fim - 86400000)), inicioAnterior: fmtDate(inicioAnt), fimAnterior: fmtDate(new Date(fimAnt - 86400000)) },
    cobertura: { inicio: fmtDate(dataMinima), fim: fmtDate(dataMaxima) },
    atual, anterior, delta,
    leftovers, leftoversTotal: doPeriodo.length,
    opcoesFiltro: {
      turno: uniq('turno'),
      type_cpt: uniq('type_cpt'),
      hub: uniq('hub'),
      causa1: uniq('leftover_until_cap_causa_l1'),
      causa2: uniq('leftover_until_cap_causa_l2'),
    },
  });
};
