/**
 * PULSO — Overview: retrato acumulado da operação, juntando os números já
 * calculados pelas outras páginas. Blocos, nessa ordem (confirmado com o
 * Roberto em 2026-08-04):
 *   1. Backlog: atual (média/hora) + grupos de perfil + clusters de aging
 *      (mesmos grupos da página Backlog — ver PERFIL_GRUPOS/
 *      AGING_CLUSTER_OF abaixo, têm que ficar em sincronia com o mesmo
 *      mapeamento em index.html)
 *   2. Inbound Line Haul: previstos/descarregados/andamento + quebra por
 *      canal (origem, classificada por prefixo — ver canalDeOrigemLh)
 *   3. Inbound First Mile: descarregados/andamento + quebra por canal
 *      (agência, já é um campo pequeno e direto na base)
 *   4. ASM: realizado (scans) vs planejado até agora (labor_pulso asm
 *      target) + quebra por zona real, média de zonas/mesas ativas por
 *      hora, pico e média de indução por hora
 *   5. Conveyor: realizado (pedidos) vs planejado até agora (labor_pulso
 *      packing esteira+volumoso) + quebra por grupo de estação (OBC/OBD já
 *      soma os dois códigos — ver classificarEsteira em api/conveyor.js),
 *      pico e média por hora
 *   6. Outbound: carros carregados vs planejados, saca/scuttle separados
 *      (com TOs de cada), quebra por canal (destino, por prefixo), % de
 *      Clusterização e pacotes no piso (= pacotesTotal da Clusterização,
 *      o staging onde os TOs ficam endereçados aguardando expedição — por
 *      isso entra no bloco Outbound, como primeiro card do bloco)
 *
 * Cada bloco com dado por hora real (todos exceto Backlog/Outbound, que
 * usam campos derivados — ver porHora/horaDeTs) também devolve uma
 * `serieHoraria` (24 posições, 0-23) pro gráfico planejado x realizado do
 * front, escondido por padrão num accordion abaixo do bloco.
 *
 * Em vez de duplicar a lógica de negócio de cada página (residuo, correção
 * de clusterização, etc.), esse endpoint chama as próprias APIs irmãs via
 * HTTP interno (mesmo deployment) e só agrega os números que elas já
 * calculam — Outbound/Clusterização/ASM/Conveyor/Inbound LH/FM/Backlog já
 * resolvem sozinhos "hoje operacional" (cutoff 6h, ver api/_period.js),
 * então aqui não passamos nenhum filtro de data, só lemos o default de cada
 * uma. Cada chamada é isolada em try/catch — a queda de uma fonte não
 * derruba o Overview inteiro, só zera aquele bloco (`erros` sinaliza qual).
 */
const { fetchTabByGid, readRange, writeRange, ensureSheetExists } = require('./_google');
const { toNum, dataOperacionalDe, hojeOperacionalIso } = require('./_period');
const { buildArvore, writeArvoreValores, freezeArvoreAll } = require('./_arvore');

// Planejamento de capacidade (labor_pulso) — inline em vez de um endpoint
// próprio (api/labor.js): Overview é o único consumidor hoje, e o limite de
// 12 funções serverless do plano Hobby da Vercel não sobra pra um endpoint
// dedicado só pra isso (confirmado com o Roberto em 2026-08-04, erro real
// de deploy). Se um dia existir uma página Labor Plan de verdade, separar
// de novo faz sentido — até lá, menos um function slot gasto.
const LABOR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1065816747' };
function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
async function getLabor() {
  const { rows } = await fetchTabByGid(LABOR_SHEET.spreadsheetId, LABOR_SHEET.gid);
  const labor = rows
    .filter(r => r.data && r.hora !== '')
    .map(r => {
      const dataIso = brToIso(r.data);
      if (dataIso === null) return null;
      const hora = toNum(r.hora);
      const data = dataOperacionalDe(`${dataIso} ${String(hora).padStart(2, '0')}:00:00`);
      return {
        data, hora,
        asmTarget: toNum(r['asm target']),
        asmZonas: toNum(r['asm (zonas)']),
        esteiraTermo: toNum(r['esteira termo']),
        esteiras: toNum(r.esteiras),
        nv1: toNum(r['nv.1']), nv2: toNum(r['nv.2']), nv3: toNum(r['nv.3']),
        packingEsteira: toNum(r['packing esteira']),
        packingVolumoso: toNum(r['packing volumoso']),
        // Metas por hora de Esteira A/B/Termo (pedido do Roberto em
        // 2026-08-19, feature de Justificativas — item 8.1) — colunas já
        // existem em labor_pulso, só não eram lidas até então.
        targetEsteiraA: toNum(r['target esteira a']),
        targetEsteiraB: toNum(r['target esteira b']),
        targetTermo: toNum(r['target termo']),
      };
    })
    .filter(Boolean);
  if (!labor.length) return { rows: [] };
  const datasDisponiveis = [...new Set(labor.map(r => r.data))].sort();
  const hojeIso = hojeOperacionalIso();
  const dataRef = datasDisponiveis.includes(hojeIso) ? hojeIso : datasDisponiveis[datasDisponiveis.length - 1];
  return { rows: labor.filter(r => r.data === dataRef).sort((a, b) => a.hora - b.hora) };
}

const PERFIL_GRUPOS = [
  { label: 'P', match: p => p === 'P' },
  { label: 'M', match: p => p === 'M' },
  { label: 'G', match: p => p === 'G' },
  { label: 'Bulky + Ração + S/Class', match: p => p === 'BULKY' || p === 'RAÇÃO' || p === 'S/CLASS' },
  { label: 'Tinta + Líquido', match: p => p === 'TINTA' || p === 'LIQUIDO' },
];
const AGING_CLUSTER_OF = { '0-1h': '0-4h', '1-2h': '0-4h', '2-4h': '0-4h', '4-8h': '4-24h', '8-24h': '4-24h', '>24h': '>24h' };
const AGING_CLUSTERS = ['0-4h', '4-24h', '>24h'];

// Canais por prefixo (mesmo padrão de destinoCategoria em api/cluster.js,
// aplicado às bases que ainda não tinham essa quebra) — confirmado ao vivo
// via debug-meta em 2026-08-04.
function canalDeDestinoOutbound(destino) {
  const d = String(destino || '').toUpperCase();
  if (d.startsWith('SOC-')) return 'SOC';
  if (d.startsWith('HUB-')) return 'LM Hub';
  if (d.startsWith('XPT-')) return 'XPT';
  if (d.startsWith('FMH-')) return 'FMH';
  return 'Outros';
}
const OUTBOUND_CANAIS = ['SOC', 'LM Hub', 'XPT', 'FMH', 'Outros'];

function canalDeOrigemLh(origem) {
  const o = String(origem || '');
  if (/^SoC_/i.test(o)) return 'SOC';
  if (/^FM Hub_/i.test(o)) return 'FM Hub';
  if (/^FBS_/i.test(o)) return 'FBS';
  return 'Outros';
}
const LH_CANAIS = ['SOC', 'FM Hub', 'FBS', 'Outros'];

const ASM_ZONAS_REAIS = ['ZONA A', 'ZONA B', 'ZONA C'];
const ASM_NIVEIS = ['Nível 1', 'Nível 2', 'Nível 3'];
const CNV_GRUPOS = ['OBA/OBB', 'OBC/OBD', 'Termoplástica', 'Esteira A', 'Esteira B', 'Tintas', 'TO-Audit', 'Non-TO'];

// Extrai a hora de um timestamp cru "YYYY-MM-DD HH:MM:SS" (usado nos
// cpt_planejado/cpt_realizado crus do Outbound) — mesmo padrão de horaDe()
// em api/inbound-lh.js, evita ambiguidade de fuso do parse via Date.
function horaDeTs(v) {
  const m = String(v || '').match(/(\d{2}):\d{2}:\d{2}/);
  return m ? Number(m[1]) : null;
}

// Soma valorFn(linha) em 24 posições (0-23) pela hora de cada linha
// (horaField pode ser o nome do campo ou uma função extratora).
function porHora(rows, horaField, valorFn) {
  const arr = Array.from({ length: 24 }, () => 0);
  rows.forEach(r => {
    const h = typeof horaField === 'function' ? horaField(r) : r[horaField];
    if (h === null || h === undefined || h < 0 || h > 23) return;
    arr[h] += valorFn ? valorFn(r) : 1;
  });
  return arr;
}

async function getJson(base, path) {
  const r = await fetch(base + path, { headers: { 'x-overview-internal': '1' } });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro || (path + ' respondeu erro'));
  return j;
}

/* ================================================================
   JUSTIFICATIVAS (?justificativas=1) — pedido do Roberto em 2026-08-19,
   itens 8-12. Quando ASM ou uma das 3 áreas do Conveyor (Esteira A,
   Esteira B, Termo) fecham uma hora abaixo da meta de labor_pulso, essa
   hora×área vira uma PENDÊNCIA de justificativa; preencher grava um
   snapshot histórico permanente (nunca sobrescreve meta/realizado/gap
   de um snapshot já existente — só status/reason/responsável mudam numa
   resubmissão).

   Guardado em aba própria (JUSTIFICATIVAS_INPUT, criada sob demanda) —
   não em labor_pulso (que é a fonte de META mantida pelo time de
   planejamento; misturar leitura de meta com escrita de justificativa na
   mesma aba arrisca colisão/corrupção do que o time já mantém à mão).
   Mesmo padrão de escrita do Monitor-Live (api/outbound.js): sem gid
   fixo ainda (aba nova, ninguém vai renomear por fora), leitura por nome
   com ensureSheetExists no primeiro uso.

   ponytail: read-modify-write da aba inteira a cada gravação (sem lock,
   sem append incremental — mesma limitação já documentada no
   Monitor-Live). Escala bem pra o volume de "horas fora da meta por dia"
   (baixa dezena), reavaliar se crescer muito.
================================================================ */
const JUST_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4' };
const JUST_TAB_NAME = 'JUSTIFICATIVAS_INPUT';
const JUST_HEADER = [
  'data', 'hora', 'area', 'tipo_operacao', 'meta', 'realizado', 'gap',
  'pct_atendimento', 'status', 'reason', 'responsavel', 'preenchido_em',
];
const JUST_AREAS = ['ASM', 'Conveyor A', 'Conveyor B', 'Termo'];

async function justRange() {
  return `'${JUST_TAB_NAME}'!A:${String.fromCharCode(64 + JUST_HEADER.length)}`;
}
function justLinhaParaRegistro(r) {
  const o = {};
  JUST_HEADER.forEach((campo, i) => { o[campo] = r[i] != null ? r[i] : ''; });
  return o;
}
function justRegistroParaLinha(o) {
  return JUST_HEADER.map(campo => o[campo] != null ? o[campo] : '');
}
async function readJust() {
  let values;
  try {
    values = await readRange(JUST_SHEET.spreadsheetId, await justRange());
  } catch (err) {
    return [];
  }
  return values.slice(1).map(justLinhaParaRegistro).filter(r => r.data && r.hora !== '' && r.area);
}
async function writeJust(registros) {
  await ensureSheetExists(JUST_SHEET.spreadsheetId, JUST_TAB_NAME);
  const values = [JUST_HEADER, ...registros.map(justRegistroParaLinha)];
  await writeRange(JUST_SHEET.spreadsheetId, await justRange(), values);
}
const chaveJust = r => `${r.data}|${r.hora}|${r.area}`;

// Horas por área x hora, comparando Realizado (ASM/Conveyor, já buscados
// pelo fan-out principal) com Meta (labor_pulso) — só até a hora atual do
// dia operacional (mesma lógica de "já passou" usada pro planejado até
// agora do ASM/Conveyor no resto do Overview, ver horaAgora/ordemHora
// acima). Hora futura não pode "exigir justificativa" — ainda não rodou.
function justHorasApuradas(labor, asmRows, conveyorRows, ordemHora, ordemAgora) {
  const porHoraAsm = new Map();
  (asmRows || []).forEach(r => porHoraAsm.set(r.hora, (porHoraAsm.get(r.hora) || 0) + r.scanNumbers));
  const porHoraGrupo = new Map(); // "hora|grupo" -> total
  (conveyorRows || []).forEach(r => {
    const chave = `${r.hora}|${r.grupo}`;
    porHoraGrupo.set(chave, (porHoraGrupo.get(chave) || 0) + r.totalProcessamento);
  });

  const CONVEYOR_GRUPO_DA_AREA = { 'Conveyor A': 'Esteira A', 'Conveyor B': 'Esteira B', 'Termo': 'Termoplástica' };

  const linhas = [];
  (labor || []).forEach(l => {
    if (ordemHora(l.hora) > ordemAgora) return; // hora ainda não rodou
    const entradas = [
      { area: 'ASM', meta: l.asmTarget, realizado: porHoraAsm.get(l.hora) || 0 },
      { area: 'Conveyor A', meta: l.targetEsteiraA, realizado: porHoraGrupo.get(`${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Conveyor A']}`) || 0 },
      { area: 'Conveyor B', meta: l.targetEsteiraB, realizado: porHoraGrupo.get(`${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Conveyor B']}`) || 0 },
      { area: 'Termo', meta: l.targetTermo, realizado: porHoraGrupo.get(`${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Termo']}`) || 0 },
    ];
    entradas.forEach(e => {
      if (!e.meta) return; // sem meta cadastrada pra essa hora/área — não dá pra avaliar
      linhas.push({
        data: l.data, hora: l.hora, area: e.area,
        meta: e.meta, realizado: e.realizado, gap: e.realizado - e.meta,
        pctAtendimento: e.meta ? Math.round(e.realizado / e.meta * 100) : null,
        exigeJustificativa: e.realizado < e.meta,
      });
    });
  });
  return linhas;
}

async function buildJustificativas(req, res) {
  if (req.method === 'POST' && req.query.write !== undefined) {
    const body = req.body || {};
    const { data, hora, area, reason, responsavel } = body;
    if (!data || hora === undefined || hora === null || !area) {
      res.status(400).json({ ok: false, erro: 'data, hora e area são obrigatórios' });
      return;
    }
    try {
      const atuais = await readJust();
      const chave = `${data}|${hora}|${area}`;
      const existente = atuais.find(r => chaveJust(r) === chave);
      // Meta/realizado/gap/pct só são gravados na CRIAÇÃO do snapshot (vêm
      // do corpo, ecoados da lista de pendências que o front já mostrou pro
      // usuário) — uma resubmissão (corrigir o reason, por exemplo) nunca
      // reescreve esses números, só status/reason/responsável/timestamp.
      // Regra 13.10 do pedido: não sobrescrever snapshot de hora encerrada.
      const atualizado = {
        data, hora: String(hora), area,
        tipo_operacao: body.tipoOperacao || (existente ? existente.tipo_operacao : ''),
        meta: existente ? existente.meta : String(body.meta ?? ''),
        realizado: existente ? existente.realizado : String(body.realizado ?? ''),
        gap: existente ? existente.gap : String(body.gap ?? ''),
        pct_atendimento: existente ? existente.pct_atendimento : String(body.pctAtendimento ?? ''),
        status: reason ? 'Justificado' : (body.status || 'Pendente'),
        reason: reason || (existente ? existente.reason : ''),
        responsavel: responsavel || (existente ? existente.responsavel : ''),
        preenchido_em: new Date().toISOString(),
      };
      const semEssaChave = atuais.filter(r => chaveJust(r) !== chave);
      await writeJust([...semEssaChave, atualizado]);
      res.status(200).json({ ok: true, registro: atualizado });
    } catch (err) {
      res.status(502).json({ ok: false, erro: err.message });
    }
    return;
  }

  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers.host}`;
    const [labor, asm, conveyor, historico] = await Promise.all([
      getLabor(),
      getJson(base, '/api/asm').catch(() => ({ rows: [] })),
      getJson(base, '/api/conveyor').catch(() => ({ rows: [] })),
      readJust(),
    ]);

    const horaAgora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
    const ordemHora = h => h >= 6 ? h - 6 : h + 18;
    const ordemAgora = ordemHora(horaAgora);

    const apuradas = justHorasApuradas(labor.rows, asm.rows, conveyor.rows, ordemHora, ordemAgora);
    const porChave = new Map(historico.map(r => [chaveJust(r), r]));

    const linhas = apuradas.map(l => {
      const salvo = porChave.get(`${l.data}|${l.hora}|${l.area}`);
      return {
        ...l,
        status: salvo ? salvo.status : (l.exigeJustificativa ? 'Pendente' : 'OK'),
        reason: salvo ? salvo.reason : '',
        responsavel: salvo ? salvo.responsavel : '',
        preenchidoEm: salvo ? salvo.preenchido_em : null,
      };
    });

    const exigem = linhas.filter(l => l.exigeJustificativa);
    const justificadas = exigem.filter(l => l.status === 'Justificado');
    const pendentes = exigem.filter(l => l.status !== 'Justificado');

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
    res.status(200).json({
      ok: true,
      atualizadoEm: new Date().toISOString(),
      data: labor.rows[0] ? labor.rows[0].data : null,
      indicadores: {
        pctAderencia: exigem.length ? Math.round(justificadas.length / exigem.length * 100) : null,
        horasPendentes: pendentes.length,
        areasPendentes: [...new Set(pendentes.map(l => l.area))].sort(),
      },
      areas: JUST_AREAS,
      pendencias: pendentes.sort((a, b) => a.hora - b.hora),
      historicoRecente: historico.sort((a, b) => (b.preenchido_em || '').localeCompare(a.preenchido_em || '')).slice(0, 100),
    });
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
  }
}

module.exports = async (req, res) => {
  if (req.query.justificativas !== undefined) {
    await buildJustificativas(req, res);
    return;
  }
  // Árvore de KPI's (?arvore=1) — fonte própria (árvore_pulso), nada a ver
  // com o fan-out do Overview abaixo, então curto-circuita antes dele. Mora
  // aqui e não num endpoint próprio por causa do teto de 12 funções do plano
  // Hobby da Vercel (ver api/_arvore.js).
  // Preenchimento manual (?arvore=1&write=1, POST) — usado pelo botão
  // "Preencher dados" da Árvore de KPI's (arvore.html). Curto-circuita
  // antes do GET normal; ver writeArvoreValores em api/_arvore.js pra
  // regra de sobrescrever/manter/"-" por célula.
  // "Copiar e colar como valor" no lugar (?arvore=1&freeze=1, POST) —
  // congela o resultado atual do IMPORTRANGE em valor fixo, leitura +
  // escrita únicas cobrindo a aba inteira (não em chunks — ver o porquê
  // em freezeArvoreAll, api/_arvore.js). Uso único/administrativo, pedido
  // do Roberto em 2026-08-17.
  if (req.query.arvore !== undefined && req.query.freeze !== undefined) {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, erro: 'Use POST' });
      return;
    }
    try {
      const resultado = await freezeArvoreAll();
      res.status(200).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(502).json({ ok: false, erro: err.message });
    }
    return;
  }
  if (req.query.arvore !== undefined && req.query.write !== undefined) {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, erro: 'Use POST' });
      return;
    }
    try {
      const entries = (req.body || {}).entries;
      if (!Array.isArray(entries) || !entries.length) {
        res.status(400).json({ ok: false, erro: 'entries obrigatório' });
        return;
      }
      const resultado = await writeArvoreValores(entries);
      res.status(200).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(502).json({ ok: false, erro: err.message });
    }
    return;
  }
  if (req.query.arvore !== undefined) {
    try {
      const dados = await buildArvore();
      // ?_fresh=... (arvore.html manda isso logo após "Preencher dados"
      // salvar e recarregar a página) pula o cache do CDN — sem isso o
      // reload caía dentro da janela de 5min e mostrava o valor antigo,
      // parecendo que o preenchimento não tinha funcionado (achado pelo
      // Roberto em 2026-08-17).
      if (req.query._fresh !== undefined) {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      }
      res.status(200).json({ ok: true, ...dados });
    } catch (err) {
      res.status(502).json({ ok: false, erro: err.message });
    }
    return;
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;
  const erros = {};
  const safe = async (nome, fn) => {
    try { return await fn(); } catch (err) { erros[nome] = err.message; return null; }
  };

  const [outbound, cluster, lh, fm, backlog, asm, conveyor, labor] = await Promise.all([
    safe('outbound', () => getJson(base, '/api/outbound')),
    safe('cluster', () => getJson(base, '/api/cluster')),
    safe('inboundLh', () => getJson(base, '/api/inbound-lh')),
    safe('inboundFm', () => getJson(base, '/api/inbound-fm')),
    safe('backlog', () => getJson(base, '/api/backlog')),
    safe('asm', () => getJson(base, '/api/asm')),
    safe('conveyor', () => getJson(base, '/api/conveyor')),
    safe('labor', () => getLabor()),
  ]);

  // 1. Backlog — média por hora (mesma lógica de bklQtdMedia em index.html:
  // soma ÷ horas do dia, nunca soma crua, senão infla contando a mesma
  // fila várias vezes), quebrado por grupo de perfil e por cluster de aging.
  let backlogResumo = null;
  if (backlog) {
    const horasBkl = backlog.opcoes.horas.length || 1;
    const media = rows => Math.round(rows.reduce((s, r) => s + r.qtdPacotes, 0) / horasBkl);
    backlogResumo = {
      total: media(backlog.rows),
      perfis: PERFIL_GRUPOS.map(pg => ({ label: pg.label, qtd: media(backlog.rows.filter(r => pg.match(r.perfil))) })),
      clusters: AGING_CLUSTERS.map(c => ({ label: c, qtd: media(backlog.rows.filter(r => AGING_CLUSTER_OF[r.faixaAging] === c)) })),
      serieHoraria: { realizado: porHora(backlog.rows, 'hora', r => r.qtdPacotes) },
    };
  }

  // 2. Inbound Line Haul — previstos vs descarregados (fim_descarga
  // preenchido) + em andamento + quebra por canal (origem).
  const lhRows = lh ? lh.rows : [];
  // Avg. Waiting Time LH (pedido do Roberto em 2026-08-19, KPI novo do
  // Overview) — média geral de tempoFilaMin (mesmo campo que já alimenta
  // tempoFilaMedioMin por canal logo abaixo, só sem quebrar por canal).
  const lhComFila = lhRows.filter(r => r.tempoFilaMin !== null);
  const lineHaul = lh ? {
    previstos: lhRows.length,
    descarregados: lhRows.filter(r => r.fimDescarga).length,
    andamento: lhRows.filter(r => r.checkinDestino && !r.fimDescarga).length,
    tempoFilaMedioMin: lhComFila.length ? Math.round(lhComFila.reduce((s, r) => s + r.tempoFilaMin, 0) / lhComFila.length) : null,
    porCanal: LH_CANAIS.map(canal => {
      const rows = lhRows.filter(r => canalDeOrigemLh(r.origem) === canal);
      const comFila = rows.filter(r => r.tempoFilaMin !== null);
      return {
        label: canal,
        carros: rows.length,
        pacotes: rows.reduce((s, r) => s + r.pacotes, 0),
        tempoFilaMedioMin: comFila.length ? Math.round(comFila.reduce((s, r) => s + r.tempoFilaMin, 0) / comFila.length) : null,
      };
    }).filter(c => c.carros > 0),
    serieHoraria: {
      previstos: porHora(lhRows, 'horaPlanejada', () => 1),
      realizado: porHora(lhRows.filter(r => r.fimDescarga), 'horaCheckin', () => 1),
    },
  } : null;

  // 3. Inbound First Mile — descarregados (finalização de jornada
  // preenchida) + em andamento + quebra por canal (agência).
  const fmRows = fm ? fm.rows : [];
  const fmAgencias = [...new Set(fmRows.map(r => r.agencia).filter(Boolean))].sort();
  // Avg. Waiting Time FM (pedido do Roberto em 2026-08-19) — mesma ideia do LH acima.
  const fmComFila = fmRows.filter(r => r.tempoFilaMin !== null);
  const firstMile = fm ? {
    descarregados: fmRows.filter(r => r.finalizacaoJornada).length,
    andamento: fmRows.filter(r => r.checkinDriver && !r.finalizacaoJornada).length,
    tempoFilaMedioMin: fmComFila.length ? Math.round(fmComFila.reduce((s, r) => s + r.tempoFilaMin, 0) / fmComFila.length) : null,
    porCanal: fmAgencias.map(canal => {
      const rows = fmRows.filter(r => r.agencia === canal);
      const comFila = rows.filter(r => r.tempoFilaMin !== null);
      return {
        label: canal,
        carros: rows.length,
        pacotes: rows.reduce((s, r) => s + r.pacotes, 0),
        tempoFilaMedioMin: comFila.length ? Math.round(comFila.reduce((s, r) => s + r.tempoFilaMin, 0) / comFila.length) : null,
      };
    }),
    serieHoraria: { realizado: porHora(fmRows, 'hora', () => 1) },
  } : null;

  // ASM e Conveyor — realizado no dia (soma bruta, são contadores de volume,
  // não uma leitura pontual) vs planejado ATÉ AGORA (soma do labor_pulso só
  // das horas que já passaram — comparar contra o planejado do dia inteiro
  // sempre pareceria "atrasado" de manhã, mesmo no ritmo certo). Horário de
  // Brasília fixo (UTC-3, mesma conta de hojeOperacionalIso em _period.js).
  //
  // "Já passou" tem que respeitar a ordem do dia operacional (corte às 6h,
  // vira a meia-noite) — não a ordem do relógio de 0-23h. Bug corrigido em
  // 2026-08-14: comparando `r.hora <= horaAgora` cru, de madrugada (ex.
  // horaAgora=0, ainda dentro do dia operacional que começou às 6h do dia
  // anterior) `laborAteAgora` só pegava a hora 0 (18h de planejado "perdidas"
  // do meio pro fim do dia), enquanto o realizado somava o dia inteiro —
  // pctAtingimento inflava pra milhares de %. Mesma ordenação de
  // asmHourOrder() em index.html (hora>=6 ? hora-6 : hora+18).
  const horaAgora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const ordemHora = h => h >= 6 ? h - 6 : h + 18;
  const ordemAgora = ordemHora(horaAgora);
  const laborAteAgora = labor ? labor.rows.filter(r => ordemHora(r.hora) <= ordemAgora) : [];
  const laborAgora = labor && labor.rows.length
    ? (labor.rows.find(r => r.hora === horaAgora) || [...labor.rows].sort((a, b) => Math.abs(a.hora - horaAgora) - Math.abs(b.hora - horaAgora))[0])
    : null;

  // 4. ASM — realizado por zona real (exclui System Default), média de
  // zonas/mesas-por-nível ativas por hora (só conta quem teve indução>0
  // naquela hora), pico e média de indução por hora.
  const asmRowsReais = asm ? asm.rows.filter(r => !r.isSystemDefault) : [];
  const asmHoras = asm ? [...new Set(asm.rows.map(r => r.hora))].sort((a, b) => a - b) : [];
  const asmRealizado = asm ? asm.rows.reduce((s, r) => s + r.scanNumbers, 0) : null;
  const asmPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.asmTarget, 0)) : null;
  let asmResumo = null;
  if (asm || labor) {
    const porHoraTotal = asmHoras.map(h => ({ hora: h, total: asm.rows.filter(r => r.hora === h).reduce((s, r) => s + r.scanNumbers, 0) }));
    const pico = porHoraTotal.length ? porHoraTotal.reduce((best, c) => c.total > best.total ? c : best) : null;
    asmResumo = {
      realizado: asmRealizado,
      planejado: asmPlanejado,
      pctAtingimento: asmPlanejado ? Math.round((asmRealizado ?? 0) / asmPlanejado * 100) : null,
      porZona: ASM_ZONAS_REAIS.map(zona => ({ label: zona, realizado: asmRowsReais.filter(r => r.zona === zona).reduce((s, r) => s + r.scanNumbers, 0) })),
      mediaZonasAtivas: asmHoras.length ? +(asmHoras.reduce((s, h) => s + new Set(asmRowsReais.filter(r => r.hora === h && r.scanNumbers > 0).map(r => r.zona)).size, 0) / asmHoras.length).toFixed(1) : null,
      mediaMesasPorNivel: ASM_NIVEIS.map(nivel => {
        const porHoraMesas = asmHoras.map(h => new Set(asmRowsReais.filter(r => r.hora === h && r.nivel === nivel && r.scanNumbers > 0).map(r => r.mesa)).size);
        return { label: nivel, mediaMesas: porHoraMesas.length ? +(porHoraMesas.reduce((s, v) => s + v, 0) / porHoraMesas.length).toFixed(1) : 0 };
      }),
      picoInducao: pico,
      mediaInducaoPorHora: asmHoras.length ? Math.round((asmRealizado ?? 0) / asmHoras.length) : null,
      capacidadeAgora: laborAgora ? { hora: laborAgora.hora, nv1: laborAgora.nv1, nv2: laborAgora.nv2, nv3: laborAgora.nv3, zonas: laborAgora.asmZonas } : null,
      serieHoraria: { planejado: labor ? porHora(labor.rows, 'hora', r => r.asmTarget) : null, realizado: asm ? porHora(asm.rows, 'hora', r => r.scanNumbers) : null },
    };
  }

  // 5. Conveyor — realizado por grupo de estação (OBC/OBD já vem somado da
  // própria classificação em api/conveyor.js), pico e média por hora.
  const cnvRows = conveyor ? conveyor.rows : [];
  const cnvHoras = conveyor ? [...new Set(cnvRows.map(r => r.hora))].sort((a, b) => a - b) : [];
  const conveyorRealizado = conveyor ? cnvRows.reduce((s, r) => s + r.totalProcessamento, 0) : null;
  const conveyorPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.packingEsteira + r.packingVolumoso, 0)) : null;
  let conveyorResumo = null;
  if (conveyor || labor) {
    const porHoraTotal = cnvHoras.map(h => ({ hora: h, total: cnvRows.filter(r => r.hora === h).reduce((s, r) => s + r.totalProcessamento, 0) }));
    const pico = porHoraTotal.length ? porHoraTotal.reduce((best, c) => c.total > best.total ? c : best) : null;
    conveyorResumo = {
      realizado: conveyorRealizado,
      planejado: conveyorPlanejado,
      pctAtingimento: conveyorPlanejado ? Math.round((conveyorRealizado ?? 0) / conveyorPlanejado * 100) : null,
      porGrupo: CNV_GRUPOS.map(g => ({ label: g, realizado: cnvRows.filter(r => r.grupo === g).reduce((s, r) => s + r.totalProcessamento, 0) })).filter(g => g.realizado > 0),
      picoProcessamento: pico,
      mediaProcessamentoPorHora: cnvHoras.length ? Math.round((conveyorRealizado ?? 0) / cnvHoras.length) : null,
      capacidadeAgora: laborAgora ? { hora: laborAgora.hora, esteiras: laborAgora.esteiras, esteiraTermo: laborAgora.esteiraTermo } : null,
      serieHoraria: { planejado: labor ? porHora(labor.rows, 'hora', r => r.packingEsteira + r.packingVolumoso) : null, realizado: conveyor ? porHora(cnvRows, 'hora', r => r.totalProcessamento) : null },
    };
  }

  // 6. Outbound — carros carregados vs planejados, saca/scuttle separados
  // (com TOs de cada), quebra por canal (destino), % de Clusterização e
  // pacotes no piso (piso = staging outbound, onde os TOs endereçados
  // aguardam expedição — por isso entram aqui em vez de um bloco à parte,
  // como primeiro card do bloco).
  const outboundCarros = outbound ? outbound.carros : [];
  const outboundResumo = (outbound || cluster) ? {
    pctClusterizacao: cluster ? cluster.atual.pctClusterizacao : null,
    pacotesNoPiso: cluster ? cluster.atual.pacotesTotal : null,
    // CPT On Time (pedido do Roberto em 2026-08-19, KPI novo do Overview) —
    // reaproveita o cálculo já pronto em api/_outbound.js aggregate()
    // (cpt_realizado <= cpt_scheduled_origin_edited, sem margem), não
    // reinventa a regra.
    pctCptOnTime: outbound ? outbound.atual.pctCptOnTime : null,
    carrosPrevistos: outbound ? outbound.atual.carrosPrevistos : null,
    carrosRealizados: outbound ? outbound.atual.carrosRealizados : null,
    saca: outbound ? { pacotes: outbound.atual.pacotesSaca, tos: outbound.atual.qtySaca } : null,
    scuttle: outbound ? { pacotes: outbound.atual.pacotesScuttle, tos: outbound.atual.qtyScuttle } : null,
    porCanal: OUTBOUND_CANAIS.map(canal => {
      const rows = outboundCarros.filter(r => canalDeDestinoOutbound(r.destino) === canal);
      return {
        label: canal,
        pacotes: rows.reduce((s, r) => s + r.orders_saca + r.orders_scuttle, 0),
        tos: rows.reduce((s, r) => s + r.to_saca + r.to_scuttle, 0),
      };
    }).filter(c => c.pacotes > 0 || c.tos > 0),
    serieHoraria: outbound ? {
      previstos: porHora(outboundCarros, r => horaDeTs(r.cpt_planejado), () => 1),
      realizado: porHora(outboundCarros.filter(r => r.cpt_realizado), r => horaDeTs(r.cpt_realizado), () => 1),
    } : null,
  } : null;

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    backlog: backlogResumo,
    lineHaul, firstMile,
    asm: asmResumo, conveyor: conveyorResumo,
    outbound: outboundResumo,
    erros: Object.keys(erros).length ? erros : null,
  });
};
