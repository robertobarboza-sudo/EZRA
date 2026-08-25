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
const { fetchTabByGid, fetchTabRawValues, updateRangeRaw } = require('./_google');
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
function mapLaborRow(r) {
  const dataIso = brToIso(r.data);
  if (dataIso === null) return null;
  const hora = toNum(r.hora);
  const data = dataOperacionalDe(`${dataIso} ${String(hora).padStart(2, '0')}:00:00`);
  if (data === null) return null;
  return {
    data, dataBr: r.data, hora,
    asmTarget: toNum(r['asm target']),
    asmZonas: toNum(r['asm (zonas)']),
    esteiraTermo: toNum(r['esteira termo']),
    // Realizado de indução Esteira A/B (pedido do Roberto em 2026-08-25,
    // Labor Plan — item "ESTEIRA" da cascata de mão-de-obra) — colunas já
    // existem em labor_pulso, só não eram lidas até então (só o target já
    // tinha sido adicionado, ver Overview Conveyor).
    esteiraA: toNum(r['esteira a']), esteiraB: toNum(r['esteira b']),
    nv1: toNum(r['nv.1']), nv2: toNum(r['nv.2']), nv3: toNum(r['nv.3']),
    packingEsteira: toNum(r['packing esteira']),
    packingVolumoso: toNum(r['packing volumoso']),
    // Metas por hora de Esteira A/B/Termo (pedido do Roberto em
    // 2026-08-19, feature de Justificativas — item 8.1) — colunas já
    // existem em labor_pulso, só não eram lidas até então.
    targetEsteiraA: toNum(r['target esteira a']),
    targetEsteiraB: toNum(r['target esteira b']),
    targetTermo: toNum(r['target termo']),
    // Justificativa gravada direto em labor_pulso, colunas T:AA
    // (pedido do Roberto em 2026-08-19 — a aba própria JUSTIFICATIVAS_
    // INPUT da 1ª versão foi descartada, tudo mora aqui agora, reason +
    // gap lado a lado por área). Reason vazio = ainda não justificado.
    justReasonAsm: r['reason asm'] || '', justGapAsm: r['gap asm'] || '',
    justReasonEsteiraA: r['reason esteira a'] || '', justGapEsteiraA: r['gap esteira a'] || '',
    justReasonEsteiraB: r['reason esteira b'] || '', justGapEsteiraB: r['gap esteira b'] || '',
    justReasonTermo: r['reason termo'] || '', justGapTermo: r['gap termo'] || '',
  };
}
async function getLaborTodos() {
  const { rows } = await fetchTabByGid(LABOR_SHEET.spreadsheetId, LABOR_SHEET.gid);
  return rows.filter(r => r.data && r.hora !== '').map(mapLaborRow).filter(Boolean);
}
async function getLabor() {
  const labor = await getLaborTodos();
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
   hora×área vira uma PENDÊNCIA de justificativa.

   Gravado DIRETO em labor_pulso (pedido do Roberto em 2026-08-19,
   revisando a decisão inicial de usar uma aba própria) — colunas novas
   T em diante, reason+gap lado a lado por área:
     T=REASON ASM, U=GAP ASM, V=REASON ESTEIRA A, W=GAP ESTEIRA A,
     X=REASON ESTEIRA B, Y=GAP ESTEIRA B, Z=REASON TERMO, AA=GAP TERMO
   Sempre no fim da aba (nunca inserida no meio — colunas existentes são
   lidas por nome via cabeçalho, mas outras integrações podem depender da
   posição; inserir no meio deslocaria tudo depois). Escreve na LINHA já
   existente da planilha (Data+Hora já vêm pré-criados por quem mantém
   labor_pulso) via updateRangeRaw — só as 2 células daquele par
   reason/gap, nunca um clear+rewrite da aba inteira.

   Reason vazio = ainda não justificado (é a própria fonte de verdade do
   status, não precisa de coluna "Status" separada). Resubmissão
   sobrescreve reason/gap (mesma célula, não tem histórico de versão —
   ver CHANGELOG se algum dia precisar de append-only de verdade).
================================================================ */
const JUST_AREAS = ['ASM', 'Conveyor A', 'Conveyor B', 'Termo'];
// Ordem tem que bater com JUST_AREAS — cada entrada é [colunaReason, colunaGap], 1-based (T=20).
const JUST_COLS = { 'ASM': [20, 21], 'Conveyor A': [22, 23], 'Conveyor B': [24, 25], 'Termo': [26, 27] };
const JUST_HEADER_ROW = { 'ASM': ['REASON ASM', 'GAP ASM'], 'Conveyor A': ['REASON ESTEIRA A', 'GAP ESTEIRA A'], 'Conveyor B': ['REASON ESTEIRA B', 'GAP ESTEIRA B'], 'Termo': ['REASON TERMO', 'GAP TERMO'] };
function colLetter(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Taxonomia fixa de motivos (pedido do Roberto em 2026-08-19, "Justificativas
// de Perda de Capacidade") — Reason deixa de ser texto livre e vira um destes
// 5 valores, gravados na mesma célula REASON <área> de sempre (sem mudança de
// coluna/estrutura). "(Pendente)" não é um motivo de verdade, é o rótulo
// sintético usado nos agregados (porJustificativa/porMes) pra representar a
// perda que ainda não tem motivo registrado — sem ele o total perdido nas
// tabelas de "por justificativa" não bateria com o total real.
const JUST_MOTIVOS = ['Falta de HC', 'Equipamento', 'Falta de Material', 'Processo', 'Outros'];
const JUST_PENDENTE_LABEL = '(Pendente)';

// Semana ISO (segunda a domingo, mesma convenção usada em toda a
// planilha/telas do PULSO) e mês "YYYY-MM" a partir de uma data operacional
// (iso, "YYYY-MM-DD").
function isoWeekLabel(dataIso) {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7 + 1));
  const anoInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((d - anoInicio) / 86400000) + 1) / 7);
  return `W${String(semana).padStart(2, '0')}`;
}
function mesLabel(dataIso) { return dataIso.slice(0, 7); }

// Mesma classificação de grupo de esteira do Conveyor (api/conveyor.js
// classificarEsteira) — duplicada aqui (não exportada de lá) porque essa
// tela lê conveyor_pulso direto, sem passar pelo endpoint /api/conveyor
// (evita 1 fetch da aba inteira por dia do período, ver buildJustificativasHistorico).
// Se aquele mapeamento mudar, mudar aqui também.
function classificarEsteiraJust(esteira) {
  const e = String(esteira || '').toUpperCase();
  if (e === 'POBA' || e === 'POBB') return 'OBA/OBB';
  if (e === 'POBC' || e === 'POBD') return 'OBC/OBD';
  if (e === 'P4') return 'Termoplástica';
  if (e === 'P1') return 'Esteira A';
  if (e === 'P2') return 'Esteira B';
  if (e === 'PTIN') return 'Tintas';
  if (e === 'P_TO-AUDIT') return 'TO-Audit';
  return 'Non-TO';
}
const CONVEYOR_GRUPO_DA_AREA = { 'Conveyor A': 'Esteira A', 'Conveyor B': 'Esteira B', 'Termo': 'Termoplástica' };
const ASM_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1776828985' };
const CONVEYOR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1013894222' };

// Linha por (data, hora, área) pro histórico inteiro disponível em
// labor_pulso — meta de lá, realizado buscado direto em asm_pulso/
// conveyor_pulso (1 fetch de cada aba inteira, não 1 por dia — ver
// comentário de classificarEsteiraJust acima). "Perda" só existe quando
// Realizado < Meta (bateu ou superou a meta não é perda, mesmo que o gap
// apareça negativo/positivo pra referência). Hora futura (ainda não
// rodou) nunca entra — nem pro dia de hoje nem, por construção, pra
// datas futuras pré-criadas na planilha.
function justLinhasHistorico(laborRows, asmRawRows, conveyorRawRows) {
  const porHoraAsm = new Map(); // "cutoff|hora" -> scan_numbers
  (asmRawRows || []).forEach(r => {
    if (!r.cutoff) return;
    const chave = `${r.cutoff}|${toNum(r.actual_sort_time_hour)}`;
    porHoraAsm.set(chave, (porHoraAsm.get(chave) || 0) + toNum(r.scan_numbers));
  });

  const porHoraGrupo = new Map(); // "data|hora|grupo" -> pacotes
  (conveyorRawRows || []).forEach(r => {
    if (!r['data extração'] || r.hora === '') return;
    const hora = toNum(r.hora);
    const dataIso = dataOperacionalDe(`${String(r['data extração']).slice(0, 10)} ${String(hora).padStart(2, '0')}:00:00`);
    if (!dataIso) return;
    const grupo = classificarEsteiraJust(r.esteira);
    const chave = `${dataIso}|${hora}|${grupo}`;
    porHoraGrupo.set(chave, (porHoraGrupo.get(chave) || 0) + toNum(r.pacotes));
  });

  const hojeIso = hojeOperacionalIso();
  const horaAgora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const ordemHora = h => h >= 6 ? h - 6 : h + 18;
  const ordemAgora = ordemHora(horaAgora);

  const linhas = [];
  (laborRows || []).forEach(l => {
    if (l.data > hojeIso) return; // dia futuro, pré-criado na planilha — não rodou ainda
    if (l.data === hojeIso && ordemHora(l.hora) > ordemAgora) return; // hoje, hora futura
    const entradas = [
      { area: 'ASM', meta: l.asmTarget, realizado: porHoraAsm.get(`${l.data}|${l.hora}`) || 0, reason: l.justReasonAsm },
      { area: 'Conveyor A', meta: l.targetEsteiraA, realizado: porHoraGrupo.get(`${l.data}|${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Conveyor A']}`) || 0, reason: l.justReasonEsteiraA },
      { area: 'Conveyor B', meta: l.targetEsteiraB, realizado: porHoraGrupo.get(`${l.data}|${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Conveyor B']}`) || 0, reason: l.justReasonEsteiraB },
      { area: 'Termo', meta: l.targetTermo, realizado: porHoraGrupo.get(`${l.data}|${l.hora}|${CONVEYOR_GRUPO_DA_AREA['Termo']}`) || 0, reason: l.justReasonTermo },
    ];
    entradas.forEach(e => {
      if (!e.meta) return; // sem meta cadastrada pra essa hora/área — não dá pra avaliar
      const perda = Math.max(0, e.meta - e.realizado);
      linhas.push({
        data: l.data, dataBr: l.dataBr, semana: isoWeekLabel(l.data), mes: mesLabel(l.data),
        hora: l.hora, area: e.area,
        meta: e.meta, realizado: e.realizado, gap: e.realizado - e.meta, perda,
        pctAtendimento: e.meta ? Math.round(e.realizado / e.meta * 100) : null,
        reason: e.reason || '',
        status: perda > 0 ? (e.reason ? 'Justificada' : 'Pendente') : 'OK',
      });
    });
  });
  return linhas;
}

// Agrega uma lista de linhas (já filtrada) num resumo {perda, justificada,
// pendente, pctJustificada} — reutilizado pro resumo geral e por
// semana/mês (todas as tabelas do pedido usam a mesma conta).
function justResumo(linhas) {
  const perdidas = linhas.filter(l => l.perda > 0);
  const perdaTotal = perdidas.reduce((s, l) => s + l.perda, 0);
  const justificada = perdidas.filter(l => l.reason).reduce((s, l) => s + l.perda, 0);
  const pendente = perdaTotal - justificada;
  return {
    perdaTotal, justificada, pendente,
    pctJustificada: perdaTotal ? +(justificada / perdaTotal * 100).toFixed(1) : null,
  };
}
// Motivo (ou "(Pendente)") com maior perda dentro de uma lista de linhas.
function justPrincipal(linhas) {
  const porMotivo = new Map();
  linhas.filter(l => l.perda > 0).forEach(l => {
    const chave = l.reason || JUST_PENDENTE_LABEL;
    porMotivo.set(chave, (porMotivo.get(chave) || 0) + l.perda);
  });
  const top = [...porMotivo.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// Acha a linha física de labor_pulso (Data BR + Hora) e escreve reason+gap
// só nas 2 células daquele par de colunas (T:AA) — nunca mexe em mais
// nada da linha/aba. Escreve o cabeçalho da coluna na 1ª vez que aquele
// par é usado (idempotente — só escreve se ainda estiver vazio).
async function writeLaborJustificativa({ dataBr, hora, area, reason, gap }) {
  const [colReason, colGap] = JUST_COLS[area];
  const { title, values } = await fetchTabRawValues(LABOR_SHEET.spreadsheetId, LABOR_SHEET.gid);
  const header = values[0] || [];
  const idxData = header.indexOf('DATA'), idxHora = header.indexOf('HORA');
  if (idxData === -1 || idxHora === -1) throw new Error('Colunas DATA/HORA não encontradas em labor_pulso');

  const rowIndex = values.findIndex((row, i) => i > 0 && row[idxData] === dataBr && Number(row[idxHora]) === Number(hora));
  if (rowIndex === -1) throw new Error(`Linha não encontrada em labor_pulso pra ${dataBr} ${hora}h`);
  const sheetRow = rowIndex + 1; // values é 0-based, planilha é 1-based (values[0] = linha 1 = cabeçalho)

  // Cabeçalho das colunas novas (T1:AA1) — só escreve o par que falta,
  // não mexe nos outros 3 pares nem em nada anterior a T.
  if (String(header[colReason - 1] || '').trim() === '') {
    await updateRangeRaw(LABOR_SHEET.spreadsheetId, `'${title}'!${colLetter(colReason)}1:${colLetter(colGap)}1`, [JUST_HEADER_ROW[area]]);
  }

  await updateRangeRaw(LABOR_SHEET.spreadsheetId, `'${title}'!${colLetter(colReason)}${sheetRow}:${colLetter(colGap)}${sheetRow}`, [[reason, gap]]);
}

async function buildJustificativas(req, res) {
  if (req.method === 'POST' && req.query.write !== undefined) {
    const body = req.body || {};
    const { dataBr, hora, area, reason, gap } = body;
    if (!dataBr || hora === undefined || hora === null || !area || !JUST_COLS[area]) {
      res.status(400).json({ ok: false, erro: 'dataBr, hora e area (válida) são obrigatórios' });
      return;
    }
    try {
      await writeLaborJustificativa({ dataBr, hora, area, reason: reason || '', gap: gap ?? '' });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ ok: false, erro: err.message });
    }
    return;
  }

  try {
    const [laborTodos, { rows: asmRaw }, { rows: conveyorRaw }] = await Promise.all([
      getLaborTodos(),
      fetchTabByGid(ASM_SHEET.spreadsheetId, ASM_SHEET.gid),
      fetchTabByGid(CONVEYOR_SHEET.spreadsheetId, CONVEYOR_SHEET.gid),
    ]);

    const todasLinhas = justLinhasHistorico(laborTodos, asmRaw, conveyorRaw);
    const datasDisponiveis = [...new Set(laborTodos.map(l => l.data))].sort();
    const hojeIso = hojeOperacionalIso();

    // Sem de/ate: mês corrente até hoje (aba tem o ano inteiro pré-criado,
    // não dá pra "mostrar tudo" por padrão sem carregar meses futuros vazios).
    const inicioMesIso = hojeIso.slice(0, 8) + '01';
    const de = (req.query.de && /^\d{4}-\d{2}-\d{2}$/.test(req.query.de)) ? req.query.de : inicioMesIso;
    const ate = (req.query.ate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate)) ? req.query.ate : hojeIso;

    const canal = req.query.canal || '';
    const justificativa = req.query.justificativa || '';
    const semanaFiltro = req.query.semana || '';
    const mesFiltro = req.query.mes || '';
    const statusFiltro = req.query.status || '';

    const linhas = todasLinhas.filter(l =>
      l.data >= de && l.data <= ate &&
      (!canal || l.area === canal) &&
      (!semanaFiltro || l.semana === semanaFiltro) &&
      (!mesFiltro || l.mes === mesFiltro) &&
      (!statusFiltro || l.status === statusFiltro) &&
      (!justificativa || (justificativa === JUST_PENDENTE_LABEL ? !l.reason : l.reason === justificativa))
    );
    const perdidas = linhas.filter(l => l.perda > 0);

    // Por semana (item 2) — sempre no range filtrado, ordenado cronológico.
    const semanasNoRange = [...new Set(linhas.map(l => l.semana))].sort();
    const porSemana = semanasNoRange.map(semana => {
      const doGrupo = linhas.filter(l => l.semana === semana);
      const r = justResumo(doGrupo);
      return { semana, capacidadePerdida: r.perdaTotal, justificada: r.justificada, pendente: r.pendente, pctJustificada: r.pctJustificada, principalJustificativa: justPrincipal(doGrupo) };
    });

    // Por grupo de canal (pedido do Roberto em 2026-08-19, card novo do
    // Overview): ASM sozinho vs Conveyor (Esteira A+B+Termo somadas) — só
    // 2 grupos, não as 4 áreas soltas. "Perda" aqui já é em pacotes (mesma
    // unidade de scanNumbers/pacotes que alimenta meta/realizado), então
    // serve tanto pra "perda por canal" quanto "pacotes perdidos por canal".
    const GRUPO_DA_AREA = { 'ASM': 'ASM', 'Conveyor A': 'Conveyor', 'Conveyor B': 'Conveyor', 'Termo': 'Conveyor' };
    const porCanalGrupo = ['ASM', 'Conveyor'].map(grupo => {
      const doGrupo = linhas.filter(l => GRUPO_DA_AREA[l.area] === grupo);
      const r = justResumo(doGrupo);
      return { grupo, perda: r.perdaTotal, justificada: r.justificada, pendente: r.pendente, pctJustificada: r.pctJustificada };
    });

    // Por mês (item 3) — perda quebrada por motivo (colunas dinâmicas =
    // JUST_MOTIVOS + "(Pendente)"), pra montar a tabela mês x motivo.
    const mesesNoRange = [...new Set(linhas.map(l => l.mes))].sort();
    const porMes = mesesNoRange.map(mes => {
      const doGrupo = linhas.filter(l => l.mes === mes);
      const porMotivo = {};
      [...JUST_MOTIVOS, JUST_PENDENTE_LABEL].forEach(m => { porMotivo[m] = 0; });
      doGrupo.filter(l => l.perda > 0).forEach(l => { porMotivo[l.reason || JUST_PENDENTE_LABEL] += l.perda; });
      const total = Object.values(porMotivo).reduce((s, v) => s + v, 0);
      return { mes, porMotivo, total };
    });

    // Por justificativa (item 6) — volume, ocorrências, % do total, canal e
    // semana de maior impacto por motivo (incluindo "(Pendente)").
    const motivosNoRange = [...new Set(perdidas.map(l => l.reason || JUST_PENDENTE_LABEL))];
    const perdaTotalRange = perdidas.reduce((s, l) => s + l.perda, 0);
    const porJustificativa = motivosNoRange.map(motivo => {
      const doGrupo = perdidas.filter(l => (l.reason || JUST_PENDENTE_LABEL) === motivo);
      const perda = doGrupo.reduce((s, l) => s + l.perda, 0);
      const porCanal = new Map();
      doGrupo.forEach(l => porCanal.set(l.area, (porCanal.get(l.area) || 0) + l.perda));
      const canalTop = [...porCanal.entries()].sort((a, b) => b[1] - a[1])[0];
      const porSemanaMotivo = new Map();
      doGrupo.forEach(l => porSemanaMotivo.set(l.semana, (porSemanaMotivo.get(l.semana) || 0) + l.perda));
      const semanaTop = [...porSemanaMotivo.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        motivo, perda, ocorrencias: doGrupo.length,
        pctTotal: perdaTotalRange ? +(perda / perdaTotalRange * 100).toFixed(1) : 0,
        canalMaisImpactado: canalTop ? canalTop[0] : null,
        periodoMaiorImpacto: semanaTop ? semanaTop[0] : null,
      };
    }).sort((a, b) => b.perda - a.perda);

    // Tabela na granularidade selecionada (item 5: Hora/Dia/Semana).
    const granularidade = ['hora', 'dia', 'semana'].includes(req.query.granularidade) ? req.query.granularidade : 'dia';
    let tabela;
    if (granularidade === 'hora') {
      tabela = linhas.map(l => ({
        data: l.data, dataBr: l.dataBr, hora: l.hora, area: l.area, meta: l.meta, realizado: l.realizado,
        perda: l.perda, reason: l.reason, status: l.status,
      })).sort((a, b) => a.data === b.data ? a.hora - b.hora : a.data.localeCompare(b.data));
    } else if (granularidade === 'semana') {
      tabela = porSemana.map(s => ({
        chave: s.semana, planejado: null, realizado: null,
        perda: s.capacidadePerdida, pctPerda: null, justificativaPrincipal: s.principalJustificativa,
      }));
    } else {
      const diasNoRange = [...new Set(linhas.map(l => l.data))].sort();
      tabela = diasNoRange.map(data => {
        const doDia = linhas.filter(l => l.data === data);
        const planejado = doDia.reduce((s, l) => s + l.meta, 0);
        const realizado = doDia.reduce((s, l) => s + l.realizado, 0);
        const perda = doDia.reduce((s, l) => s + l.perda, 0);
        return {
          chave: data, planejado, realizado, perda,
          pctPerda: planejado ? +(perda / planejado * 100).toFixed(1) : 0,
          justificativaPrincipal: justPrincipal(doDia),
        };
      });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
    res.status(200).json({
      ok: true,
      atualizadoEm: new Date().toISOString(),
      intervalo: { inicio: de, fim: ate },
      cobertura: { inicio: datasDisponiveis[0] || null, fim: datasDisponiveis[datasDisponiveis.length - 1] || null },
      filtros: { canal, justificativa, semana: semanaFiltro, mes: mesFiltro, status: statusFiltro, granularidade },
      motivos: JUST_MOTIVOS,
      motivoPendenteLabel: JUST_PENDENTE_LABEL,
      areas: JUST_AREAS,
      resumo: justResumo(linhas),
      porSemana, porMes, porJustificativa, porCanalGrupo, tabela,
      // Compat com a versão anterior da tela (pendências "de hoje" + KPIs
      // simples) — Overview usa só `resumo`/`porJustificativa` agora, mas o
      // botão antigo ainda pode apontar aqui até o front terminar de migrar.
      pendencias: linhas.filter(l => l.data === hojeIso && l.status === 'Pendente').sort((a, b) => a.hora - b.hora),
    });
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
  }
}

/* ================================================================
   LABOR PLAN (?laborplan=1) — pedido do Roberto em 2026-08-25: página real
   de planejamento de mão de obra, inspirada num modelo em Excel que ele
   passou (macro-grupo > processo > necessidade de pessoas por hora).

   O modelo original do Excel é uma cascata de 3 estágios (forecast diário
   -> decaimento de backlog hora a hora com curva de chegada -> necessidade
   de mão de obra) — a curva de chegada horária e a escala real (headcount
   disponível) não existem em nenhuma aba do PULSO hoje (confirmado com o
   Roberto em 2026-08-25: ele vai subir as duas depois). Por isso a v1
   calcula a necessidade em cima do REALIZADO por hora, já disponível,
   cruzado com as premissas da aba `config` (colunas Q-AC, mesma aba que
   asm.js/cluster.js/outbound.js já leem pra outros fins) — sem projetar o
   futuro.

   Só processos "âncora" (PHD>0, mapeados em LABORPLAN_DEMANDA_DO_PROCESSO)
   e "posição fixa" (POSIÇÃO_FIXA=1, PHD=0) têm fórmula verificável contra
   os dados reais do modelo de referência do Roberto:
     âncora: necessidade(hora) = CEIL(demanda_hora / PHD) × POR_WS
     fixa:   necessidade(hora) = POR_WS constante
   Os demais processos (ATRELAMENTO aponta pra outro processo, ex.
   "GAIOLEIRO | SETUP TRIAGEM LH" -> "TRIADOR LH") têm uma proporção que não
   bate só com POR_WS e não está em nenhuma coluna do config — calcular
   errado seria pior que não calcular, então aparecem como referência
   (`calculavel:false`, `dependeDe`), sem número, até confirmar a razão real.
================================================================ */
const LABORPLAN_CONFIG_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1408724077' };

// processo (texto exato da coluna PROCESSO do config) -> chave de `demandas`
// em buildLaborPlan. Nível ASM duplicado de PHD_PROCESSO_PARA_NIVEL
// (api/asm.js) — não exportado de lá, mudar nos dois lugares se a planilha
// renomear os níveis.
const LABORPLAN_DEMANDA_DO_PROCESSO = {
  'INDUÇÕES NÍVEL 3': 'asmNivel3',
  'INDUÇÕES NÍVEL 2': 'asmNivel2',
  'INDUÇÕES NC': 'asmNivel1',
  'BEEP LH': 'lh',
  'TRIADOR LH': 'lh',
  'RECEBIMENTO FM': 'fm',
  'INDUÇÃO ESTEIRA': 'esteira',
  'INDUÇÃO TERMO': 'termo',
};
const MACROS_CONFIG_ALTERNATIVA = new Set(['1/2 ZONA ASM']);

async function buildLaborPlan(req, res) {
  const dataQuery = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : hojeOperacionalIso();
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;

  let configRows, asmResp, lhResp, fmResp, laborTodos;
  try {
    [configRows, asmResp, lhResp, fmResp, laborTodos] = await Promise.all([
      fetchTabByGid(LABORPLAN_CONFIG_SHEET.spreadsheetId, LABORPLAN_CONFIG_SHEET.gid).then(r => r.rows),
      getJson(base, `/api/asm?date=${dataQuery}`),
      getJson(base, `/api/inbound-lh?from=${dataQuery}&to=${dataQuery}`),
      getJson(base, `/api/inbound-fm?from=${dataQuery}&to=${dataQuery}`),
      getLaborTodos(),
    ]);
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const laborDoDia = laborTodos.filter(l => l.data === dataQuery);
  // Mesas reais só (exclui System Default, mesmo critério de capacidadePorHora em asm.js).
  const asmPorNivelHora = nivel => porHora((asmResp.rows || []).filter(r => r.nivel === nivel && !r.isSystemDefault), 'hora', r => r.scanNumbers);

  const demandas = {
    asmNivel3: asmPorNivelHora('Nível 3'),
    asmNivel2: asmPorNivelHora('Nível 2'),
    asmNivel1: asmPorNivelHora('Nível 1'),
    lh: porHora(lhResp.rows || [], 'horaDescarga', r => r.pacotes),
    fm: porHora(fmResp.rows || [], 'hora', r => r.pacotes),
    esteira: porHora(laborDoDia, 'hora', r => r.esteiraA + r.esteiraB),
    termo: porHora(laborDoDia, 'hora', r => r.esteiraTermo),
  };

  const macros = new Map();
  configRows.forEach(r => {
    const processo = (r.processo || '').trim();
    const macro = (r.macro || '').trim();
    if (!processo || !macro) return;
    // Config tem 1 linha por posto/estação — o mesmo PROCESSO repete várias
    // vezes (ex. um por staging area). Junta num único registro por
    // PROCESSO dentro do macro (mesmo agrupamento do modelo de referência).
    if (macros.has(macro) && macros.get(macro).some(p => p.processo === processo)) return;

    const phd = toNum(r.phd);
    const porWs = toNum(r['por ws']);
    const posicaoFixa = String(r['posição_fixa'] || '').trim() === '1';
    const atrelamento = (r.atrelamento || '').trim();
    const demandaKey = LABORPLAN_DEMANDA_DO_PROCESSO[processo];

    let calculavel = false, necessidadePorHora = null, necessidadeTotalDia = 0, dependeDe = null;
    // "1/2 ZONA ASM" é a config alternativa de meia-zona (mesmos PROCESSO de
    // ASM/ESTEIRA/TERMO duplicados com PHD diferente) — sem sinal nos dados
    // de qual config está ativa a cada momento, asm.js já assume sempre
    // zona cheia (ver THRESHOLD_MESA_ABERTA/getPhdPorNivel lá). Calcular os
    // dois em cima do MESMO realizado duplicaria a necessidade de pessoas
    // pro mesmo trabalho real — trava como não-calculável aqui também.
    if (MACROS_CONFIG_ALTERNATIVA.has(macro)) {
      dependeDe = 'Config alternativa (meia zona) — não ativa';
    } else if (demandaKey && phd > 0) {
      calculavel = true;
      necessidadePorHora = demandas[demandaKey].map(qtd => qtd > 0 ? Math.ceil(qtd / phd) * porWs : 0);
      necessidadeTotalDia = necessidadePorHora.reduce((s, v) => s + v, 0);
    } else if (posicaoFixa && phd === 0 && porWs > 0) {
      calculavel = true;
      necessidadePorHora = Array(24).fill(porWs);
      necessidadeTotalDia = porWs * 24;
    } else {
      dependeDe = atrelamento || null;
    }

    if (!macros.has(macro)) macros.set(macro, []);
    macros.get(macro).push({
      processo, phd, porWs, calculavel, necessidadePorHora, necessidadeTotalDia, dependeDe,
      descricao: r['descrição de processo'] || '',
    });
  });

  // Ordem de exibição do modelo de referência: 6h às 23h, depois 0h às 5h
  // (dia operacional, cutoff 6h).
  const HORAS_ORDEM = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
  const resultado = [...macros.entries()].map(([macro, processos]) => ({
    macro,
    processos: processos.map(p => ({ ...p, necessidadePorHora: p.necessidadePorHora && HORAS_ORDEM.map(h => p.necessidadePorHora[h]) })),
  }));

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({ ok: true, cutoff: dataQuery, horasOrdem: HORAS_ORDEM, macros: resultado });
}

module.exports = async (req, res) => {
  if (req.query.laborplan !== undefined) {
    await buildLaborPlan(req, res);
    return;
  }
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
      // Esteira A/B/Termo (colunas TARGET ESTEIRA A/B/TERMO de labor_pulso —
      // pedido do Roberto em 2026-08-25: a linha de "Capacidade planejada"
      // do Conveyor não trazia nada porque lia `esteiras`, um campo que não
      // existe na planilha (a coluna real é ESTEIRA A/ESTEIRA B separadas,
      // e essas são REALIZADO, não target). Mesmo padrão do capacidadeAgora
      // do ASM acima (nv1/nv2/nv3), agora com os 3 targets reais.
      capacidadeAgora: laborAgora ? { hora: laborAgora.hora, esteiraA: laborAgora.targetEsteiraA, esteiraB: laborAgora.targetEsteiraB, termo: laborAgora.targetTermo } : null,
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
