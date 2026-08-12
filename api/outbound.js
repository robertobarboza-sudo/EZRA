/**
 * PULSO — Outbound: acompanhamento de CPT/SLA (aba rawdata_out_pulso).
 *
 * Uma página só, dois modos (decidido com o Roberto em 2026-07-30):
 *   - "hoje" (padrão, sem `de`/`ate` na query): filtro fixo no dia
 *     operacional atual de verdade — cutoff de 6h (hojeOperacionalIso, ver
 *     api/_period.js), não o cutoff mais recente da planilha (corrigido em
 *     2026-07-30: a planilha pode ter cutoffs futuros pré-planejados,
 *     então "o cutoff mais recente" não é "hoje").
 *   - "historico" (quando `de` e/ou `ate` vêm preenchidos): filtra cutoff
 *     dentro do intervalo informado (lado que faltar usa o limite da base).
 * Sem comparação vs período anterior — é um retrato do intervalo escolhido,
 * não um dashboard tipo SPR.
 *
 * Query params:
 *   de, ate                  YYYY-MM-DD (opcionais — presença de qualquer um ativa o modo histórico)
 *   turno                    lista separada por vírgula (T1,T2,T3) — ver api/_outbound.js pra a regra de compartilhado
 *   status, solicitante      listas separadas por vírgula (status_agrupado, solicitation_by)
 *   destino, agencia, veiculo   listas separadas por vírgula
 *   q                        busca livre em lh_trips
 */
const { fetchTabByGid } = require('./_google');
const { parseCSV, hojeOperacionalIso, dataOperacionalDe, toNum } = require('./_period');
const { enrich, pertenceAoTurno, aggregate, toCarroRow } = require('./_outbound');

const OUTBOUND_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '0' };
// Monitor - Live (subaba nova dentro de Outbound, pedido do Roberto em
// 2026-08-13) — timeline ao vivo de viagens (STA/STD/ATD por trip), fonte
// própria (outbound_monitor_pulso), não a rawdata_out_pulso de cima.
const MONITOR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1386791246' };
// Local de endereçamento dos unitizadores por destino (pedido do Roberto em
// 2026-08-13, "Intersoc/HUB"): mesma base da Clusterização (cluster_pulso +
// config, ver api/cluster.js), só o de-para código→rua + contagem por
// destino — não duplica a reconciliação inteira (roster/capacidade/etc,
// que essa página não usa).
const CLUSTER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '646168208' };
const CLUSTER_CONFIG_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1408724077' };

async function buildEnderecamentoPorDestino() {
  const [{ rows: clusterRows }, { rows: configRows }] = await Promise.all([
    fetchTabByGid(CLUSTER_SHEET.spreadsheetId, CLUSTER_SHEET.gid),
    fetchTabByGid(CLUSTER_CONFIG_SHEET.spreadsheetId, CLUSTER_CONFIG_SHEET.gid),
  ]);
  const staginDepara = new Map(); // staging area id -> staging area name (rua)
  configRows.forEach(r => {
    const id = r['staging area id'];
    const rua = r['staging area name'];
    if (id && rua) staginDepara.set(id, rua);
  });
  const porDestino = new Map(); // destino (receiver) -> Map(rua -> qtd de TOs)
  clusterRows.forEach(r => {
    const codigo = r['staging area'];
    const rua = (codigo && codigo !== '-') ? staginDepara.get(codigo) : null;
    if (!rua || !r.receiver) return;
    if (!porDestino.has(r.receiver)) porDestino.set(r.receiver, new Map());
    const m = porDestino.get(r.receiver);
    m.set(rua, (m.get(rua) || 0) + 1);
  });
  const out = {};
  porDestino.forEach((ruas, destino) => {
    out[destino] = [...ruas.entries()].sort((a, b) => b[1] - a[1]).map(([rua, qtd]) => ({ rua, qtd }));
  });
  return out;
}

// Monitor - Live: só busca/computa quando pedido explicitamente (?monitor=1)
// — a página normal de Outbound não usa esse bloco. Curto-circuita antes do
// fetch de OUTBOUND_SHEET (planilha diferente, não precisa das duas).
async function buildMonitor(req, res) {
  let monRows;
  try {
    ({ rows: monRows } = await fetchTabByGid(MONITOR_SHEET.spreadsheetId, MONITOR_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }
  // Endereçamento é um enriquecimento opcional (vem de outra aba) — se
  // falhar, o Monitor - Live continua funcionando sem essa informação.
  let enderecamento = {};
  try {
    enderecamento = await buildEnderecamentoPorDestino();
  } catch (err) { /* ignora — enriquecimento opcional */ }

  const comDia = monRows.filter(r => r.sta).map(r => ({ ...r, __dia: dataOperacionalDe(r.sta) })).filter(r => r.__dia);
  const diasDisponiveis = [...new Set(comDia.map(r => r.__dia))].sort();
  const hojeIso = hojeOperacionalIso();
  // "Hoje" se tiver viagem hoje, senão o dia mais recente disponível (mesmo
  // padrão de api/inbound-lh.js — a fonte pode estar um pouco atrasada).
  const dia = diasDisponiveis.includes(hojeIso) ? hojeIso : (diasDisponiveis[diasDisponiveis.length - 1] || hojeIso);
  const doDia = comDia.filter(r => r.__dia === dia);

  const viagens = doDia.map(r => ({
    destino: r.destino || '',
    destino_codigo: r.destino_codigo || '',
    staged_pacotes: toNum(r.staged_pacotes),
    staged_to: toNum(r.staged_to),
    staged_peso_kg: r.staged_peso_kg || '',
    embalagens: r.embalagens || '',
    alerta_destino: r.alerta_destino || '',
    trip_number: r.trip_number || '',
    trip_name: r.trip_name || '',
    transportadora: r.transportadora || '',
    veiculo_tipo: r.veiculo_tipo || '',
    veiculo_placa: r.veiculo_placa || '',
    trip_status: r.trip_status || '',
    trip_station_status: r.trip_station_status || '',
    trip_operate_type: r.trip_operate_type || '',
    sta: r.sta || '',
    std: r.std || '',
    ata: r.ata || '',
    atd: r.atd || '',
    capacidade_pct: toNum(r.capacidade_pct),
    carga_qtd: toNum(r.carga_qtd),
    carga_pct: toNum(r.carga_pct),
    doca: r.doca || '',
    alerta_trip: r.alerta_trip || '',
  }));

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
  res.status(200).json({
    ok: true,
    dia,
    cobertura: { inicio: diasDisponiveis[0] || null, fim: diasDisponiveis[diasDisponiveis.length - 1] || null },
    viagens,
    enderecamento,
  });
}

module.exports = async (req, res) => {
  if (req.query.monitor !== undefined) {
    await buildMonitor(req, res);
    return;
  }

  let rows;
  try {
    ({ rows } = await fetchTabByGid(OUTBOUND_SHEET.spreadsheetId, OUTBOUND_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const enriquecidas = rows.filter(r => r.cutoff).map(enrich);

  const cutoffs = enriquecidas.map(r => r.cutoff).sort();
  const dataMinima = cutoffs[0];
  const dataMaxima = cutoffs[cutoffs.length - 1];

  const deQuery = req.query.de || '';
  const ateQuery = req.query.ate || '';
  const modo = (deQuery || ateQuery) ? 'historico' : 'hoje';

  let inicio, fim;
  if (modo === 'hoje') {
    inicio = fim = hojeOperacionalIso();
  } else {
    inicio = deQuery || dataMinima;
    fim = ateQuery || dataMaxima;
  }

  const doIntervalo = enriquecidas.filter(r => r.cutoff >= inicio && r.cutoff <= fim);

  const turnos = parseCSV(req.query.turno);
  const status = parseCSV(req.query.status);
  const solicitantes = parseCSV(req.query.solicitante);
  const destinos = parseCSV(req.query.destino);
  const agencias = parseCSV(req.query.agencia);
  const veiculos = parseCSV(req.query.veiculo);
  const busca = (req.query.q || '').trim().toLowerCase();

  // FECHADA no filtro de Status = tem cpt_realizado preenchido (confirmado
  // com o Roberto em 2026-07-30) — mesma definição de "realizado" dos cards,
  // não o texto de status_agrupado, que pode ainda estar como ABERTA na
  // planilha mesmo com o carro já expedido. Os demais status seguem
  // batendo direto com status_agrupado.
  const bateStatus = (r, s) => s === 'FECHADA' ? !!r.cpt_realizado : r.status_agrupado === s;

  const passaFiltros = r =>
    (!turnos.length || turnos.some(t => pertenceAoTurno(r, t))) &&
    (!status.length || status.some(s => bateStatus(r, s))) &&
    (!solicitantes.length || solicitantes.includes(r.solicitation_by)) &&
    (!destinos.length || destinos.includes(r.destination_station_code)) &&
    (!agencias.length || agencias.includes(r.used_agency_name)) &&
    (!veiculos.length || veiculos.includes(r.used_vehicle)) &&
    (!busca || String(r.lh_trips || '').toLowerCase().includes(busca));

  const filtradas = doIntervalo.filter(passaFiltros);
  const atual = aggregate(filtradas);

  // Limite alto: com a paginação no front (100/página), dá pra mandar a base
  // filtrada inteira (~3,5 mil linhas hoje) sem estourar o navegador.
  const LIMITE = 20000;
  const ordenadas = modo === 'hoje'
    ? [...filtradas].sort((a, b) => String(a.hora_cpt_planejado || '99').localeCompare(String(b.hora_cpt_planejado || '99')))
    : [...filtradas].sort((a, b) => (b.cutoff || '').localeCompare(a.cutoff || ''));
  const carros = ordenadas.slice(0, LIMITE).map(toCarroRow);

  const uniq = key => [...new Set(doIntervalo.map(r => r[key]).filter(Boolean))].sort();

  // ETA de destino por hora do dia: planejado vs realizado, pra curva de
  // antecipação/fila de chegada — usa as colunas de hora já extraídas na planilha.
  const etaPlanejadoPorHora = Array(24).fill(0);
  const etaRealizadoPorHora = Array(24).fill(0);
  filtradas.forEach(r => {
    if (r.hora_eta_destino_planejado !== '' && r.hora_eta_destino_planejado != null) {
      const hp = Number(r.hora_eta_destino_planejado);
      if (Number.isInteger(hp) && hp >= 0 && hp <= 23) etaPlanejadoPorHora[hp]++;
    }
    if (r.hora_eta_destino_realizado !== '' && r.hora_eta_destino_realizado != null) {
      const hr = Number(r.hora_eta_destino_realizado);
      if (Number.isInteger(hr) && hr >= 0 && hr <= 23) etaRealizadoPorHora[hr]++;
    }
  });

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    modo,
    intervalo: { inicio, fim },
    cobertura: { inicio: dataMinima, fim: dataMaxima },
    atual,
    porHoraEta: { planejado: etaPlanejadoPorHora, realizado: etaRealizadoPorHora },
    carros, carrosTotal: filtradas.length,
    opcoesFiltro: {
      turno: ['T1', 'T2', 'T3'],
      status: uniq('status_agrupado'),
      solicitante: uniq('solicitation_by'),
      destino: uniq('destination_station_code'),
      agencia: uniq('used_agency_name'),
      veiculo: uniq('used_vehicle'),
    },
  });
};
