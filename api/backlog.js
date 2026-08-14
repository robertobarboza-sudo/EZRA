/**
 * PULSO — Backlog (aba forecast_backlog_pulso, colunas A-G).
 *
 * Modelo novo (2026-08-04): a base deixou de ser uma série horária por
 * cutoff/hour_cutoff e virou um snapshot granular por
 * faixa_aging/perfil/origem, com `snapshot_hora` como referencial de
 * tempo (ex.: "2026-08-03 09:00:00") — confirmado ao vivo em
 * 2026-08-04 via debug-meta: 24 horários distintos reais (não um único
 * valor), cobrindo um range rolante das últimas ~24h. As colunas A-G
 * (backlog) e H-M (forecast, ver api/forecast.js) continuam sendo DUAS
 * TABELAS INDEPENDENTES coladas lado a lado — sem relação linha a linha.
 *
 * Data operacional (padrão pra todos os reports/gráficos, confirmado com
 * o Roberto em 2026-08-04): cutoff de 6h — snapshot_hora entre 00:00 e
 * 05:59 pertence ao dia operacional ANTERIOR, não ao dia-calendário do
 * timestamp (ver dataOperacionalDe em api/_period.js). É o único ponto do
 * PULSO que deriva uma data a partir de um timestamp cru; as demais
 * páginas já recebem a data pronta da planilha (cutoff/data_operacional).
 *
 * `date` (período, igual ao padrão de from/to do Inbound) é resolvido no
 * servidor; hora/perfil são filtros de dimensão e ficam a cargo do
 * front (mesmo padrão do turno/status/origem no Inbound LH) — por isso a
 * API devolve todas as linhas do dia e deixa o front recortar.
 *
 * Query params:
 *   date   YYYY-MM-DD (default = hoje operacional, ou o dia mais recente disponível)
 */
const { fetchTabByGid } = require('./_google');
const { toNum, dataOperacionalDe, hojeOperacionalIso, ordemHoraCutoff } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '202012183' };

// "2026-08-03 09:00:00" -> { data:"2026-08-03" (operacional, cutoff 6h), hora:9 (relógio real, pro filtro de hora) }
function dataHoraDe(v) {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):\d{2}:\d{2}$/);
  return m ? { data: dataOperacionalDe(v), hora: Number(m[2]) } : { data: null, hora: null };
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
      const { data, hora } = dataHoraDe(r.snapshot_hora);
      return {
        data, hora,
        faixaAging: r.faixa_aging || '',
        perfil: r.perfil || '',
        statusDesc: r.status_desc || '',
        origem: r.origem || '',
        qtdPacotes: toNum(r.qtd_pacotes),
        agingMedioMin: toNum(r.aging_medio_min),
        snapshotHora: r.snapshot_hora || '',
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
  const hojeIso = hojeOperacionalIso();
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const date = (req.query.date && datasDisponiveis.includes(req.query.date)) ? req.query.date : padrao;

  const doDia = backlog.filter(r => r.data === date);

  const opcoes = {
    perfis: [...new Set(doDia.map(r => r.perfil).filter(Boolean))].sort(),
    faixas: [...new Set(doDia.map(r => r.faixaAging).filter(Boolean))],
    // Ordem de cutoff (6h...23h,0h...5h), não numérica crua — senão
    // "última hora" no front pegava 23h em vez da real (ex.: 2h da manhã,
    // que é cronologicamente depois de 23h dentro do dia operacional).
    horas: [...new Set(doDia.map(r => r.hora))].sort((a, b) => ordemHoraCutoff(a) - ordemHoraCutoff(b)),
  };

  const ultimaAtualizacao = doDia.reduce((max, r) => (!max || r.snapshotHora > max) ? r.snapshotHora : max, null);

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
