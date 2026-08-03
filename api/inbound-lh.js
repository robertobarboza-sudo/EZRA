/**
 * PULSO — Inbound Line Haul: pontualidade planejado x realizado (aba inbound_lh_pulso).
 *
 * Cada linha = 1 viagem (`viagem` é única na aba). "Realizada" = tem
 * eta_destino_realizado preenchido (mesmo padrão do Outbound: usa a
 * presença do timestamp real, não o texto de status). Atraso = diferença em
 * minutos entre eta_destino_realizado e eta_destino_planejado — sem
 * margem/tolerância (confirmado com o Roberto em 2026-08-04): atraso > 0
 * já conta como atrasada.
 *
 * Data de referência da página = data_eta_ajustado (data do ETA planejado).
 *
 * Query params:
 *   date   YYYY-MM-DD (default = data mais recente disponível)
 */
const { fetchTabByGid } = require('./_google');
const { toNum } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1485919739' };

function parseDT(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d) ? null : d;
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const lh = rows.filter(r => r.data_eta_ajustado);
  if (!lh.length) {
    res.status(200).json({ ok: true, data: null, rows: [], opcoes: { turnos: [], status: [], origens: [] }, cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(lh.map(r => r.data_eta_ajustado))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const dataQuery = req.query.date;
  const dataRef = (dataQuery && datasDisponiveis.includes(dataQuery)) ? dataQuery : dataMaxima;

  const doDia = lh.filter(r => r.data_eta_ajustado === dataRef);

  const linhas = doDia.map(r => {
    const planejado = parseDT(r.eta_destino_planejado);
    const realizado = parseDT(r.eta_destino_realizado);
    const atrasoMin = (planejado && realizado) ? Math.round((realizado - planejado) / 60000) : null;
    return {
      viagem: r.viagem,
      origem: r.origem || '',
      veiculo: r.veiculo_utilizado || '',
      turno: r.turno_planejado || '',
      status: r.status_agrupado || '',
      horaPlanejada: toNum(r.hora_eta_ajustado),
      horaRealizada: r.hora_eta_destino_realizado !== '' ? toNum(r.hora_eta_destino_realizado) : null,
      planejado: r.eta_destino_planejado || '',
      realizado: r.eta_destino_realizado || '',
      realizada: !!r.eta_destino_realizado,
      atrasoMin,
      onTime: atrasoMin !== null ? atrasoMin <= 0 : null,
      pacotes: toNum(r.total_pacotes),
      tos: toNum(r.total_tos),
    };
  });

  const opcoes = {
    turnos: [...new Set(linhas.map(l => l.turno).filter(Boolean))].sort(),
    status: [...new Set(linhas.map(l => l.status).filter(Boolean))].sort(),
    origens: [...new Set(linhas.map(l => l.origem).filter(Boolean))].sort(),
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
