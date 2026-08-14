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
 * Data de referência da página = cutoff_eta_planejado (dia operacional do
 * ETA planejado, cutoff 6h já aplicado na planilha). NÃO usa a coluna
 * data_eta_ajustado — apesar do nome, ela é só a data-calendário crua do
 * timestamp (sem o shift de 6h), então uma viagem planejada pra 02:00
 * (que operacionalmente é "hoje", turno T3) ficava de fora do "hoje" da
 * página até o dia virar no calendário — bug real de dado faltando,
 * confirmado ao vivo em 2026-08-14 comparando as duas colunas
 * (data_eta_ajustado="2026-08-15" vs cutoff_eta_planejado="2026-08-14"
 * pra uma linha com eta 2026-08-15 02:00). Corrigido pedido do Roberto.
 * Suporta intervalo (from/to) pra análise histórica — confirmado com o
 * Roberto em 2026-08-04; sem params, default é from=to=hoje (1 dia, mesmo
 * comportamento de antes).
 *
 * Query params:
 *   from, to   YYYY-MM-DD (default = hoje, ou o dia mais recente disponível
 *              se hoje não tiver dado ainda)
 */
const { fetchTabByGid } = require('./_google');
const { toNum, hojeOperacionalIso, dataOperacionalDe } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1485919739' };

function parseDT(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d) ? null : d;
}

// Hora extraída direto da string ("YYYY-MM-DD HH:MM:SS") — evita qualquer
// ambiguidade de fuso horário do parse via Date (usado só pro diff em ms).
function horaDe(v) {
  const m = String(v || '').match(/(\d{2}):\d{2}:\d{2}/);
  return m ? Number(m[1]) : null;
}

// Monitor - Fila (subaba nova dentro de Inbound, pedido do Roberto em
// 2026-08-15) — timeline ao vivo da fila de descarga (fila_pulso), com
// join em inbound_lh_pulso (chave: fila."lh trip number" = lh.viagem) pra
// trazer os dados da viagem quando já tiver sido vinculada. Cabeçalhos de
// fila_pulso vêm com espaço/parênteses (ex.: "waiting time (s)") — só essa
// aba no PULSO usa esse formato, por isso o acesso é sempre via colchete.
const FILA_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1682611336' };

async function buildFila(req, res) {
  let filaRows, lhRows;
  try {
    ([{ rows: filaRows }, { rows: lhRows }] = await Promise.all([
      fetchTabByGid(FILA_SHEET.spreadsheetId, FILA_SHEET.gid),
      fetchTabByGid(SHEET.spreadsheetId, SHEET.gid),
    ]));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  // viagem é única em inbound_lh_pulso (mesma garantia usada no resto do
  // arquivo) — lookup direto por chave.
  const lhPorViagem = new Map();
  lhRows.forEach(r => { if (r.viagem) lhPorViagem.set(r.viagem, r); });

  const comHora = filaRows.filter(r => r['add to queue time']);
  const comDia = comHora
    .map(r => ({ ...r, __dia: dataOperacionalDe(r['add to queue time']) }))
    .filter(r => r.__dia);
  const diasDisponiveis = [...new Set(comDia.map(r => r.__dia))].sort();
  const hojeIso = hojeOperacionalIso();
  const dia = diasDisponiveis.includes(hojeIso) ? hojeIso : (diasDisponiveis[diasDisponiveis.length - 1] || hojeIso);
  // Inclusão (pedido do Roberto em 2026-08-15): quem ainda está ATIVO na
  // fila (Pending/Assigned/Occupied) aparece sempre, não importa de qual
  // dia — um carro que entrou ontem e ainda não finalizou (atrasado de
  // ETA, por exemplo) continua na tela até finalizar a viagem. Só quem
  // já FINALIZOU (Ended) é que fica restrito ao dia resolvido — senão a
  // tela acumularia meses de histórico de viagens já encerradas. Isso já
  // cobre sozinho o caso de "carro do dia seguinte que chega antecipado"
  // (aparece porque ainda está ativo ou porque seu add_to_queue_time já
  // cai no dia resolvido).
  const doDia = comDia.filter(r => r.status !== 'Ended' || r.__dia === dia);

  const filas = doDia.map(r => {
    const lhTripNumber = r['lh trip number'] || '';
    const lh = lhTripNumber ? lhPorViagem.get(lhTripNumber) : null;
    return {
      queueNumber: r['queue number'] || '',
      status: r.status || '',
      driver: r.driver || '',
      agency: r.agency || '',
      veiculo: r['vehicle number'] || '',
      arrivalType: r['arrival type'] || '',
      addToQueueTime: r['add to queue time'] || '',
      waitingTimeS: toNum(r['waiting time (s)']),
      outOfThreshold: String(r['out of threshold'] || '').trim().toLowerCase() === 'sim',
      assignedDock: r['assigned dock'] || '',
      occupiedDock: r['occupied dock'] || '',
      onHoldDock: r['on hold dock'] || '',
      orderQuantity: toNum(r['order quantity']),
      lhTripNumber,
      lhTripName: r['lh trip name'] || '',
      // Campos pedidos pro card clicável — só existem quando o join acha a
      // viagem em inbound_lh_pulso (lh trip number pode vir vazio na fila
      // até o vínculo ser feito no sistema de origem).
      lh: lh ? {
        viagem: lh.viagem || '',
        numeroVeiculo: lh.numero_veiculo || '',
        lacre: lh.lacre || '',
        etaDestinoPlanejado: lh.eta_destino_planejado || '',
        checkinDestino: lh.checkin_destino || '',
        aberturaBau: lh.abertura_bau || '',
        inicioDescarga: lh.inicio_descarga || '',
        fimDescarga: lh.fim_descarga || '',
        totalPacotes: toNum(lh.total_pacotes),
        totalTos: toNum(lh.total_tos),
        pacotesSaca: toNum(lh.pacotes_saca),
        pacotesScuttle: toNum(lh.pacotes_scuttle),
        pacotesPallet: toNum(lh.pacotes_pallet),
        tosSaca: toNum(lh.tos_saca),
        tosScuttle: toNum(lh.tos_scuttle),
        tosPallet: toNum(lh.tos_pallet),
        tosOutros: toNum(lh.tos_outros),
        pacotesBulk: toNum(lh.pacotes_bulk),
        pacotesG: toNum(lh.pacotes_g),
        pacotesM: toNum(lh.pacotes_m),
        pacotesP: toNum(lh.pacotes_p),
        pacotesPP: toNum(lh.pacotes_pp),
        pacotesNaoClassificados: toNum(lh.pacotes_nao_classificados),
        solicitacaoAgrupado: lh.solicitation_agrupado || '',
        docaDescarga: lh.doca_descarga || '',
      } : null,
    };
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
  res.status(200).json({
    ok: true,
    dia,
    cobertura: { inicio: diasDisponiveis[0] || null, fim: diasDisponiveis[diasDisponiveis.length - 1] || null },
    rows: filas,
  });
}

module.exports = async (req, res) => {
  if (req.query.fila !== undefined) {
    await buildFila(req, res);
    return;
  }

  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const lh = rows.filter(r => r.cutoff_eta_planejado);
  if (!lh.length) {
    res.status(200).json({ ok: true, de: null, ate: null, rows: [], opcoes: { turnos: [], status: [], origens: [], veiculos: [], solicitacoes: [] }, cobertura: { inicio: null, fim: null } });
    return;
  }

  const datasDisponiveis = [...new Set(lh.map(r => r.cutoff_eta_planejado))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  // dataMaxima pode ser um ETA planejado futuro (viagem pré-agendada) — o
  // default tem que ser o dia real de hoje, não a data mais distante da
  // planilha (mesmo bug já corrigido no Outbound/Backlog).
  const hojeIso = hojeOperacionalIso();
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const de = (req.query.from && datasDisponiveis.includes(req.query.from)) ? req.query.from : padrao;
  const ate = (req.query.to && datasDisponiveis.includes(req.query.to) && req.query.to >= de) ? req.query.to : de;

  // Uma viagem tem 3 eventos com cutoff PRÓPRIO na planilha (podem cair em
  // dias operacionais diferentes entre si): cutoff_eta_planejado (chegada
  // planejada), cutoff_eta_realizado (chegada real) e cutoff_descarga (fim
  // do descarregamento — quando saca/scuttle fica disponível pra
  // processamento). Ex. real: ETA planejado 04:00 do dia 14 -> cutoff_eta
  // = dia 13, mas o descarregamento só terminou 07:52 do dia 14 -> cutoff_
  // descarga = dia 14. Retornar só quem bate por cutoff_eta_planejado
  // (como era antes) fazia o card "Sacas/Scuttles disponíveis por hora"
  // perder viagens cujo descarregamento terminou no dia certo mas cuja
  // chegada tinha sido planejada/contada no dia anterior — bug relatado
  // pelo Roberto em 2026-08-15 ("carros descarregados depois de meia-
  // noite do dia 14 devem contar pro dia 14"). Por isso a união: manda
  // pro front toda viagem que bate em QUALQUER um dos dois cutoffs, com
  // os dois campos expostos — cada view do front filtra pelo cutoff que
  // faz sentido pra ela (cutoffEtaPlanejado pra pontualidade/tabela,
  // cutoffDescarga pro card de sacas/scuttles).
  const doIntervalo = lh.filter(r =>
    (r.cutoff_eta_planejado >= de && r.cutoff_eta_planejado <= ate) ||
    (r.cutoff_descarga && r.cutoff_descarga >= de && r.cutoff_descarga <= ate)
  );

  const linhas = doIntervalo.map(r => {
    const planejado = parseDT(r.eta_destino_planejado);
    const realizado = parseDT(r.eta_destino_realizado);
    const atrasoMin = (planejado && realizado) ? Math.round((realizado - planejado) / 60000) : null;
    // Tempo de fila/descarga (confirmado com o Roberto em 2026-08-04):
    //   checkin_destino = chegada por telemetria
    //   abertura_bau    = momento em que o carro foi docado
    //   inicio_descarga / fim_descarga = início/fim do descarregamento
    // "Tempo de Fila" = checkin_destino -> fim_descarga (não é só a espera
    // pra iniciar a descarga, é o dwell time total até terminar — assim que
    // o Roberto definiu o card).
    const checkinDestino = parseDT(r.checkin_destino);
    const aberturaBau = parseDT(r.abertura_bau);
    const inicioDescarga = parseDT(r.inicio_descarga);
    const fimDescarga = parseDT(r.fim_descarga);
    const tempoFilaMin = (checkinDestino && fimDescarga) ? Math.round((fimDescarga - checkinDestino) / 60000) : null;
    const tempoDescargaMin = (inicioDescarga && fimDescarga) ? Math.round((fimDescarga - inicioDescarga) / 60000) : null;
    return {
      viagem: r.viagem,
      // Cutoff de cada evento, expostos separados pro front escolher o
      // certo por view (ver comentário acima de doIntervalo).
      cutoffEtaPlanejado: r.cutoff_eta_planejado || '',
      cutoffDescarga: r.cutoff_descarga || '',
      origem: r.origem || '',
      veiculo: r.veiculo_utilizado || '',
      // Turno = turno_chegada (coluna já calculada na planilha pelo horário
      // real de chegada) quando a LT já chegou; turno_planejado enquanto
      // ainda não chegou. Antes usava um recálculo próprio por hora — trocado
      // em 2026-08-14 porque turno_chegada já é a fonte oficial (evita
      // divergência entre o cálculo daqui e o que o resto da operação usa).
      turno: (r.eta_destino_realizado ? r.turno_chegada : r.turno_planejado) || r.turno_planejado || '',
      status: r.status_agrupado || '',
      horaPlanejada: toNum(r.hora_eta_ajustado),
      horaRealizada: r.hora_eta_destino_realizado !== '' ? toNum(r.hora_eta_destino_realizado) : null,
      planejado: r.eta_destino_planejado || '',
      realizado: r.eta_destino_realizado || '',
      realizada: !!r.eta_destino_realizado,
      // "Fechada" = descarga realizada (pedido do Roberto em 2026-08-14,
      // substitui o proxy antigo de "realizada" por eta_destino_realizado
      // pra decidir se a LT já foi atendida) — presença de fim_descarga.
      descarregada: !!fimDescarga,
      atrasoMin,
      onTime: atrasoMin !== null ? atrasoMin <= 0 : null,
      checkinDestino: r.checkin_destino || '',
      aberturaBau: r.abertura_bau || '',
      inicioDescarga: r.inicio_descarga || '',
      fimDescarga: r.fim_descarga || '',
      horaCheckin: horaDe(r.checkin_destino),
      tempoFilaMin,
      tempoDescargaMin,
      pacotes: toNum(r.total_pacotes),
      tos: toNum(r.total_tos),
      pacotesSaca: toNum(r.pacotes_saca),
      tosSaca: toNum(r.tos_saca),
      pacotesScuttle: toNum(r.pacotes_scuttle),
      tosScuttle: toNum(r.tos_scuttle),
      // G+Bulky e P+M somados (pedido do Roberto em 2026-08-04) — a aba não
      // tem contagem de TOs por tamanho (só existe tos_saca/scuttle/pallet/
      // outros/volumoso), por isso esses dois cards não têm TOs entre parênteses.
      pacotesGBulk: toNum(r.pacotes_g) + toNum(r.pacotes_bulk),
      pacotesPM: toNum(r.pacotes_p) + toNum(r.pacotes_m),
      solicitacao: r.solicitation_agrupado || '',
      // Hora em que a saca/scuttle fica disponível pra processamento = hora
      // do fim da descarga (não a chegada — só depois de descarregado o
      // conteúdo sai do caminhão) — pedido do Roberto em 2026-08-05.
      horaDescarga: r.hora_descarga !== '' ? toNum(r.hora_descarga) : null,
      docaDescarga: r.doca_descarga || '',
    };
  });

  const opcoes = {
    turnos: [...new Set(linhas.map(l => l.turno).filter(Boolean))].sort(),
    status: [...new Set(linhas.map(l => l.status).filter(Boolean))].sort(),
    origens: [...new Set(linhas.map(l => l.origem).filter(Boolean))].sort(),
    veiculos: [...new Set(linhas.map(l => l.veiculo).filter(Boolean))].sort(),
    solicitacoes: [...new Set(linhas.map(l => l.solicitacao).filter(Boolean))].sort(),
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
