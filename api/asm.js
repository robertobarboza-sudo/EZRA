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

module.exports = async (req, res) => {
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
