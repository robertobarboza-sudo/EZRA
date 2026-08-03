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
 * Query params:
 *   date   YYYY-MM-DD (data_operacional; default = data mais recente disponível)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1026737209' };

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
    res.status(200).json({ ok: true, data: null, rows: [], opcoes: { turnos: [], agencias: [] }, cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(fm.map(r => r.data_operacional))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const hojeIso = new Date().toISOString().slice(0, 10);
  const dataQuery = req.query.date;
  const dataRef = (dataQuery && datasDisponiveis.includes(dataQuery))
    ? dataQuery
    : (datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima);

  const doDia = fm.filter(r => r.data_operacional === dataRef);

  const linhas = doDia.map(r => ({
    driver: r.driver_id_spx || '',
    estacao: r.station_name || '',
    agencia: r.agency_name || '',
    turno: r.turno_operacional || '',
    hora: toNum(r.slot_chegada),
    checkinDriver: r.checkin_driver || '',
    atribuicaoDoca: r.atribuicao_doca || '',
    finalizacaoJornada: r.finalizacao_jornada || '',
    tempoFilaMin: toNum(r.tempo_fila_minutos),
    tempoDescargaMin: toNum(r.tempo_descarga_minutos),
    tempoTotalMin: toNum(r.tempo_total_minutos),
    performanceDoca: r.performance_doca || '',
    desvioMetaMin: toNum(r.desvio_meta_minutos),
  }));

  const opcoes = {
    turnos: [...new Set(linhas.map(l => l.turno).filter(Boolean))].sort(),
    agencias: [...new Set(linhas.map(l => l.agencia).filter(Boolean))].sort(),
  };

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    data: dataRef,
    rows: linhas,
    opcoes,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
