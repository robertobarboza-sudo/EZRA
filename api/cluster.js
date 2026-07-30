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
 * adicionar depois). Ocupação total % = TOs endereçados / (nº de ruas
 * conhecidas × 20).
 *
 * Classificação de "to pack": "Saca Sorter" e "Saca" contam como sacas;
 * "Scuttle" conta como scuttle; "Volumoso"/"Pallet"/"-" entram no total de
 * pacotes mas não em nenhum dos dois cards específicos.
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

function aggregate(rows, capacidadeTotal) {
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
  const ocupacaoTotalPct = capacidadeTotal ? +(enderecados / capacidadeTotal * 100).toFixed(1) : 0;

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

// Ordena "RUA 007" antes de "RUA 041" e deixa "RESERVA..."/outros no final.
function ordemRua(rua) {
  const m = String(rua).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
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

  // Nº de ruas conhecidas na base inteira (não só no período filtrado) — a
  // capacidade física do CD não muda com o filtro de data/turno.
  const ruasConhecidas = new Set(withDate.map(r => r.rua).filter(r => r && r !== 'Pendente'));
  const capacidadeTotal = ruasConhecidas.size * CAPACIDADE_POR_RUA;

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

  const atual = aggregate(doPeriodo, capacidadeTotal);
  const anterior = aggregate(doPeriodoAnterior, capacidadeTotal);
  const delta = {};
  Object.keys(atual).forEach(k => { delta[k] = pctDelta(atual[k], anterior[k]); });

  // Mapa: ocupação por rua no período selecionado (TOs com stage=ENDEREÇADO).
  const porRua = new Map();
  doPeriodo.forEach(r => {
    if (r.stage !== 'ENDEREÇADO' || !r.rua || r.rua === 'Pendente') return;
    porRua.set(r.rua, (porRua.get(r.rua) || 0) + 1);
  });
  const mapa = [...ruasConhecidas].sort((a, b) => ordemRua(a) - ordemRua(b)).map(rua => {
    const ocupadas = porRua.get(rua) || 0;
    return { rua, ocupadas, capacidade: CAPACIDADE_POR_RUA, pct: +(ocupadas / CAPACIDADE_POR_RUA * 100).toFixed(1) };
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
    mapa, capacidadeTotal, ruasConhecidas: ruasConhecidas.size, pendentesNoPeriodo,
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
