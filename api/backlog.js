/**
 * PULSO — Backlog por hora (aba forecast_backlog_pulso, colunas A-E).
 *
 * As colunas A-E (cutoff, actual_station_name, pacotes, hour_cutoff,
 * maior_24h) e as colunas H-M (forecast, ver api/forecast.js) são DUAS
 * TABELAS INDEPENDENTES coladas lado a lado na mesma aba — não têm relação
 * linha a linha (confirmado em 2026-07-31: pra um mesmo cutoff, a coluna
 * `date` do bloco de forecast pula pra datas completamente fora de ordem).
 * Por isso lemos só as 5 colunas do bloco de backlog aqui.
 *
 * Duplicatas: pra um mesmo (cutoff, hour_cutoff) a aba tem várias linhas
 * (múltiplas rodadas/atualizações do dia). Confirmado com o Roberto em
 * 2026-07-31:
 *   - pacotes (o backlog da hora)      -> usa o MAIOR valor do grupo
 *   - maior_24h (backlog >24h da hora) -> usa a SOMA do grupo
 *
 * Query params:
 *   date   YYYY-MM-DD (cutoff a visualizar; default = cutoff mais recente da base)
 *   hour   0-23 (hora de referência pro card "Backlog Atual"; default 6 — "fixo
 *          em 6h da manhã a menos que mudem no filtro", pedido do Roberto)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '202012183' };

// "27/07/2026" -> "2026-07-27" (comparável/ordenável como string)
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

  const backlog = rows
    .filter(r => r.cutoff)
    .map(r => ({ cutoffIso: brToIso(r.cutoff), hora: toNum(r.hour_cutoff), pacotes: toNum(r.pacotes), maior24h: toNum(r.maior_24h) }))
    .filter(r => r.cutoffIso !== null);

  if (!backlog.length) {
    res.status(200).json({ ok: true, cutoff: null, hora: 6, atual: { backlogMedio: 0, backlogAtual: 0, backlogMedio24h: 0 }, curva: [], cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(backlog.map(r => r.cutoffIso))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];

  const cutoffQuery = req.query.date;
  const cutoff = (cutoffQuery && datasDisponiveis.includes(cutoffQuery)) ? cutoffQuery : dataMaxima;
  const horaQuery = parseInt(req.query.hour, 10);
  const hora = (Number.isInteger(horaQuery) && horaQuery >= 0 && horaQuery <= 23) ? horaQuery : 6;

  const doDia = backlog.filter(r => r.cutoffIso === cutoff);

  // Agrupa por hora: pacotes = máximo do grupo, maior_24h = soma do grupo.
  const porHora = new Map();
  doDia.forEach(r => {
    if (r.hora < 0 || r.hora > 23) return;
    if (!porHora.has(r.hora)) porHora.set(r.hora, { pacotes: 0, maior24h: 0 });
    const acc = porHora.get(r.hora);
    acc.pacotes = Math.max(acc.pacotes, r.pacotes);
    acc.maior24h += r.maior24h;
  });

  const curva = Array.from({ length: 24 }, (_, h) => {
    const acc = porHora.get(h);
    return { hora: h, pacotes: acc ? acc.pacotes : 0, maior24h: acc ? acc.maior24h : 0 };
  });

  const horasComDado = curva.filter(c => porHora.has(c.hora));
  const backlogMedio = horasComDado.length ? Math.round(horasComDado.reduce((s, c) => s + c.pacotes, 0) / horasComDado.length) : 0;
  const backlogMedio24h = horasComDado.length ? Math.round(horasComDado.reduce((s, c) => s + c.maior24h, 0) / horasComDado.length) : 0;
  const backlogAtual = (porHora.get(hora) || { pacotes: 0 }).pacotes;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    cutoff, hora,
    atual: { backlogMedio, backlogAtual, backlogMedio24h },
    curva,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
