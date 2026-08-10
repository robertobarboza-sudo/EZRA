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
 * Roster limitado à RUA 142 (mapa físico, confirmado em 2026-08-04) — ruas
 * além disso existem na config mas ficam fora do roster/de-para.
 *
 * Correção de clusterização (`cluster`, coluna nova na config = destino
 * esperado por rua, confirmado em 2026-08-04): rua vazia OU cujo destino
 * dominante (fanout) bate o esperado = correta; rua ocupada com fanout
 * diferente = incorreta. `atual.ruasCorretas`/`ruasIncorretas`/
 * `pctClusterizacao` resumem isso; cada item de `grade` carrega
 * `clusterEsperado`/`clusterCorreto`.
 *
 * Colunas derivadas na tabela de TOs (confirmado com o Roberto em
 * 2026-08-04, `to pack`/`operator` originais nunca são alterados):
 *   origem:        Saca Sorter -> Sorter · Scuttle -> Esteira · resto vazio
 *   classificacao: operator=spx@shopee.com + to pack=Saca    -> ASM
 *                  operator=spx@shopee.com + to pack=Scuttle -> Transbordo
 *                  resto vazio
 *
 * Resíduo operacional: TO com quantity < 15 E aging > 15 dias (360h) some
 * de TUDO (cards/grade/tabela) — filtrado logo depois do de-para, antes de
 * qualquer agregação.
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
// Fonte dedicada da Esteira On-time (confirmado com o Roberto em 2026-08-10)
// — colunas: pack_name, dest_station_name, total_quantity, turno,
// data_ajustada, dest_corrigido. Usa dest_corrigido (não dest_station_name)
// pro fanout — é a coluna que já vem tratada/corrigida da origem.
const BALANCEAMENTO_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '960444672' };

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

// Aging médio ignorando outliers (pedido do Roberto em 2026-08-04): o
// resíduo operacional já é filtrado antes de chegar aqui (ver comData mais
// abaixo), mas ainda sobram TOs com aging muito acima do normal (parado
// há muito tempo sem bater o critério de resíduo) que puxam a média pra
// cima e escondem a "oportunidade" real. Cerca IQR (Q3 + 1.5×IQR) — método
// estatístico padrão pra outlier, não um corte arbitrário.
function agingMedioSemOutliers(rows) {
  const valores = rows.map(r => toNum(r.aging)).sort((a, b) => a - b);
  if (!valores.length) return 0;
  const q1 = valores[Math.floor(valores.length * 0.25)];
  const q3 = valores[Math.floor(valores.length * 0.75)];
  const cerca = q3 + (q3 - q1) * 1.5;
  const semOutliers = valores.filter(v => v <= cerca);
  const usar = semOutliers.length ? semOutliers : valores;
  return +(usar.reduce((s, v) => s + v, 0) / usar.length).toFixed(1);
}

// ── Esteira On-time (balanceamento de bancadas) ─────────────────────────
// Fonte: aba balanceamento_pulso (ver BALANCEAMENTO_SHEET), já pré-agregada
// por destino/dia — não a base de TOs do cluster_pulso. Alimenta a visão de
// esteiras SOC/HUB/Termo (mockup do Roberto, "esteira.html" — estrutura
// preservada 1:1, só a fonte dos dados mudou de um blob estático pra
// esse endpoint). Só pack_name "Scuttle"/"Pallet"/"Volumoso" entram no
// balanceamento (Saca/vazio ficam de fora — confirmado com o Roberto em
// 2026-08-10; ver filtro em module.exports antes de montar esteiraRows). Esteira SOC
// = destinos SoC; Esteira HUB = LM Hub + XPT + "Else" (3PL — mudou de SOC
// pra HUB em 2026-08-10, era a causa da divergência reportada); Esteira
// Termo reaproveita os mesmos bins do HUB (mesmos destinos/bancadas) até
// existir uma base própria — igual o mockup original já fazia.
//
// Balanceamento em 2 passos (confirmado pelo texto do mockup):
//   1. Partição gulosa entre Lado A/Lado B — o próximo maior destino
//      sempre vai pro lado com menor total acumulado, equilibrando os
//      lados por volume.
//   2. Dentro de cada lado, aloca aos 5 bancadas contra um perfil de
//      peso decrescente (bancada 1 > 2 > 3 > 4 > 5): pra cada destino
//      (do maior pro menor), escolhe a bancada com menor total/peso —
//      isso deixa a bancada 1 acumular mais antes das outras "pesarem
//      igual", concentrando volume nas primeiras posições como o
//      mockup pede. Pesos [5,4,3,2,1] — não há uma fórmula original
//      documentada, assumido pra reproduzir o perfil descrito.
const ESTEIRA_PESOS_BANCADA = [5, 4, 3, 2, 1];
function esteiraAlocarBancadas(destinosLado) {
  const bancadas = Array.from({ length: 5 }, () => ({ total: 0, destinos: [] }));
  destinosLado.forEach(d => {
    let melhor = 0, melhorScore = Infinity;
    for (let i = 0; i < 5; i++) {
      const score = bancadas[i].total / ESTEIRA_PESOS_BANCADA[i];
      if (score < melhorScore) { melhorScore = score; melhor = i; }
    }
    bancadas[melhor].total += d.qty;
    bancadas[melhor].destinos.push(d);
  });
  return bancadas;
}
function esteiraBuildBins(rows, categoriasIncluidas) {
  const porDestino = new Map();
  rows.forEach(r => {
    if (!r.destino || !categoriasIncluidas.includes(destinoCategoria(r.destino))) return;
    porDestino.set(r.destino, (porDestino.get(r.destino) || 0) + toNum(r.quantity));
  });
  const destinos = [...porDestino.entries()].map(([dest, qty]) => ({ dest, qty })).sort((a, b) => b.qty - a.qty);
  const total = destinos.reduce((s, d) => s + d.qty, 0);

  let totalA = 0, totalB = 0;
  const ladoA = [], ladoB = [];
  destinos.forEach(d => {
    if (totalA <= totalB) { ladoA.push(d); totalA += d.qty; }
    else { ladoB.push(d); totalB += d.qty; }
  });

  const bins = [];
  [['Lado A', ladoA], ['Lado B', ladoB]].forEach(([lado, destinosLado]) => {
    esteiraAlocarBancadas(destinosLado).forEach((b, i) => {
      bins.push({
        lado, posicao: i + 1, total: b.total,
        share: total ? b.total / total : 0,
        destinos: b.destinos.map(d => ({ dest: d.dest, qty: d.qty })),
      });
    });
  });
  return bins;
}
function buildEsteira(rows) {
  const porDestino = new Map();
  rows.forEach(r => {
    if (!r.destino) return;
    porDestino.set(r.destino, (porDestino.get(r.destino) || 0) + toNum(r.quantity));
  });
  const grandTotal = [...porDestino.values()].reduce((s, q) => s + q, 0);
  const part1 = [...porDestino.entries()]
    .map(([dest, qty]) => ({ dest, qty, share: grandTotal ? qty / grandTotal : 0 }))
    .sort((a, b) => b.qty - a.qty);

  const classifiedTotals = { SOC: 0, HUB: 0, XPT: 0, '3PL': 0 };
  rows.forEach(r => {
    if (!r.destino) return;
    const cat = destinoCategoria(r.destino);
    const key = cat === 'SoC' ? 'SOC' : cat === 'LM Hub' ? 'HUB' : cat === 'XPT' ? 'XPT' : '3PL';
    classifiedTotals[key] += toNum(r.quantity);
  });

  // Grupos confirmados com o Roberto em 2026-08-10: SoC -> Esteira SOC/B;
  // LM Hub + XPT -> Esteira HUB/A (e Termo, que reaproveita os mesmos bins);
  // "Else" (tudo que não é SoC/LM Hub/XPT, ou seja 3PL) -> Esteira HUB/A,
  // não SOC como estava antes (essa era a divergência do balanceamento).
  const socBins = esteiraBuildBins(rows, ['SoC']);
  const hubBins = esteiraBuildBins(rows, ['LM Hub', 'XPT', '3PL']);
  return { part1, classified_totals: classifiedTotals, soc_bins: socBins, hub_bins: hubBins };
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
  const agingMedio = agingMedioSemOutliers(rows);
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
  // fisicamente sem precisar hardcodar. O mapa físico vai só até a RUA 142
  // (confirmado com o Roberto em 2026-08-04) — a config já tem ruas além
  // disso (até 169), mas ficam fora do roster/de-para: TOs endereçados nelas
  // caem como PENDENTE, já que essas posições não fazem parte do mapa hoje.
  const STAGING_DEPARA = new Map(); // staging area id -> { rua, capacidade }
  const RUA_ROSTER = [];
  const CAPACIDADE_POR_RUA = new Map(); // rua -> capacidade
  const CLUSTER_ESPERADO = new Map(); // rua -> destino esperado (coluna "Cluster" da config)
  configRows.forEach(r => {
    const id = r['staging area id'];
    const rua = r['staging area name'];
    if (!id || !rua) return;
    const numRua = (rua.match(/^RUA (\d+)$/) || [])[1];
    const dentroDoMapa = numRua ? Number(numRua) <= 142 : /^RESERVA/i.test(rua);
    if (!dentroDoMapa) return;
    const capacidade = toNum(r.capacity);
    STAGING_DEPARA.set(id, { rua, capacidade });
    RUA_ROSTER.push(rua);
    CAPACIDADE_POR_RUA.set(rua, capacidade);
    if (r.cluster) CLUSTER_ESPERADO.set(rua, r.cluster);
  });
  const CAPACIDADE_TOTAL_CD = RUA_ROSTER.reduce((s, rua) => s + (CAPACIDADE_POR_RUA.get(rua) || 0), 0);

  // Reconstrói destino/rua/stage/aging a partir das colunas reais de hoje
  // (receiver, staging area, create time) + o de-para acima. Ordenação/"Att."
  // usam complete time (quando o TO foi de fato concluído), não create time.
  //
  // origem/classificacao (colunas derivadas, confirmado com o Roberto em
  // 2026-08-04) — não alteram `to pack`/`operator` originais, só preenchem
  // campos novos:
  //   origem:         Saca Sorter -> Sorter · Scuttle -> Esteira · resto vazio
  //   classificacao:  operator=spx@shopee.com + Saca    -> ASM
  //                   operator=spx@shopee.com + Scuttle -> Transbordo
  //                   resto vazio
  const agoraMs = Date.now();
  // `create time`/`complete time` vêm em horário de Brasília (mesma
  // convenção de todo o PULSO pros timestamps crus da planilha — ver
  // dataOperacionalDe em api/_period.js), não UTC. Interpretar a string
  // direto como UTC (só anexando 'Z') deixa o instante 3h "no passado" do
  // que realmente é, inflando o aging em +3h sistematicamente pra TODO TO —
  // bug real, confirmado ao vivo em 2026-08-05 (TO criado há 7min aparecia
  // com 3,1h de aging) e reportado pelo Roberto como "aging divergente".
  // Corrige somando de volta o offset de Brasília (+3h) depois do parse.
  const BR_PARA_UTC_MS = 3 * 60 * 60 * 1000;
  const parseLocalBr = v => {
    if (!v) return null;
    const ms = new Date(String(v).replace(' ', 'T') + 'Z').getTime();
    return isNaN(ms) ? null : ms + BR_PARA_UTC_MS;
  };
  const origemDe = toPack => {
    if (toPack === 'Saca Sorter') return 'Sorter';
    if (toPack === 'Scuttle') return 'Esteira';
    return '';
  };
  const classificacaoDe = (operator, toPack) => {
    if (operator !== 'spx@shopee.com') return '';
    if (toPack === 'Saca') return 'ASM';
    if (toPack === 'Scuttle') return 'Transbordo';
    return '';
  };
  const comDataBruta = rows.map(r => {
    const codigo = r['staging area'];
    const depara = (codigo && codigo !== '-') ? STAGING_DEPARA.get(codigo) : null;
    // Só o aging faz aritmética contra Date.now() (precisa do epoch UTC
    // real, por isso passa por parseLocalBr) — __date só é usado pra
    // ordenar/formatar (maxCompleteTime.getUTCHours() em "atual.att" conta
    // com o truque padrão do PULSO de ler os dígitos crus via getters UTC),
    // então continua com o parse "ingênuo" (dígitos crus = wall-clock BR).
    const createMs = parseLocalBr(r['create time']);
    return {
      ...r,
      destino: r.receiver,
      rua: depara ? depara.rua : 'Pendente',
      stage: depara ? 'ENDEREÇADO' : 'PENDENTE',
      aging: (createMs !== null) ? +((agoraMs - createMs) / 3600000).toFixed(1) : 0,
      origem: origemDe(r['to pack']),
      classificacao: classificacaoDe(r.operator, r['to pack']),
      __date: r['complete time'] ? new Date(String(r['complete time']).replace(' ', 'T') + 'Z') : null,
    };
  });

  // Resíduo operacional (confirmado com o Roberto em 2026-08-04): quantidade
  // < 15 E aging > 15 dias (360h) somadas — não aparece em NADA da página
  // (cards, grade, tabela), por isso o filtro roda antes de qualquer
  // agregação, não só na tabela final.
  const RESIDUO_QTD_MAX = 15;
  const RESIDUO_AGING_HORAS_MIN = 15 * 24;
  const comData = comDataBruta.filter(r => !(toNum(r.quantity) < RESIDUO_QTD_MAX && r.aging > RESIDUO_AGING_HORAS_MIN));

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

  // Correção de clusterização (confirmado com o Roberto em 2026-08-04): rua
  // vazia OU com o destino dominante (fanout) batendo o cluster esperado
  // (coluna "Cluster" da config) = correta. Rua ocupada com fanout diferente
  // do esperado = incorreta. Rua ocupada sem cluster esperado definido na
  // config (ainda não configurado) não tem regra pra violar — conta como
  // correta, mesmo tratamento de "vazia" (assunção, ajustar se necessário).
  const grade = RUA_ROSTER.map(rua => {
    const capacidade = CAPACIDADE_POR_RUA.get(rua) || 0;
    const clusterEsperado = CLUSTER_ESPERADO.get(rua) || null;
    const acc = porRua.get(rua);
    if (!acc || (!acc.sacaTOs && !acc.outrosTOs)) {
      return { rua, ocupadas: 0, capacidade, pct: 0, saca: 0, scuttle: 0, pacotes: 0, agingMedio: null, fanout: null, clusterEsperado, clusterCorreto: true };
    }
    const posicoes = acc.outrosTOs + Math.ceil(acc.sacaTOs / SACOS_POR_POSICAO);
    let fanout = null, fanoutMax = 0;
    acc.destinos.forEach((n, destino) => { if (n > fanoutMax) { fanoutMax = n; fanout = destino; } });
    const clusterCorreto = !clusterEsperado || fanout === clusterEsperado;
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
      clusterEsperado,
      clusterCorreto,
    };
  });
  const posicoesOcupadasTotal = grade.reduce((s, g) => s + g.ocupadas, 0);
  atual.posicoesOcupadas = posicoesOcupadasTotal;
  atual.ocupacaoTotalPct = CAPACIDADE_TOTAL_CD ? +(posicoesOcupadasTotal / CAPACIDADE_TOTAL_CD * 100).toFixed(1) : 0;

  atual.ruasCorretas = grade.filter(g => g.clusterCorreto).length;
  atual.ruasIncorretas = grade.filter(g => !g.clusterCorreto).length;
  atual.pctClusterizacao = grade.length ? +(atual.ruasCorretas / grade.length * 100).toFixed(1) : 0;

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
    origem: r.origem,
    classificacao: r.classificacao,
    quantity: toNum(r.quantity),
    aging: toNum(r.aging),
    stage: r.stage,
    rua: r.rua,
    complete_time: r['complete time'],
  }));

  // esteira: só busca/computa quando pedido explicitamente (?esteira=1) — a
  // página de Clusterização normal não usa esse bloco, não faz sentido pagar
  // o custo (fetch extra + payload) em todo load dela. Fonte própria
  // (balanceamento_pulso), não cluster_pulso — ver BALANCEAMENTO_SHEET.
  let esteira = null;
  if (req.query.esteira !== undefined) {
    try {
      const { rows: balRows } = await fetchTabByGid(BALANCEAMENTO_SHEET.spreadsheetId, BALANCEAMENTO_SHEET.gid);
      const datasDisponiveis = [...new Set(balRows.map(r => r.data_ajustada).filter(Boolean))].sort();
      const dataRef = datasDisponiveis[datasDisponiveis.length - 1] || null;
      const doDia = dataRef ? balRows.filter(r => r.data_ajustada === dataRef) : balRows;
      // Só Scuttle/Pallet entram no balanceamento das esteiras — Saca/
      // Volumoso não passam por essas bancadas (confirmado com o Roberto
      // em 2026-08-10).
      // Fanout do balanceamento = total_quantity de dest_corrigido dividido
      // pelo total de pack_name Scuttle/Pallet/Volumoso (corrigido com o
      // Roberto em 2026-08-10 — Volumoso também entra, só Saca fica de fora).
      let doDiaBalanceaveis = doDia.filter(r => r.pack_name === 'Scuttle' || r.pack_name === 'Pallet' || r.pack_name === 'Volumoso');
      // Filtro opcional de turno (balanceamento_pulso tem coluna `turno`) —
      // pedido do Roberto em 2026-08-10, botões T1/T2/T3 na Esteira On-time.
      const turnos = parseCSV(req.query.turno);
      if (turnos.length) doDiaBalanceaveis = doDiaBalanceaveis.filter(r => turnos.includes(r.turno));
      const esteiraRows = doDiaBalanceaveis.map(r => ({ destino: r.dest_corrigido, quantity: toNum(r.total_quantity) }));
      esteira = buildEsteira(esteiraRows);
      esteira.dataRef = dataRef;
    } catch (err) {
      esteira = { erro: err.message };
    }
  }

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
    esteira,
  });
};
