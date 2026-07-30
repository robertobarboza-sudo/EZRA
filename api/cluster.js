/**
 * PULSO — agregação da base Clusterização (endereçamento de TOs em ruas do CD).
 *
 * A aba cluster_pulso é uma tabela de TOs individuais (uma linha por TO),
 * não uma grade pronta de ocupação por doca/rua (ver docs/integracao-planilha.md,
 * seção "Clusterização — modelo pausado" pro histórico da tentativa anterior
 * que assumiu colunas erradas). Este endpoint deriva a ocupação por rua a
 * partir de `stage`/`rua`: cada TO com stage=ENDEREÇADO ocupa 1 posição na
 * rua indicada; `rua`="Pendente" (stage=PENDENTE) significa que o TO ainda
 * não foi endereçado a nenhuma rua física.
 *
 * Capacidade por rua: fixa em 20 posições (confirmado com o Roberto em
 * 2026-07-30 — não existe coluna de capacidade na planilha ainda; ele vai
 * adicionar depois). Ocupação total % = TOs endereçados / (142 ruas do
 * roster fixo + reservas conhecidas) × 20 — não é derivado do histórico de
 * dados, que só mostra as ruas já usadas nos últimos dias (~90 de 142).
 *
 * Classificação de "to pack": "Saca Sorter" e "Saca" contam como sacas;
 * "Scuttle" conta como scuttle; "Volumoso"/"Pallet"/"-" entram no total de
 * pacotes mas não em nenhum dos dois cards específicos.
 *
 * `grade`: 1 item por rua do roster fixo (142 + reservas), com estatísticas
 * do período filtrado (ocupadas/saca/scuttle/pacotes/agingMedio/fanout).
 * Campos que o modelo visual antigo tinha mas não existem em cluster_pulso
 * (SPP posição, doca, próx. CPT, timer CPT, cluster ideal) ficam de fora —
 * decidido com o Roberto em 2026-07-30, adicionar depois se a coluna surgir.
 *
 * Query params:
 *   dim, date                    iguais ao /api/spr (baseado em "create time")
 *   direction                    lista separada por vírgula
 *   to_pack                      lista separada por vírgula
 *   destino, estacao, rua        listas separadas por vírgula
 *   q                            busca livre em "to number" + destino
 */
const { fetchTabByGid } = require('./_google');
const { periodStart, periodEnd, periodBefore, fmtDate, toNum, parseCSV, pctDelta } = require('./_period');

const CLUSTER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '646168208' };
const CAPACIDADE_POR_RUA = 20;

const SACA_TIPOS = new Set(['Saca Sorter', 'Saca']);
const SCUTTLE_TIPOS = new Set(['Scuttle']);

// Roster fixo das 142 ruas físicas (confirmado com o Roberto em 2026-07-30 —
// não é derivado do histórico de dados, que só tem TOs pras ruas já usadas
// nos últimos dias) + ruas de reserva conhecidas (vistas na base real; se
// surgir outra reserva nova, adicionar aqui).
const RUA_RESERVAS_CONHECIDAS = ['RESERVA 37A'];
const RUA_ROSTER = [
  ...Array.from({ length: 142 }, (_, i) => 'RUA ' + String(i + 1).padStart(3, '0')),
  ...RUA_RESERVAS_CONHECIDAS,
];
const CAPACIDADE_TOTAL_CD = RUA_ROSTER.length * CAPACIDADE_POR_RUA;

function aggregate(rows) {
  const totalRegistros = rows.length;
  const pacotesTotal = rows.reduce((s, r) => s + toNum(r.quantity), 0);

  let pacotesSaca = 0, pacotesScuttle = 0;
  rows.forEach(r => {
    const tp = r['to pack'];
    const q = toNum(r.quantity);
    if (SACA_TIPOS.has(tp)) pacotesSaca += q;
    else if (SCUTTLE_TIPOS.has(tp)) pacotesScuttle += q;
  });

  const enderecados = rows.filter(r => r.stage === 'ENDEREÇADO').length;
  const agingMedio = totalRegistros ? +(rows.reduce((s, r) => s + toNum(r.aging), 0) / totalRegistros).toFixed(1) : 0;
  const pctAtendimento = totalRegistros ? +(enderecados / totalRegistros * 100).toFixed(1) : 0;
  const ocupacaoTotalPct = +(enderecados / CAPACIDADE_TOTAL_CD * 100).toFixed(1);

  return {
    totalRegistros,
    pacotesTotal,
    pacotesSaca,
    pacotesScuttle,
    enderecados,
    agingMedio,
    pctAtendimento,
    ocupacaoTotalPct,
  };
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(CLUSTER_SHEET.spreadsheetId, CLUSTER_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const withDate = rows
    .map(r => ({ ...r, __date: r['create time'] ? new Date(String(r['create time']).replace(' ', 'T') + 'Z') : null }))
    .filter(r => r.__date && !isNaN(r.__date));

  const dim = ['day', 'week', 'month'].includes(req.query.dim) ? req.query.dim : 'day';
  const maisRecente = withDate.reduce((max, r) => (r.__date > max ? r.__date : max), withDate[0]?.__date || new Date());
  const refDate = req.query.date ? new Date(req.query.date + 'T00:00:00Z') : maisRecente;

  const direcoes = parseCSV(req.query.direction);
  const toPacks = parseCSV(req.query.to_pack);
  const destinos = parseCSV(req.query.destino);
  const estacoes = parseCSV(req.query.estacao);
  const ruas = parseCSV(req.query.rua);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!direcoes.length || direcoes.includes(r.direction)) &&
    (!toPacks.length || toPacks.includes(r['to pack'])) &&
    (!destinos.length || destinos.includes(r.destino)) &&
    (!estacoes.length || estacoes.includes(r['current station'])) &&
    (!ruas.length || ruas.includes(r.rua)) &&
    (!busca || String(r['to number'] || '').toLowerCase().includes(busca) || String(r.destino || '').toLowerCase().includes(busca));

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

  // Grade por rua no período selecionado — só TOs com stage=ENDEREÇADO contam
  // como posição ocupada. "Pendente" (sem rua) não entra em nenhuma coluna;
  // aparece só como aviso separado (pendentesNoPeriodo).
  const porRua = new Map();
  doPeriodo.forEach(r => {
    if (r.stage !== 'ENDEREÇADO' || !r.rua || r.rua === 'Pendente') return;
    if (!porRua.has(r.rua)) porRua.set(r.rua, { ocupadas: 0, saca: 0, scuttle: 0, pacotes: 0, agingSoma: 0, destinos: new Map() });
    const acc = porRua.get(r.rua);
    const q = toNum(r.quantity);
    acc.ocupadas++;
    acc.pacotes += q;
    if (SACA_TIPOS.has(r['to pack'])) acc.saca += q;
    else if (SCUTTLE_TIPOS.has(r['to pack'])) acc.scuttle += q;
    acc.agingSoma += toNum(r.aging);
    if (r.destino) acc.destinos.set(r.destino, (acc.destinos.get(r.destino) || 0) + 1);
  });

  const grade = RUA_ROSTER.map(rua => {
    const acc = porRua.get(rua);
    if (!acc || !acc.ocupadas) {
      return { rua, ocupadas: 0, capacidade: CAPACIDADE_POR_RUA, pct: 0, saca: 0, scuttle: 0, pacotes: 0, agingMedio: null, fanout: null };
    }
    let fanout = null, fanoutMax = 0;
    acc.destinos.forEach((n, destino) => { if (n > fanoutMax) { fanoutMax = n; fanout = destino; } });
    return {
      rua,
      ocupadas: acc.ocupadas,
      capacidade: CAPACIDADE_POR_RUA,
      pct: +(acc.ocupadas / CAPACIDADE_POR_RUA * 100).toFixed(1),
      saca: acc.saca,
      scuttle: acc.scuttle,
      pacotes: acc.pacotes,
      agingMedio: +(acc.agingSoma / acc.ocupadas).toFixed(1),
      fanout,
    };
  });
  const pendentesNoPeriodo = doPeriodo.filter(r => r.stage === 'PENDENTE').length;

  const uniq = key => [...new Set(withDate.map(r => r[key]).filter(Boolean))].sort();

  const dataMinima = withDate.reduce((min, r) => (r.__date < min ? r.__date : min), withDate[0]?.__date || refDate);
  const dataMaxima = maisRecente;

  const LIMITE = 500;
  const ordenadas = [...doPeriodo].sort((a, b) => b.__date - a.__date);
  const tos = ordenadas.slice(0, LIMITE).map(r => ({
    to_number: r['to number'],
    destino: r.destino,
    current_station: r['current station'],
    to_pack: r['to pack'],
    quantity: toNum(r.quantity),
    aging: toNum(r.aging),
    stage: r.stage,
    rua: r.rua,
    create_time: r['create time'],
  }));

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    periodo: { dim, inicio: fmtDate(inicio), fim: fmtDate(new Date(fim - 86400000)), inicioAnterior: fmtDate(inicioAnt), fimAnterior: fmtDate(new Date(fimAnt - 86400000)) },
    cobertura: { inicio: fmtDate(dataMinima), fim: fmtDate(dataMaxima) },
    atual, anterior, delta,
    grade, capacidadeTotal: CAPACIDADE_TOTAL_CD, totalRuas: RUA_ROSTER.length, pendentesNoPeriodo,
    tos, tosTotal: doPeriodo.length,
    opcoesFiltro: {
      direction: uniq('direction'),
      to_pack: uniq('to pack'),
      destino: uniq('destino'),
      estacao: uniq('current station'),
      rua: uniq('rua').filter(r => r !== 'Pendente'),
    },
  });
};
