/**
 * PULSO — Conveyor: performance por grupo de estação, hora a hora (aba conveyor_pulso).
 *
 * Cada linha = 1 colaborador (OPS Id) em 1 estação de trabalho em 1 hora,
 * com `total de processamento (pedidos)` = pedidos processados e
 * `produtividade horária (pedido/mnhr)` = produtividade daquela hora.
 * `hora_extracao` é a hora real da performance (confirmado com o Roberto em
 * 2026-07-31) — "hora de entrada"/"hora de saída" só têm data, sem horário.
 *
 * Classificação por prefixo do nome da estação (confirmado com o Roberto em
 * 2026-07-31), extraído de `id/nome da estação de trabalho`
 * (ex: "[WS8300000019]P2_AU06" -> prefixo "P2_AU06"):
 *   POBA/POBB/POBC/POBD -> Quedas
 *   P4                  -> Termoplástica
 *   P1                  -> Esteira A
 *   P2                  -> Esteira B
 *   qualquer outro (ex: "P_NON-TO 88") -> Non-TO (processo próprio, com card)
 *
 * Query params:
 *   date   YYYY-MM-DD (dia a visualizar; default = dia mais recente da base)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1013894222' };

function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function classificarEstacao(nomeEstacao) {
  const semPrefixoWs = String(nomeEstacao || '').replace(/^\[.*?\]/, '');
  if (/^POBA/.test(semPrefixoWs)) return 'Quedas';
  if (/^POBB/.test(semPrefixoWs)) return 'Quedas';
  if (/^POBC/.test(semPrefixoWs)) return 'Quedas';
  if (/^POBD/.test(semPrefixoWs)) return 'Quedas';
  if (/^P4/.test(semPrefixoWs)) return 'Termoplástica';
  if (/^P1/.test(semPrefixoWs)) return 'Esteira A';
  if (/^P2/.test(semPrefixoWs)) return 'Esteira B';
  return 'Non-TO';
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const conveyor = rows
    .filter(r => r.data)
    .map(r => ({ ...r, dataIso: brToIso(r.data) }))
    .filter(r => r.dataIso !== null);

  if (!conveyor.length) {
    res.status(200).json({
      ok: true, data: null, rows: [], grupos: [],
      cobertura: { inicio: null, fim: null },
    });
    return;
  }

  const datasDisponiveis = [...new Set(conveyor.map(r => r.dataIso))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];

  const dataQuery = req.query.date;
  const dataRef = (dataQuery && datasDisponiveis.includes(dataQuery)) ? dataQuery : dataMaxima;

  const doDia = conveyor.filter(r => r.dataIso === dataRef);

  const linhas = doDia.map(r => {
    const estacao = r['id/nome da estação de trabalho'] || '';
    return {
      hora: toNum(r.hora_extracao),
      opsId: r['ops id'] || '',
      estacao,
      grupo: classificarEstacao(estacao),
      tipoAtividade: r['tipo de atividade'] || '',
      horasTrabalho: toNum(r['horas de trabalho (mnhr)']),
      produtividade: toNum(r['produtividade horária (pedido/mnhr)']),
      totalProcessamento: toNum(r['total de processamento (pedidos)']),
    };
  });

  const grupos = ['Quedas', 'Termoplástica', 'Esteira A', 'Esteira B', 'Non-TO'];

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    data: dataRef,
    rows: linhas,
    grupos,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
