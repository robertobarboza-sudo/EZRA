/**
 * PULSO — Inbound First Mile: monitor histórico de chegada/descarga (aba inbound_fm_pulso).
 *
 * Sem ETA planejado nessa base (confirmado com o Roberto em 2026-08-04) — só
 * execução real: checkin_driver (geo) -> atribuicao_doca -> ocupacao_doca ->
 * finalizacao_jornada (fim descarga). "Planejado" aqui é a META operacional
 * já calculada na planilha (meta_descarga_minutos/performance_doca/
 * desvio_meta_minutos), não um horário agendado — por isso a página não tem
 * card de pontualidade planejado x realizado, só monitor histórico + meta.
 *
 * Suporta intervalo (from/to) pra análise histórica — confirmado com o
 * Roberto em 2026-08-04; sem params, default é from=to=hoje.
 *
 * Query params:
 *   from, to   YYYY-MM-DD (data_operacional; default = hoje, ou o dia mais
 *              recente disponível se hoje não tiver dado ainda)
 */
const { fetchTabByGid } = require('./_google');
const { toNum, hojeOperacionalIso } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1026737209' };

// Hora extraída direto da string (evita ambiguidade de fuso horário do
// parse via Date) + turno pela mesma janela do Outbound (T1 06h-13h59,
// T2 14h-21h59, T3 22h-05h59) — pedido do Roberto em 2026-08-14:
// turno_operacional é estático da planilha, não reflete a hora real do
// checkin; sem "planejado" nessa base (ver comentário do topo do arquivo),
// então recalcula sempre em cima do checkin_driver.
function horaDe(v) {
  const m = String(v || '').match(/(\d{2}):\d{2}:\d{2}/);
  return m ? Number(m[1]) : null;
}
function turnoDeHora(hora) {
  if (hora === null) return null;
  if (hora >= 6 && hora <= 13) return 'T1';
  if (hora >= 14 && hora <= 21) return 'T2';
  return 'T3';
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const fm = rows.filter(r => r.data_operacional);
  if (!fm.length) {
    res.status(200).json({ ok: true, de: null, ate: null, rows: [], opcoes: { turnos: [], agencias: [] }, cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(fm.map(r => r.data_operacional))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const hojeIso = hojeOperacionalIso();
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const de = (req.query.from && datasDisponiveis.includes(req.query.from)) ? req.query.from : padrao;
  const ate = (req.query.to && datasDisponiveis.includes(req.query.to) && req.query.to >= de) ? req.query.to : de;

  const doIntervalo = fm.filter(r => r.data_operacional >= de && r.data_operacional <= ate);

  const linhas = doIntervalo.map(r => ({
    driver: r.driver_id_spx || '',
    estacao: r.station_name || '',
    agencia: r.agency_name || '',
    turno: turnoDeHora(horaDe(r.checkin_driver)) || r.turno_operacional || '',
    hora: toNum(r.slot_chegada),
    checkinDriver: r.checkin_driver || '',
    atribuicaoDoca: r.atribuicao_doca || '',
    finalizacaoJornada: r.finalizacao_jornada || '',
    tempoFilaMin: toNum(r.tempo_fila_minutos),
    tempoDescargaMin: toNum(r.tempo_descarga_minutos),
    tempoTotalMin: toNum(r.tempo_total_minutos),
    performanceDoca: r.performance_doca || '',
    desvioMetaMin: toNum(r.desvio_meta_minutos),
    pacotes: toNum(r.pickup_quantity),
  }));

  const opcoes = {
    turnos: [...new Set(linhas.map(l => l.turno).filter(Boolean))].sort(),
    agencias: [...new Set(linhas.map(l => l.agencia).filter(Boolean))].sort(),
  };

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    de, ate,
    rows: linhas,
    opcoes,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
