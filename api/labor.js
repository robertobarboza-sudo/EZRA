/**
 * PULSO — Labor: planejamento de capacidade por hora (aba labor_pulso).
 *
 * Cada linha = 1 hora planejada, com a capacidade esperada por posto
 * (confirmado com o Roberto em 2026-08-04):
 *   nv1/nv2/nv3      quantidade de mesas esperadas (NV.1/NV.2/NV.3)
 *   asmZonas         quantidade de zonas de ASM previstas na hora
 *   asmTarget        capacidade de ASM prevista na hora (volume)
 *   esteiraTermo     esteira termo prevista
 *   esteiras         quantidade de esteira A e B abertas previstas
 *   packingEsteira/packingVolumoso  volume de packing previsto (usados em
 *     api/overview.js como alvo comparável ao realizado do Conveyor)
 *
 * Data operacional (cutoff 6h, mesma lógica de api/_period.js): a coluna
 * `data` da aba usa o dia-calendário cru do timestamp (confirmado ao vivo
 * via debug-meta em 2026-08-04 — hora=2 do dia 01/12 continua rotulada
 * "01/12", não rola pro dia anterior), então recalculamos aqui combinando
 * data+hora em vez de usar a coluna como veio.
 *
 * Query params:
 *   date   YYYY-MM-DD (dia operacional a visualizar; default = hoje operacional)
 */
const { fetchTabByGid } = require('./_google');
const { toNum, dataOperacionalDe, hojeOperacionalIso } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1065816747' };

function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const labor = rows
    .filter(r => r.data && r.hora !== '')
    .map(r => {
      const dataIso = brToIso(r.data);
      if (dataIso === null) return null;
      const hora = toNum(r.hora);
      const data = dataOperacionalDe(`${dataIso} ${String(hora).padStart(2, '0')}:00:00`);
      return {
        data, hora,
        turno: r.turno || '',
        nv1: toNum(r['nv.1']),
        nv2: toNum(r['nv.2']),
        nv3: toNum(r['nv.3']),
        asmZonas: toNum(r['asm (zonas)']),
        asmTarget: toNum(r['asm target']),
        esteiraTermo: toNum(r['esteira termo']),
        esteiras: toNum(r.esteiras),
        packingEsteira: toNum(r['packing esteira']),
        packingVolumoso: toNum(r['packing volumoso']),
      };
    })
    .filter(Boolean);

  if (!labor.length) {
    res.status(200).json({ ok: true, date: null, rows: [], cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(labor.map(r => r.data))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const hojeIso = hojeOperacionalIso();
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const date = (req.query.date && datasDisponiveis.includes(req.query.date)) ? req.query.date : padrao;

  const doDia = labor.filter(r => r.data === date).sort((a, b) => a.hora - b.hora);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    date,
    rows: doDia,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
