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
 *   FULL                  -> critério próprio (card/linha separada), mas soma no Total
 * `total` (= direct + transhipment) é o valor usado no forecast — cada canal
 * já vem com o transhipment embutido nesse campo. A linha "Transhipment" é só
 * informativa (quanto do total já é transhipment) e NUNCA é somada de novo.
 *
 * View semanal/mensal (confirmado com o Roberto em 2026-07-31):
 *   - Tabela agrupada por semana (segunda a domingo), cobrindo o mês de
 *     `date`. Cada semana tem os 7 dias, o total da semana ("Week") e o
 *     terceiro quartil (Q3, interpolação linear = QUARTILE.INC) dos 7 dias,
 *     por canal — no mesmo formato de linhas dos dias (Total/LH/FM/CB/FULL/
 *     Transhipment).
 *   - "Quartil" (mensal) = Q3 dos Q3 semanais do mês, por canal.
 *   - "ADO Quartil" = Quartil mensal / 6 (dias úteis produtivos), por canal.
 *   - Total do mês = soma só dos dias cujo `date` cai dentro do mês (não
 *     conta os dias de semanas vizinhas que "vazam" pro mês anterior/seguinte).
 *
 * Query params:
 *   date   YYYY-MM-DD — data de referência pros cards do topo E mês exibido
 *          na tabela; default = hoje (ou a menor data disponível, se hoje for
 *          anterior ao início do forecast)
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

const CANAIS = ['total', 'lh', 'fm', 'cb', 'full', 'transhipment'];
const ZERO_AGG = { total: 0, lh: 0, fm: 0, cb: 0, full: 0, transhipment: 0 };

function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function aggregate(rows) {
  const soma = { ...ZERO_AGG };
  rows.forEach(r => {
    const cluster = CLUSTER[r.origin_type];
    if (!cluster) return;
    const v = toNum(r.total);
    soma.total += v;
    soma.transhipment += toNum(r.transhipment);
    if (cluster === 'LH') soma.lh += v;
    else if (cluster === 'FM') soma.fm += v;
    else if (cluster === 'CB') soma.cb += v;
    else if (cluster === 'FULL') soma.full += v;
  });
  return soma;
}

function somaAgg(lista) {
  const soma = { ...ZERO_AGG };
  lista.forEach(a => CANAIS.forEach(c => { soma[c] += a[c] || 0; }));
  return soma;
}

// QUARTILE.INC (interpolação linear) — mesmo método padrão do Excel/Sheets.
function quartil3(valores) {
  const arr = [...valores].sort((a, b) => a - b);
  const n = arr.length;
  if (!n) return 0;
  if (n === 1) return arr[0];
  const pos = (n - 1) * 0.75;
  const base = Math.floor(pos);
  const resto = pos - base;
  const proximo = arr[base + 1] !== undefined ? arr[base + 1] : arr[base];
  return arr[base] + resto * (proximo - arr[base]);
}

function quartilAgg(lista) {
  const q = { ...ZERO_AGG };
  CANAIS.forEach(c => { q[c] = quartil3(lista.map(a => a[c] || 0)); });
  return q;
}

function segundaDaSemana(d) {
  const dia = (d.getUTCDay() + 6) % 7; // segunda = 0
  const seg = new Date(d);
  seg.setUTCDate(seg.getUTCDate() - dia);
  return seg;
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
    res.status(200).json({
      ok: true, data: null, mes: null, atual: { ...ZERO_AGG },
      semanas: [], mesTotal: { ...ZERO_AGG }, quartilMensal: { ...ZERO_AGG }, adoQuartil: { ...ZERO_AGG },
      cobertura: { inicio: null, fim: null },
    });
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
  const aggDia = iso => aggregate(porData.get(iso) || []);

  const atual = aggDia(dataRef);
  const mesRef = dataRef.slice(0, 7); // YYYY-MM
  const [anoRef, mesNum] = mesRef.split('-').map(Number);
  const primeiroDiaMes = new Date(Date.UTC(anoRef, mesNum - 1, 1));
  const ultimoDiaMes = new Date(Date.UTC(anoRef, mesNum, 0));

  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  const inicioSemanas = segundaDaSemana(primeiroDiaMes);
  const fimSemanas = segundaDaSemana(ultimoDiaMes);
  fimSemanas.setUTCDate(fimSemanas.getUTCDate() + 6);

  const semanas = [];
  for (let seg = new Date(inicioSemanas); seg <= fimSemanas; seg.setUTCDate(seg.getUTCDate() + 7)) {
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(seg);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return { data: iso, diaSemana: DIAS[i], ...aggDia(iso) };
    });
    const inicioIso = dias[0].data, fimIso = dias[6].data;
    semanas.push({
      inicio: inicioIso,
      fim: fimIso,
      isCurrent: hojeIso >= inicioIso && hojeIso <= fimIso,
      dias,
      semana: somaAgg(dias),
      quartil: quartilAgg(dias),
    });
  }

  const diasDoMes = [];
  for (let d = new Date(primeiroDiaMes); d <= ultimoDiaMes; d.setUTCDate(d.getUTCDate() + 1)) {
    diasDoMes.push(aggDia(d.toISOString().slice(0, 10)));
  }
  const mesTotal = somaAgg(diasDoMes);

  const quartilMensal = quartilAgg(semanas.map(s => s.quartil));
  const adoQuartil = {};
  CANAIS.forEach(c => { adoQuartil[c] = quartilMensal[c] / 6; });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    data: dataRef,
    mes: mesRef,
    atual,
    semanas,
    mesTotal,
    quartilMensal,
    adoQuartil,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
