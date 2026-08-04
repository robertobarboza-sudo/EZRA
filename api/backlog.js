/**
 * PULSO — Backlog (aba forecast_backlog_pulso, colunas A-G).
 *
 * Modelo novo (2026-08-04): a base deixou de ser uma série horária
 * (cutoff/hour_cutoff) e virou um snapshot granular por
 * faixa_aging/perfil/origem, com `ultima_atualizacao_tabela` como único
 * referencial de tempo (ex.: "2026-08-03 22:01:48"). As colunas A-G
 * (backlog) e H-M (forecast, ver api/forecast.js) continuam sendo DUAS
 * TABELAS INDEPENDENTES coladas lado a lado — sem relação linha a linha.
 *
 * `date` (período, igual ao padrão de from/to do Inbound) é resolvido no
 * servidor; hora/perfil são filtros de dimensão e ficam a cargo do
 * front (mesmo padrão do turno/status/origem no Inbound LH) — por isso a
 * API devolve todas as linhas do dia e deixa o front recortar.
 *
 * Query params:
 *   date   YYYY-MM-DD (default = hoje, ou o dia mais recente disponível)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '202012183' };

// "2026-08-03 22:01:48" -> { data:"2026-08-03", hora:22 }
function dataHoraDe(v) {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):\d{2}:\d{2}$/);
  return m ? { data: m[1], hora: Number(m[2]) } : { data: null, hora: null };
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
    .filter(r => r.faixa_aging)
    .map(r => {
      const { data, hora } = dataHoraDe(r.ultima_atualizacao_tabela);
      return {
        data, hora,
        faixaAging: r.faixa_aging || '',
        perfil: r.perfil || '',
        statusDesc: r.status_desc || '',
        origem: r.origem || '',
        qtdPacotes: toNum(r.qtd_pacotes),
        agingMedioMin: toNum(r.aging_medio_min),
        ultimaAtualizacao: r.ultima_atualizacao_tabela || '',
      };
    })
    .filter(r => r.data !== null);

  if (!backlog.length) {
    res.status(200).json({
      ok: true, date: null, rows: [],
      opcoes: { perfis: [], faixas: [], horas: [] },
      ultimaAtualizacao: null,
      cobertura: { inicio: null, fim: null },
    });
    return;
  }

  const datasDisponiveis = [...new Set(backlog.map(r => r.data))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const hojeIso = new Date().toISOString().slice(0, 10);
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const date = (req.query.date && datasDisponiveis.includes(req.query.date)) ? req.query.date : padrao;

  const doDia = backlog.filter(r => r.data === date);

  const opcoes = {
    perfis: [...new Set(doDia.map(r => r.perfil).filter(Boolean))].sort(),
    faixas: [...new Set(doDia.map(r => r.faixaAging).filter(Boolean))],
    horas: [...new Set(doDia.map(r => r.hora))].sort((a, b) => a - b),
  };

  const ultimaAtualizacao = doDia.reduce((max, r) => (!max || r.ultimaAtualizacao > max) ? r.ultimaAtualizacao : max, null);

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    date,
    rows: doDia.map(({ data, ...resto }) => resto),
    opcoes,
    ultimaAtualizacao,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
