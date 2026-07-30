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
 * total % = posições ocupadas / (142 ruas do roster fixo + reservas
 * conhecidas) × 20 — roster fixo, não derivado do histórico de dados. Cada
 * TO ocupa 1 posição, EXCETO sacos (Saca Sorter/Saca): 10 sacos = 1 posição
 * (confirmado com o Roberto em 2026-07-30).
 *
 * `atual.att`: data/hora máxima de `complete time` na base — "última
 * atualização" real do piso (a tabela de TOs também ordena por essa coluna,
 * não mais por create time).
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

  // ocupacaoTotalPct/posicoesOcupadas são preenchidos depois de montar `grade`
  // (dependem da regra de 10 sacos = 1 posição, calculada por rua).
  return {
    totalRegistros,
    pacotesTotal,
    pacotesSaca,
    pacotesScuttle,
    enderecados,
    agingMedio,
    pctAtendimento,
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

  // Ordenação/"Att." usam complete time (quando o TO foi de fato concluído),
  // não create time — é o timestamp que representa o piso mais fielmente.
  const comData = rows.map(r => ({ ...r, __date: r['complete time'] ? new Date(String(r['complete time']).replace(' ', 'T') + 'Z') : null }));

  // Cards, grade e insights sempre olham pra 100% do piso atual (sem filtro
  // de data/turno — a aba já É o piso agora). Só a tabela de TOs é filtrada.
  const atual = aggregate(comData);

  // Cada posição do quadrado representa 1 slot físico. Sacos (Saca Sorter +
  // Saca) são pequenos e cabem vários por posição — 10 sacos = 1 posição
  // (confirmado com o Roberto em 2026-07-30). Os demais unitizadores
  // (Scuttle/Volumoso/Pallet/-) ocupam 1 posição cada.
  const SACOS_POR_POSICAO = 10;
  const porRua = new Map();
  comData.forEach(r => {
    if (r.stage !== 'ENDEREÇADO' || !r.rua || r.rua === 'Pendente') return;
    if (!porRua.has(r.rua)) porRua.set(r.rua, { sacaTOs: 0, outrosTOs: 0, saca: 0, scuttle: 0, pacotes: 0, agingSoma: 0, agingCount: 0, destinos: new Map() });
    const acc = porRua.get(r.rua);
    const q = toNum(r.quantity);
    const isSaca = SACA_TIPOS.has(r['to pack']);
    if (isSaca) acc.sacaTOs++; else acc.outrosTOs++;
    acc.pacotes += q;
    if (isSaca) acc.saca += q;
    else if (SCUTTLE_TIPOS.has(r['to pack'])) acc.scuttle += q;
    acc.agingSoma += toNum(r.aging);
    acc.agingCount++;
    if (r.destino) acc.destinos.set(r.destino, (acc.destinos.get(r.destino) || 0) + 1);
  });

  const grade = RUA_ROSTER.map(rua => {
    const acc = porRua.get(rua);
    if (!acc || (!acc.sacaTOs && !acc.outrosTOs)) {
      return { rua, ocupadas: 0, capacidade: CAPACIDADE_POR_RUA, pct: 0, saca: 0, scuttle: 0, pacotes: 0, agingMedio: null, fanout: null };
    }
    const posicoes = acc.outrosTOs + Math.ceil(acc.sacaTOs / SACOS_POR_POSICAO);
    let fanout = null, fanoutMax = 0;
    acc.destinos.forEach((n, destino) => { if (n > fanoutMax) { fanoutMax = n; fanout = destino; } });
    return {
      rua,
      ocupadas: posicoes,
      capacidade: CAPACIDADE_POR_RUA,
      pct: +(posicoes / CAPACIDADE_POR_RUA * 100).toFixed(1),
      saca: acc.saca,
      scuttle: acc.scuttle,
      pacotes: acc.pacotes,
      agingMedio: +(acc.agingSoma / acc.agingCount).toFixed(1),
      fanout,
    };
  });
  const posicoesOcupadasTotal = grade.reduce((s, g) => s + g.ocupadas, 0);
  atual.posicoesOcupadas = posicoesOcupadasTotal;
  atual.ocupacaoTotalPct = +(posicoesOcupadasTotal / CAPACIDADE_TOTAL_CD * 100).toFixed(1);

  const pendentesAtual = comData.filter(r => r.stage === 'PENDENTE').length;

  const maxCompleteTime = comData.reduce((max, r) => (r.__date && (!max || r.__date > max)) ? r.__date : max, null);
  atual.att = maxCompleteTime
    ? `${String(maxCompleteTime.getUTCDate()).padStart(2,'0')}/${String(maxCompleteTime.getUTCMonth()+1).padStart(2,'0')} ${String(maxCompleteTime.getUTCHours()).padStart(2,'0')}:${String(maxCompleteTime.getUTCMinutes()).padStart(2,'0')}`
    : '—';

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
    complete_time: r['complete time'],
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
