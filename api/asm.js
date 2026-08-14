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

// Sorting Exception (subaba nova dentro de ASM, pedido do Roberto em
// 2026-08-14) — rejeito da esteira por máquina/hora, fonte própria
// (sorting_exception_pulso), não a asm_pulso de cima. Sem coluna de data —
// a aba guarda só o dia operacional corrente (mesmo formato do mockup).
const REJEITO_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1109902999' };
// Colunas fixas da aba — tudo que sobrar num objeto de linha é motivo de
// rejeito (ver lista real em debug-meta; evita fixar os 35 nomes na mão,
// se a Shopee adicionar/remover algum motivo isso já acompanha sozinho).
const REJEITO_CAMPOS_FIXOS = new Set([
  'hora', 'turno', 'asm_account', 'asm_name', 'asm_category', 'layer',
  'parcel_count', 'success', 'success_rate', 'failed', 'failed_rate',
  'induction_quality', 'valid_infeed', 'invalid_infeed', 'cancelled_infeed',
  'normal_sort', 'ai_unpack_sort',
]);

async function buildRejeito(req, res) {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(REJEITO_SHEET.spreadsheetId, REJEITO_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const comHora = rows.filter(r => r.hora !== '' && r.hora != null && !isNaN(Number(r.hora)));
  const reasons = comHora.length
    ? Object.keys(comHora[0]).filter(k => !REJEITO_CAMPOS_FIXOS.has(k))
    : [];

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
    reasons.forEach(mo => { linha[mo] = toNum(r[mo]); });
    return linha;
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
  res.status(200).json({ ok: true, rows: linhas, reasons, updatedAt: new Date().toISOString() });
}

module.exports = async (req, res) => {
  if (req.query.rejeito !== undefined) {
    await buildRejeito(req, res);
    return;
  }

  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const asm = rows.filter(r => r.cutoff);

  if (!asm.length) {
    res.status(200).json({
      ok: true, cutoff: null, rows: [], zonas: [],
      opcoes: { turnos: [], niveis: [], mesas: [] },
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
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
