/**
 * PULSO — agregação da base Clusterização (endereçamento de TOs em ruas do CD).
 *
 * Diferente do SPR/Leftover, essa página é "ao vivo": não tem filtro de
 * dia/semana/mês nem comparação vs período anterior (decidido com o Roberto
 * em 2026-07-30). Os filtros (To Pack, Destino, Rua) afetam TUDO — cards,
 * grade de ruas e a tabela de TOs (decidido com o Roberto em 2026-07-30,
 * revertendo o design anterior onde só a tabela era filtrada).
 *
 * IMPORTANTE (corrigido em 2026-08-04): a aba cluster_pulso NÃO tem mais as
 * colunas `rua`/`destino`/`stage`/`aging` que essa página assumia antes — o
 * export do sistema de origem mudou. As colunas reais hoje são `receiver`
 * (= destino) e `staging area` (código tipo "OBS-03CW", ou "-" quando o TO
 * ainda não tem posição física). O Roberto adicionou uma aba `config` com o
 * de-para código→rua (`staging area id`→`staging area name`) e a capacidade
 * real de cada rua (`capacity`) nas colunas H-J. Cada linha do cluster_pulso
 * é reconciliada nesse de-para pra reconstruir `destino`/`rua`/`stage`
 * (ENDEREÇADO = código bate com uma rua do de-para; PENDENTE = "-" ou código
 * não encontrado) antes de rodar a agregação de sempre. O roster de ruas
 * (antes fixo em 142+reservas hardcoded) agora vem inteiro da aba `config`,
 * na ordem em que aparece lá — inclui a RESERVA 37A automaticamente, sem
 * precisar hardcodar onde ela fica. Capacidade por rua também vem de lá
 * (antes era fixa em 20 pra todas).
 * `aging` não existe mais como coluna — recalculado aqui como horas desde
 * `create time` até agora (assunção; ajustar se o Roberto quiser outra base).
 *
 * `stage`=ENDEREÇADO = TO já ocupa 1 posição física na `rua` indicada;
 * `stage`=PENDENTE (`rua`="Pendente") = TO ainda sem rua física.
 *
 * `atual.att`: data/hora máxima de `complete time` no conjunto filtrado —
 * "última atualização" real do piso (a tabela de TOs também ordena por essa
 * coluna, não mais por create time).
 *
 * "to pack": para fins de filtro, "Saca Sorter" e "Saca" são tratados como
 * um único unitizador ("Saca") — ver `toPackGrupo()`. Nos cards, a mesma
 * junção vale pro card "Total de Sacas"; "Scuttle" tem card próprio;
 * "Volumoso"/"Pallet"/"-" entram só no total geral de pacotes.
 *
 * Classificação por transportadora (`destinoCategoria`, a partir do prefixo
 * de `destino`): SoC_ / XPT_ / "LM Hub_" / o resto = 3PL. Confirmado com o
 * Roberto em 2026-07-30: só SoC/XPT/LM Hub são efetivamente endereçados
 * (recebem rua); 3PL vai pra uma área própria que não é endereçada — por
 * isso o card "Pendentes" (pacotes de Saca/Scuttle ainda sem rua) EXCLUI
 * 3PL, senão infla o indicador com volume que nunca ia ganhar endereço.
 * Cada categoria (SoC/XPT/LM Hub/3PL) tem 2 cards: "<Categoria> Sacas" e
 * "<Categoria> Scuttle", cada um com a contagem de TOs entre parênteses
 * (não existe card separado de "TOs" — consolidado dentro do card de
 * pacotes, ver countKey/countSuffix em index.html).
 * Todo card de pacotes (Total de Pacotes/Sacas/Scuttles, Pendentes, os por
 * categoria) segue o mesmo padrão: quantidade de pacotes + (N TOs).
 *
 * `grade`: 1 item por rua do roster (config). Campos que o modelo visual
 * antigo tinha mas não existem em cluster_pulso (SPP posição, doca, próx.
 * CPT, timer CPT, cluster ideal) ficam de fora — decidido com o Roberto em
 * 2026-07-30, adicionar depois se a coluna surgir.
 *
 * Query params (afetam cards, grade e tabela):
 *   to_pack              lista separada por vírgula, valores agrupados (Saca/Scuttle/Volumoso/Pallet/-)
 *   destino, rua          listas separadas por vírgula
 *   q                     busca livre em "to number" + destino
 */
const { fetchTabByGid } = require('./_google');
const { toNum, parseCSV } = require('./_period');

const CLUSTER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '646168208' };
const CONFIG_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1408724077' };

const SACA_TIPOS = new Set(['Saca Sorter', 'Saca']);
const SCUTTLE_TIPOS = new Set(['Scuttle']);

// Agrupa "Saca Sorter"+"Saca" num único unitizador pra filtro/exibição.
function toPackGrupo(tp) {
  if (SACA_TIPOS.has(tp)) return 'Saca';
  if (SCUTTLE_TIPOS.has(tp)) return 'Scuttle';
  return tp || '-';
}

// SoC_ / XPT_ / "LM Hub_" identificam quem efetivamente recebe endereço de
// rua; qualquer outro prefixo (3PL, ex: "J&TNewLM") vai pra uma área que não
// é endereçada.
function destinoCategoria(destino) {
  const d = String(destino || '');
  if (/^SoC_/i.test(d)) return 'SoC';
  if (/^XPT_/i.test(d)) return 'XPT';
  if (/^LM Hub_/i.test(d)) return 'LM Hub';
  return '3PL';
}

function aggregate(rows) {
  const totalRegistros = rows.length;
  const pacotesTotal = rows.reduce((s, r) => s + toNum(r.quantity), 0);

  let pacotesSaca = 0, pacotesSacaTOs = 0, pacotesScuttle = 0, pacotesScuttleTOs = 0;
  const catVazia = () => ({ saca: 0, sacaTOs: 0, scuttle: 0, scuttleTOs: 0 });
  const porCategoria = { SoC: catVazia(), XPT: catVazia(), 'LM Hub': catVazia(), '3PL': catVazia() };
  let pendentesPacotes = 0, pendentesTOs = 0;

  rows.forEach(r => {
    const tp = r['to pack'];
    const q = toNum(r.quantity);
    const isSaca = SACA_TIPOS.has(tp);
    const isScuttle = SCUTTLE_TIPOS.has(tp);
    if (isSaca) { pacotesSaca += q; pacotesSacaTOs++; }
    else if (isScuttle) { pacotesScuttle += q; pacotesScuttleTOs++; }

    const cat = destinoCategoria(r.destino);
    if (isSaca) { porCategoria[cat].saca += q; porCategoria[cat].sacaTOs++; }
    else if (isScuttle) { porCategoria[cat].scuttle += q; porCategoria[cat].scuttleTOs++; }

    // Pendentes = Saca/Scuttle ainda sem rua, EXCETO 3PL (3PL nunca recebe
    // endereço — não faz sentido contar como "pendente de endereçar").
    if (r.stage === 'PENDENTE' && (isSaca || isScuttle) && cat !== '3PL') {
      pendentesPacotes += q;
      pendentesTOs++;
    }
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
    pacotesSacaTOs,
    pacotesScuttle,
    pacotesScuttleTOs,
    enderecados,
    agingMedio,
    pctAtendimento,
    pendentesPacotes,
    pendentesTOs,
    socSacas: porCategoria.SoC.saca,
    socSacaTOs: porCategoria.SoC.sacaTOs,
    socScuttle: porCategoria.SoC.scuttle,
    socScuttleTOs: porCategoria.SoC.scuttleTOs,
    xptSacas: porCategoria.XPT.saca,
    xptSacaTOs: porCategoria.XPT.sacaTOs,
    xptScuttle: porCategoria.XPT.scuttle,
    xptScuttleTOs: porCategoria.XPT.scuttleTOs,
    lmHubSacas: porCategoria['LM Hub'].saca,
    lmHubSacaTOs: porCategoria['LM Hub'].sacaTOs,
    lmHubScuttle: porCategoria['LM Hub'].scuttle,
    lmHubScuttleTOs: porCategoria['LM Hub'].scuttleTOs,
    pl3Sacas: porCategoria['3PL'].saca,
    pl3SacaTOs: porCategoria['3PL'].sacaTOs,
    pl3Scuttle: porCategoria['3PL'].scuttle,
    pl3ScuttleTOs: porCategoria['3PL'].scuttleTOs,
  };
}

module.exports = async (req, res) => {
  let rows, configRows;
  try {
    ({ rows } = await fetchTabByGid(CLUSTER_SHEET.spreadsheetId, CLUSTER_SHEET.gid));
    ({ rows: configRows } = await fetchTabByGid(CONFIG_SHEET.spreadsheetId, CONFIG_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  // De-para código→rua + capacidade real por rua, direto da aba `config`
  // (colunas H-J: staging area id / staging area name / capacity). O roster
  // de ruas segue a ORDEM DA PLANILHA — preserva onde a RESERVA 37A fica
  // fisicamente sem precisar hardcodar.
  const STAGING_DEPARA = new Map(); // staging area id -> { rua, capacidade }
  const RUA_ROSTER = [];
  const CAPACIDADE_POR_RUA = new Map(); // rua -> capacidade
  configRows.forEach(r => {
    const id = r['staging area id'];
    const rua = r['staging area name'];
    if (!id || !rua) return;
    const capacidade = toNum(r.capacity);
    STAGING_DEPARA.set(id, { rua, capacidade });
    RUA_ROSTER.push(rua);
    CAPACIDADE_POR_RUA.set(rua, capacidade);
  });
  const CAPACIDADE_TOTAL_CD = RUA_ROSTER.reduce((s, rua) => s + (CAPACIDADE_POR_RUA.get(rua) || 0), 0);

  // Reconstrói destino/rua/stage/aging a partir das colunas reais de hoje
  // (receiver, staging area, create time) + o de-para acima. Ordenação/"Att."
  // usam complete time (quando o TO foi de fato concluído), não create time.
  const agoraMs = Date.now();
  const comData = rows.map(r => {
    const codigo = r['staging area'];
    const depara = (codigo && codigo !== '-') ? STAGING_DEPARA.get(codigo) : null;
    const createMs = r['create time'] ? new Date(String(r['create time']).replace(' ', 'T') + 'Z').getTime() : null;
    return {
      ...r,
      destino: r.receiver,
      rua: depara ? depara.rua : 'Pendente',
      stage: depara ? 'ENDEREÇADO' : 'PENDENTE',
      aging: (createMs && !isNaN(createMs)) ? +((agoraMs - createMs) / 3600000).toFixed(1) : 0,
      __date: r['complete time'] ? new Date(String(r['complete time']).replace(' ', 'T') + 'Z') : null,
    };
  });

  // Opções de filtro sempre vêm da base inteira (não da já filtrada), senão
  // as opções somem conforme o usuário seleciona — padrão igual SPR/Leftover.
  const uniqDe = (base, key) => [...new Set(base.map(r => r[key]).filter(Boolean))].sort();

  // Filtros — agora afetam cards, grade e tabela (não só a tabela).
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

  const atual = aggregate(filtradas);

  // Cada posição do quadrado representa 1 slot físico. Sacos (Saca Sorter +
  // Saca) são pequenos e cabem vários por posição — 10 sacos = 1 posição
  // (confirmado com o Roberto em 2026-07-30). Os demais unitizadores
  // (Scuttle/Volumoso/Pallet/-) ocupam 1 posição cada.
  const SACOS_POR_POSICAO = 10;
  const porRua = new Map();
  filtradas.forEach(r => {
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
    const capacidade = CAPACIDADE_POR_RUA.get(rua) || 0;
    const acc = porRua.get(rua);
    if (!acc || (!acc.sacaTOs && !acc.outrosTOs)) {
      return { rua, ocupadas: 0, capacidade, pct: 0, saca: 0, scuttle: 0, pacotes: 0, agingMedio: null, fanout: null };
    }
    const posicoes = acc.outrosTOs + Math.ceil(acc.sacaTOs / SACOS_POR_POSICAO);
    let fanout = null, fanoutMax = 0;
    acc.destinos.forEach((n, destino) => { if (n > fanoutMax) { fanoutMax = n; fanout = destino; } });
    return {
      rua,
      ocupadas: posicoes,
      capacidade,
      pct: capacidade ? +(posicoes / capacidade * 100).toFixed(1) : 0,
      saca: acc.saca,
      scuttle: acc.scuttle,
      pacotes: acc.pacotes,
      agingMedio: +(acc.agingSoma / acc.agingCount).toFixed(1),
      fanout,
    };
  });
  const posicoesOcupadasTotal = grade.reduce((s, g) => s + g.ocupadas, 0);
  atual.posicoesOcupadas = posicoesOcupadasTotal;
  atual.ocupacaoTotalPct = CAPACIDADE_TOTAL_CD ? +(posicoesOcupadasTotal / CAPACIDADE_TOTAL_CD * 100).toFixed(1) : 0;

  const pendentesAtual = filtradas.filter(r => r.stage === 'PENDENTE').length;

  const maxCompleteTime = filtradas.reduce((max, r) => (r.__date && (!max || r.__date > max)) ? r.__date : max, null);
  atual.att = maxCompleteTime
    ? `${String(maxCompleteTime.getUTCDate()).padStart(2,'0')}/${String(maxCompleteTime.getUTCMonth()+1).padStart(2,'0')} ${String(maxCompleteTime.getUTCHours()).padStart(2,'0')}:${String(maxCompleteTime.getUTCMinutes()).padStart(2,'0')}`
    : '—';

  // Top destinos por volume no conjunto filtrado — pro Pipboy ("destino com
  // maior quantidade de volumes").
  const porDestino = new Map();
  filtradas.forEach(r => {
    if (!r.destino) return;
    porDestino.set(r.destino, (porDestino.get(r.destino) || 0) + toNum(r.quantity));
  });
  const topDestinos = [...porDestino.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([destino, pacotes]) => ({ destino, pacotes }));

  // Do mais antigo pro mais novo (pedido do Roberto em 2026-07-30) — a
  // paginação no front (100/página) faz a 1ª página ser o backlog mais velho.
  // Limite alto: manda o piso inteiro (a aba tem ~7-10 mil TOs, ~1-2MB de
  // JSON que a CDN comprime bem); o limite é só um teto de segurança.
  const ordenadas = [...filtradas].sort((a, b) => (a.__date || 0) - (b.__date || 0));
  const LIMITE = 20000;
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

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    atual,
    grade, capacidadeTotal: CAPACIDADE_TOTAL_CD, totalRuas: RUA_ROSTER.length, pendentesAtual, topDestinos,
    tos, tosTotal: filtradas.length,
    opcoesFiltro: {
      to_pack: [...new Set(comData.map(r => toPackGrupo(r['to pack'])).filter(Boolean))].sort(),
      destino: uniqDe(comData, 'destino'),
      rua: uniqDe(comData, 'rua').filter(r => r !== 'Pendente'),
    },
  });
};
