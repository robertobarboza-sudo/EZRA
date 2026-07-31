/**
 * PULSO — Forecast por canal (aba forecast_backlog_pulso, colunas H-M).
 *
 * Colunas H-M (date, destination, origin_type, direct, transhipment, total)
 * são uma tabela independente do bloco de Backlog (colunas A-E, ver
 * api/backlog.js) — não têm relação linha a linha, só coexistem na mesma aba.
 *
 * Clusterização de origin_type (confirmado com o Roberto em 2026-07-31):
 *   FMH, SOC, INTER-SOC   -> LH
 *   PUDO SVP, BIG SELLER  -> FM
 *   CB                    -> CB
 *   FULL                  -> critério próprio (card separado), mas soma no Total
 * `total` (= direct + transhipment) é o valor usado nos cards/tabela — cada
 * canal já vem com o transhipment embutido nesse campo.
 *
 * Query params:
 *   date   YYYY-MM-DD — data de referência pros cards E âncora da semana
 *          (segunda a domingo) mostrada na tabela; default = hoje (ou a menor
 *          data disponível, se hoje for anterior ao início do forecast)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '202012183' };

const CLUSTER = {
  FMH: 'LH', SOC: 'LH', 'INTER-SOC': 'LH',
  'PUDO SVP': 'FM', 'BIG SELLER': 'FM',
  CB: 'CB',
  FULL: 'FULL',
};

function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function aggregate(rows) {
  const soma = { total: 0, lh: 0, fm: 0, cb: 0, full: 0 };
  rows.forEach(r => {
    const cluster = CLUSTER[r.origin_type];
    if (!cluster) return;
    const v = toNum(r.total);
    soma.total += v;
    if (cluster === 'LH') soma.lh += v;
    else if (cluster === 'FM') soma.fm += v;
    else if (cluster === 'CB') soma.cb += v;
    else if (cluster === 'FULL') soma.full += v;
  });
  return soma;
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const forecast = rows
    .filter(r => r.date)
    .map(r => ({ ...r, dataIso: brToIso(r.date) }))
    .filter(r => r.dataIso !== null);

  if (!forecast.length) {
    res.status(200).json({ ok: true, data: null, atual: { total: 0, lh: 0, fm: 0, cb: 0, full: 0 }, tabela: [], cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(forecast.map(r => r.dataIso))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];

  const hojeIso = new Date().toISOString().slice(0, 10);
  const dataQuery = req.query.date;
  const dataRef = (dataQuery && dataQuery >= dataMinima && dataQuery <= dataMaxima)
    ? dataQuery
    : (hojeIso >= dataMinima && hojeIso <= dataMaxima ? hojeIso : dataMinima);

  const porData = new Map();
  forecast.forEach(r => {
    if (!porData.has(r.dataIso)) porData.set(r.dataIso, []);
    porData.get(r.dataIso).push(r);
  });

  const atual = aggregate(porData.get(dataRef) || []);

  // Semana (segunda a domingo) que contém dataRef, pro formato de tabela.
  const refDate = new Date(dataRef + 'T00:00:00Z');
  const diaSemana = (refDate.getUTCDay() + 6) % 7; // segunda=0
  const segunda = new Date(refDate);
  segunda.setUTCDate(segunda.getUTCDate() - diaSemana);

  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const tabela = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const agg = aggregate(porData.get(iso) || []);
    return { data: iso, diaSemana: DIAS[i], ...agg };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    data: dataRef,
    atual,
    tabela,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
