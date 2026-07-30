/**
 * PULSO — agregação da base Clusterização (endereçamento de TOs em ruas do CD).
 *
 * Diferente do SPR/Leftover, essa página é "ao vivo": não tem filtro de
 * dia/semana/mês nem comparação vs período anterior (decidido com o Roberto
 * em 2026-07-30) — os cards, a grade de ruas e os insights sempre refletem
 * 100% do que está na aba `cluster_pulso` agora, ou seja, o piso atual. Os
 * filtros (To Pack, Destino, Rua) só afetam a tabela de TOs, não os cards
 * nem a grade — pra ver "o piso inteiro" sempre visível nos KPIs/grade.
 *
 * `stage`=ENDEREÇADO = TO já ocupa 1 posição física na `rua` indicada;
 * `stage`=PENDENTE (`rua`="Pendente") = TO ainda sem rua física.
 *
 * Capacidade por rua: fixa em 20 posições (confirmado com o Roberto em
 * 2026-07-30 — não existe coluna de capacidade na planilha ainda). Ocupação
 * total % = TOs endereçados / (142 ruas do roster fixo + reservas
 * conhecidas) × 20 — roster fixo, não derivado do histórico de dados.
 *
 * "to pack": para fins de filtro, "Saca Sorter" e "Saca" são tratados como
 * um único unitizador ("Saca") — ver `toPackGrupo()`. Nos cards, a mesma
 * junção vale pro card "Total de Sacas"; "Scuttle" tem card próprio;
 * "Volumoso"/"Pallet"/"-" entram só no total geral de pacotes.
 *
 * `grade`: 1 item por rua do roster fixo (142 + reservas). Campos que o
 * modelo visual antigo tinha mas não existem em cluster_pulso (SPP posição,
 * doca, próx. CPT, timer CPT, cluster ideal) ficam de fora — decidido com o
 * Roberto em 2026-07-30, adicionar depois se a coluna surgir.
 *
 * Query params (só afetam a tabela `tos`, não os cards/grade):
 *   to_pack              lista separada por vírgula, valores agrupados (Saca/Scuttle/Volumoso/Pallet/-)
 *   destino, rua          listas separadas por vírgula
 *   q                     busca livre em "to number" + destino
 */
const { fetchTabByGid } = require('./_google');
const { toNum, parseCSV } = require('./_period');

const CLUSTER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '646168208' };
const CAPACIDADE_POR_RUA = 20;

const SACA_TIPOS = new Set(['Saca Sorter', 'Saca']);
const SCUTTLE_TIPOS = new Set(['Scuttle']);

// Agrupa "Saca Sorter"+"Saca" num único unitizador pra filtro/exibição.
function toPackGrupo(tp) {
  if (SACA_TIPOS.has(tp)) return 'Saca';
  if (SCUTTLE_TIPOS.has(tp)) return 'Scuttle';
  return tp || '-';
}

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

  const comData = rows.map(r => ({ ...r, __date: r['create time'] ? new Date(String(r['create time']).replace(' ', 'T') + 'Z') : null }));

  // Cards, grade e insights sempre olham pra 100% do piso atual (sem filtro
  // de data/turno — a aba já É o piso agora). Só a tabela de TOs é filtrada.
  const atual = aggregate(comData);

  const porRua = new Map();
  comData.forEach(r => {
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
  const pendentesAtual = comData.filter(r => r.stage === 'PENDENTE').length;

  // Top destinos por volume no piso inteiro agora — pro Pipboy ("destino com
  // maior quantidade de volumes").
  const porDestino = new Map();
  comData.forEach(r => {
    if (!r.destino) return;
    porDestino.set(r.destino, (porDestino.get(r.destino) || 0) + toNum(r.quantity));
  });
  const topDestinos = [...porDestino.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([destino, pacotes]) => ({ destino, pacotes }));

  // Filtros — só afetam a tabela de TOs abaixo.
  const toPacks = parseCSV(req.query.to_pack);
  const destinos = parseCSV(req.query.destino);
  const ruas = parseCSV(req.query.rua);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!toPacks.length || toPacks.includes(toPackGrupo(r['to pack']))) &&
    (!destinos.length || destinos.includes(r.destino)) &&
    (!ruas.length || ruas.includes(r.rua)) &&
    (!busca || String(r['to number'] || '').toLowerCase().includes(busca) || String(r.destino || '').toLowerCase().includes(busca));

  const filtradas = comData.filter(passaFiltros);
  const ordenadas = [...filtradas].sort((a, b) => (b.__date || 0) - (a.__date || 0));
  const LIMITE = 500;
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

  const uniq = key => [...new Set(comData.map(r => r[key]).filter(Boolean))].sort();

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    atual,
    grade, capacidadeTotal: CAPACIDADE_TOTAL_CD, totalRuas: RUA_ROSTER.length, pendentesAtual, topDestinos,
    tos, tosTotal: filtradas.length,
    opcoesFiltro: {
      to_pack: [...new Set(comData.map(r => toPackGrupo(r['to pack'])).filter(Boolean))].sort(),
      destino: uniq('destino'),
      rua: uniq('rua').filter(r => r !== 'Pendente'),
    },
  });
};
