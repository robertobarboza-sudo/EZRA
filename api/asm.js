/**
 * PULSO — ASM: performance de induções hora a hora (aba asm_pulso).
 *
 * Cada linha = 1 operador em 1 mesa em 1 hora, com `scan_numbers` = total de
 * induções (scans) feitas. `colaborador` vazio -> usa `operator` como nome
 * de exibição (confirmado com o Roberto em 2026-07-31).
 *
 * "System Default" (confirmado com o Roberto em 2026-07-31): ~2% das linhas
 * do dia têm operator="system_default" — zona="T3" (ruído, scan_numbers
 * baixo) ou zona="Sem zona definida" (volume real, mas sem mesa/zona real
 * associada). Não são indução de colaborador real, então viram um card
 * próprio "System Default", separado dos blocos de zona (ZONA A/B/C).
 * Linhas com cutoff vazio (~64% da aba — sobra de linhas em branco no fim
 * da planilha, zona="T3" por ser o default do dropdown) são descartadas.
 *
 * Query params:
 *   date   YYYY-MM-DD (cutoff a visualizar; default = cutoff mais recente da base)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1776828985' };

// Capacidade por PHD (pedido do Roberto em 2026-08-19) — aba `config`
// (mesma que api/cluster.js já usa pra capacidade de rua), MACRO="ASM",
// coluna PHD por PROCESSO. Confirmado ao vivo em 2026-08-19: "INDUÇÕES
// NÍVEL 3"=1584, "INDUÇÕES NÍVEL 2"=1584, "INDUÇÕES NC"=650 — mapeado pro
// campo NÍVEL de asm_pulso, onde "NC" = "Nível 1". Existe uma 2ª config na
// mesma aba (MACRO="1/2 ZONA ASM", PHD 1700/1700/800) pra operação em meia
// zona — sem sinal nos dados de qual config está ativa a cada momento,
// então por enquanto sempre usa a config de zona cheia (ASM); trocar pra
// meia-zona é decisão manual, não automática.
const CONFIG_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1408724077' };
const PHD_PROCESSO_PARA_NIVEL = {
  'INDUÇÕES NÍVEL 3': 'Nível 3',
  'INDUÇÕES NÍVEL 2': 'Nível 2',
  'INDUÇÕES NC': 'Nível 1',
};
async function getPhdPorNivel() {
  const { rows } = await fetchTabByGid(CONFIG_SHEET.spreadsheetId, CONFIG_SHEET.gid);
  const phd = {};
  rows.forEach(r => {
    if (r.macro !== 'ASM') return;
    const nivel = PHD_PROCESSO_PARA_NIVEL[r.processo];
    if (nivel) phd[nivel] = toNum(r.phd);
  });
  return phd;
}

// Threshold de "mesa efetivamente aberta" (item 4.2 do pedido do Roberto
// em 2026-08-19): performance da mesa (scan_numbers da hora ÷ PHD do
// nível) precisa bater esse % pra contar como aberta — abaixo disso é
// atividade residual, não capacidade operacional real. Analisei os dados
// reais de asm_pulso (34.229 linhas, 5.572 combinações mesa×hora): ~49,6%
// têm scan_numbers=0 (fechada, sinal limpo); o resto sobe gradual de ~5%
// até 100%+ sem um corte natural óbvio. 25% é um ponto de partida
// conservador — não há UI de parametrização ainda (sem página de
// escrita), ajustar aqui se a operação achar que está sub/superestimando
// mesas abertas.
const THRESHOLD_MESA_ABERTA = 0.25;

// Sorting Exception (subaba nova dentro de ASM, pedido do Roberto em
// 2026-08-14) — rejeito da esteira por máquina/hora, fonte própria
// (wcs_sorting_exception_pulso), não a asm_pulso de cima. Sem coluna de
// data — a aba guarda só o dia operacional corrente (mesmo formato do
// mockup). Gid corrigido em 2026-08-24: o antigo (1109902999) não existe
// mais na planilha — a aba real hoje é "wcs_sorting_exception_pulso".
const REJEITO_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '334575654' };
// Colunas fixas da aba — tudo que sobrar num objeto de linha é motivo de
// rejeito (ver lista real em debug-meta; evita fixar os 35 nomes na mão,
// se a Shopee adicionar/remover algum motivo isso já acompanha sozinho).
const REJEITO_CAMPOS_FIXOS = new Set([
  'hora', 'turno', 'asm_account', 'asm_name', 'asm_category', 'layer',
  'parcel_count', 'success', 'success_rate', 'failed', 'failed_rate',
  'induction_quality', 'valid_infeed', 'invalid_infeed', 'cancelled_infeed',
  'normal_sort', 'ai_unpack_sort',
]);
// A aba traz os motivos em minúsculo ("no read", "chute full"...) mas as
// premissas de target por motivo (front, TARGETS_CATEGORIA_MOTIVO) usam
// Title Case ("No Read", "Chute Full") — Title-case aqui pra ser a MESMA
// string usada como chave em todo lugar (linha do rejeito, lista de
// `reasons`, target). Único caso especial: "ibb" -> "IBB" (sigla, não
// capitaliza por palavra como o resto).
function tituloMotivo(raw) {
  if (raw.trim().toLowerCase() === 'ibb') return 'IBB';
  return raw.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

async function buildRejeito(req, res) {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(REJEITO_SHEET.spreadsheetId, REJEITO_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const comHora = rows.filter(r => r.hora !== '' && r.hora != null && !isNaN(Number(r.hora)));
  const reasonsRaw = comHora.length
    ? Object.keys(comHora[0]).filter(k => !REJEITO_CAMPOS_FIXOS.has(k))
    : [];
  const reasons = reasonsRaw.map(tituloMotivo);

  const linhas = comHora.map(r => {
    const linha = {
      hora: Number(r.hora),
      turno: r.turno || '',
      asm_account: r.asm_account || '',
      asm_name: r.asm_name || '',
      asm_category: Number(r.asm_category) || 0,
      layer: Number(r.layer) || 1,
      parcel_count: toNum(r.parcel_count),
      success: toNum(r.success),
      success_rate: toNum(r.success_rate),
      failed: toNum(r.failed),
      failed_rate: toNum(r.failed_rate),
      induction_quality: toNum(r.induction_quality),
      valid_infeed: toNum(r.valid_infeed),
      invalid_infeed: toNum(r.invalid_infeed),
      cancelled_infeed: toNum(r.cancelled_infeed),
      normal_sort: toNum(r.normal_sort),
      ai_unpack_sort: toNum(r.ai_unpack_sort),
    };
    reasonsRaw.forEach((rawKey, i) => { linha[reasons[i]] = toNum(r[rawKey]); });
    return linha;
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
  res.status(200).json({ ok: true, rows: linhas, reasons, updatedAt: new Date().toISOString() });
}

// Monitoramento do Sorter — Mesas / Carrinhos Desabilitados / Chutes
// (pedido do Roberto em 2026-08-24, porte do painel operacional em
// Trilha Sup\ASM_24_08). Duas abas:
//   - asm_extra_pulso: 3 blocos de coluna colados lado a lado, SEM
//     relação linha a linha (mesmo padrão de forecast_backlog_pulso) —
//     esteira_* (não usado aqui, fora do escopo do painel), mesa_* e
//     carrinho_*. O bloco de mesa tem 66 linhas reais (24 Layer 1 + 21
//     Layer 2 + 21 Layer 3); o de carrinho tem só 3 linhas "resumo" (uma
//     por nível) + N linhas "disabled" (uma por carrinho parado); os dois
//     blocos preenchem o resto das linhas com o quadro em branco — por
//     isso filtramos por linha ter mesa_tag/carrinho_tipo, não por índice.
//   - Chutes_pulso: aba própria e limpa (765 linhas, 1 por chute), sem
//     esse problema de blocos colados.
const ASM_EXTRA_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1473280316' };
const CHUTES_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1852484551' };

async function buildSorter(req, res) {
  let extraRows, chuteRows;
  try {
    [{ rows: extraRows }, { rows: chuteRows }] = await Promise.all([
      fetchTabByGid(ASM_EXTRA_SHEET.spreadsheetId, ASM_EXTRA_SHEET.gid),
      fetchTabByGid(CHUTES_SHEET.spreadsheetId, CHUTES_SHEET.gid),
    ]);
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const mesas = extraRows
    .filter(r => r.mesa_tag)
    .map(r => ({
      mesa_label: r.mesa_label || '',
      mesa_id: toNum(r.mesa_id),
      mesa_tag: r.mesa_tag,
      mesa_zona: r.mesa_zona || '',
      mesa_status_name: r.mesa_status_name || '',
      mesa_status_color: r.mesa_status_color || '',
      mesa_since: toNum(r.mesa_since),
    }));

  const carrinhos = extraRows
    .filter(r => r.carrinho_tipo === 'resumo' || r.carrinho_tipo === 'disabled')
    .map(r => {
      if (r.carrinho_tipo === 'resumo') {
        let counts = {};
        try { counts = JSON.parse(r.carrinho_counts || '{}'); } catch (err) { /* linha mal formatada, cai pro resumo vazio */ }
        return { carrinho_tipo: 'resumo', carrinho_label: r.carrinho_label || '', carrinho_total: toNum(r.carrinho_total), carrinho_counts: counts };
      }
      return {
        carrinho_tipo: 'disabled',
        carrinho_label: r.carrinho_label || '',
        carrinho_numero: toNum(r.carrinho_numero),
        carrinho_id: toNum(r.carrinho_id),
        carrinho_label_id: toNum(r.carrinho_label_id),
        carrinho_car_fix_num: toNum(r.carrinho_car_fix_num),
        carrinho_status_name: r.carrinho_status_name || '',
        carrinho_status_color: r.carrinho_status_color || '',
        carrinho_since: toNum(r.carrinho_since),
      };
    });

  const chutes = chuteRows
    .filter(r => r.numero !== '' && r.numero != null)
    .map(r => ({
      layer: toNum(r.layer),
      numero: toNum(r.numero),
      zona: r.zona || '',
      status_name: r.status_name || '',
      status_color: r.status_color || '',
      since: toNum(r.since),
    }));

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=90');
  res.status(200).json({ ok: true, mesas, carrinhos, chutes, updatedAt: new Date().toISOString() });
}

module.exports = async (req, res) => {
  if (req.query.rejeito !== undefined) {
    await buildRejeito(req, res);
    return;
  }
  if (req.query.sorter !== undefined) {
    await buildSorter(req, res);
    return;
  }

  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }
  // Capacidade (PHD) é enriquecimento opcional — se a aba config falhar,
  // o ASM continua funcionando sem a linha de Capacidade no gráfico.
  let phdPorNivel = {};
  try { phdPorNivel = await getPhdPorNivel(); } catch (err) { /* ignora */ }

  const asm = rows.filter(r => r.cutoff);

  if (!asm.length) {
    res.status(200).json({
      ok: true, cutoff: null, rows: [], zonas: [],
      opcoes: { turnos: [], niveis: [], mesas: [] },
      capacidade: null,
      cobertura: { inicio: null, fim: null },
    });
    return;
  }

  const datasDisponiveis = [...new Set(asm.map(r => r.cutoff))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];

  const cutoffQuery = req.query.date;
  const cutoff = (cutoffQuery && datasDisponiveis.includes(cutoffQuery)) ? cutoffQuery : dataMaxima;

  const doDia = asm.filter(r => r.cutoff === cutoff);

  const linhas = doDia.map(r => {
    const isSystemDefault = r.operator === 'system_default';
    return {
      hora: toNum(r.actual_sort_time_hour),
      zona: isSystemDefault ? 'System Default' : (r.zona || ''),
      nivel: r['nível'] || '',
      mesa: r.mesa || '',
      operator: r.operator || '',
      colaborador: r.colaborador || r.operator || '',
      turno: r.turno || '',
      lider: r['líder'] || '',
      scanNumbers: toNum(r.scan_numbers),
      isSystemDefault,
    };
  });

  const zonasReais = [...new Set(linhas.filter(l => !l.isSystemDefault && l.zona).map(l => l.zona))].sort();

  // Capacidade horária (item 4.3 do pedido): Σ PHD das mesas efetivamente
  // abertas naquela hora (ver THRESHOLD_MESA_ABERTA acima), por nível e
  // consolidado. Mesa "aberta" = existiu naquela hora×nível com
  // performance (scan_numbers ÷ PHD do nível) ≥ threshold — não conta só
  // por ter linha na planilha (regra 4.2, evita atividade residual virar
  // capacidade).
  const capacidadePorHora = Array(24).fill(0);
  const realizadoPorHora = Array(24).fill(0);
  if (Object.keys(phdPorNivel).length) {
    // scan por (hora, nivel, mesa) — uma mesa pode ter mais de 1 operador
    // na mesma hora, soma tudo antes de comparar com o PHD.
    const porMesaHora = new Map();
    linhas.forEach(l => {
      if (l.isSystemDefault || !l.mesa || !l.nivel) return;
      const chave = `${l.hora}|${l.nivel}|${l.mesa}`;
      porMesaHora.set(chave, (porMesaHora.get(chave) || 0) + l.scanNumbers);
    });
    porMesaHora.forEach((scan, chave) => {
      const [horaStr, nivel] = chave.split('|');
      const hora = Number(horaStr);
      const phd = phdPorNivel[nivel];
      if (!phd || hora < 0 || hora > 23) return;
      if (scan / phd >= THRESHOLD_MESA_ABERTA) capacidadePorHora[hora] += phd;
    });
  }
  linhas.forEach(l => { if (l.hora >= 0 && l.hora <= 23) realizadoPorHora[l.hora] += l.scanNumbers; });
  // % Atendimento da Capacidade (item 4.4): Realizado ÷ Capacidade, só nas
  // horas com capacidade calculada (evita distorção de divisão por zero —
  // hora sem nenhuma mesa aberta não entra na média).
  const horasComCapacidade = capacidadePorHora.map((c, h) => ({ h, c })).filter(x => x.c > 0);
  const pctAtendimentoCapacidade = horasComCapacidade.length
    ? Math.round(horasComCapacidade.reduce((s, x) => s + realizadoPorHora[x.h], 0) / horasComCapacidade.reduce((s, x) => s + x.c, 0) * 100)
    : null;

  const opcoes = {
    turnos: [...new Set(linhas.map(l => l.turno).filter(Boolean))].sort(),
    niveis: [...new Set(linhas.map(l => l.nivel).filter(Boolean))].sort(),
    mesas: [...new Set(linhas.map(l => l.mesa).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    cutoff,
    rows: linhas,
    zonas: zonasReais,
    opcoes,
    capacidade: { porHora: capacidadePorHora, realizadoPorHora, pctAtendimento: pctAtendimentoCapacidade, thresholdMesaAberta: THRESHOLD_MESA_ABERTA },
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
