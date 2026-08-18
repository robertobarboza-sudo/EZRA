/**
 * Helpers compartilhados entre as rotas de Outbound (aba rawdata_out_pulso —
 * viagens LH de SOC, acompanhamento de CPT/SLA).
 *
 * Turnos (confirmado com o Roberto em 2026-07-30): T1 06h–13h59, T2 14h–21h59,
 * T3 22h–05h59 (vira o dia), sem lacunas — cobrem as 24h em blocos de 8h.
 *
 * "Carregamento compartilhado": a aba não tem coluna própria pra isso.
 * Confirmado com o Roberto: um carro é compartilhado quando o ETA de origem
 * (início do carregamento, `eta_scheduled_origin_edited`/`eta_origin_scheduled`)
 * começa num turno e o CPT (`turno_shipped`) termina no turno IMEDIATAMENTE
 * seguinte (T1→T2, T2→T3, T3→T1) — corrigido em 2026-07-30: a versão
 * anterior marcava como compartilhado qualquer turno diferente, inclusive
 * combinações não-adjacentes (ex: ETA no T1 e CPT no T3, pulando o T2
 * inteiro), o que não representa uma passagem real de turno. Só turnos
 * consecutivos contam. Nesse caso o carro continua "pertencendo" ao
 * turno_shipped, mas também aparece na visão do turno do ETA (o turno
 * anterior, que começou a carregar o veículo) — ver `pertenceAoTurno`.
 */
const { toNum } = require('./_period');

function parseDT(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T') + 'Z');
  return isNaN(d) ? null : d;
}

const TURNO_ORDEM = ['T1', 'T2', 'T3'];
function turnoSeguinte(t) {
  const i = TURNO_ORDEM.indexOf(t);
  return i === -1 ? null : TURNO_ORDEM[(i + 1) % TURNO_ORDEM.length];
}

// Tipo de carregamento (pedido do Roberto em 2026-08-18, filtro multi-
// seleção na página Outbound): classifica destination_station_code pelo
// prefixo — mesma regra "solta" já usada na Esteira On-time
// (esteiraDestinoCategoria em api/cluster.js), só que sem reaproveitar
// aquela função pra não acoplar as duas páginas. HUB/XPT/SOC = prefixo
// bate; qualquer outro (parceiro 3PL) cai no "3PL".
function tipoCarregamento(destino) {
  const d = String(destino || '');
  if (/^HUB/i.test(d)) return 'HUB';
  if (/^XPT/i.test(d)) return 'XPT';
  if (/^SOC/i.test(d)) return 'SOC';
  return '3PL';
}

function turnoDeHora(hora) {
  if (hora >= 6 && hora <= 13) return 'T1';
  if (hora >= 14 && hora <= 21) return 'T2';
  return 'T3';
}

function turnoDeDataHora(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return null;
  return turnoDeHora(d.getUTCHours());
}

// Enriquece a linha com o turno do ETA de origem e se é compartilhada.
function enrich(r) {
  const etaRef = r.eta_scheduled_origin_edited || r.eta_origin_scheduled;
  const turnoEta = turnoDeDataHora(etaRef);
  const turnoCpt = r.turno_shipped || null;
  const compartilhado = !!(turnoEta && turnoCpt && turnoCpt !== turnoEta && turnoCpt === turnoSeguinte(turnoEta));
  return { ...r, __turnoEta: turnoEta, __compartilhado: compartilhado };
}

// Um carro aparece na visão de um turno se for o dono (turno_shipped) OU se
// for compartilhado e o turno bater com o turno do ETA (início do carregamento).
function pertenceAoTurno(r, turno) {
  return r.turno_shipped === turno || (r.__compartilhado && r.__turnoEta === turno);
}

function aggregate(rows) {
  const carrosPrevistos = rows.length;
  const porStatus = {};
  rows.forEach(r => { const s = r.status_agrupado || '—'; porStatus[s] = (porStatus[s] || 0) + 1; });

  // "Realizado" = tem cpt_realizado preenchido (decidido com o Roberto em
  // 2026-07-30) — não depende do texto de status_agrupado. Atraso médio em
  // minutos, positivo = atrasado, negativo = adiantado; "Atraso Médio (min)"
  // é a diferença média entre cpt_realizado e o CPT planejado
  // (cpt_scheduled_origin_edited), só entre os carros com os dois horários.
  // "Em Aberto" = sem cpt_realizado E não cancelado (decidido com o Roberto
  // em 2026-07-30) — mesmo espírito do "Realizado": não confia no texto de
  // status_agrupado sozinho, só usa CANCELADO pra tirar quem não conta mais
  // como em aberto.
  let carrosRealizados = 0, abertas = 0, cptOnTime = 0, cptComparaveis = 0, atrasoSomaMin = 0;
  rows.forEach(r => {
    if (!r.cpt_realizado) {
      if (r.status_agrupado !== 'CANCELADO') abertas++;
      return;
    }
    carrosRealizados++;
    const ref = r.cpt_scheduled_origin_edited || r.cpt_origin_scheduled;
    if (!ref) return;
    const dRef = new Date(String(ref).replace(' ', 'T') + 'Z');
    const dReal = new Date(String(r.cpt_realizado).replace(' ', 'T') + 'Z');
    if (isNaN(dRef) || isNaN(dReal)) return;
    cptComparaveis++;
    if (dReal <= dRef) cptOnTime++;
    atrasoSomaMin += (dReal - dRef) / 60000;
  });

  // Volume carregado (pacotes = orders_*, qty = to_* — quantidade de
  // sacas/scuttles unitizados) — pedido do Roberto em 2026-07-30, mesmo
  // padrão "valor + (qty)" dos outros cards de pacotes do PULSO.
  let pacotesSaca = 0, qtySaca = 0, pacotesScuttle = 0, qtyScuttle = 0;
  rows.forEach(r => {
    pacotesSaca += toNum(r.orders_saca);
    qtySaca += toNum(r.to_saca);
    pacotesScuttle += toNum(r.orders_scuttle);
    qtyScuttle += toNum(r.to_scuttle);
  });

  // ETA de destino: antecipação = eta planejado - eta realizado (positivo =
  // chegou antes do previsto); fila de chegada = tempo entre a chegada
  // (eta_destino_realizado) e o fim da descarga (unloaded_destination_datetime),
  // mesma definição já usada em Inbound Line Haul pra "tempo de fila".
  let chegadaAntecipada = 0, etaComparaveis = 0, antecipacaoSomaMin = 0, filaComparaveis = 0, filaSomaMin = 0;
  rows.forEach(r => {
    if (r.status_eta_destino === 'EARLY') chegadaAntecipada++;
    const etaPlan = parseDT(r.eta_destination_edited);
    const etaReal = parseDT(r.eta_destino_realizado);
    if (etaPlan && etaReal) {
      etaComparaveis++;
      antecipacaoSomaMin += (etaPlan - etaReal) / 60000;
    }
    const fimDescarga = parseDT(r.unloaded_destination_datetime);
    if (etaReal && fimDescarga) {
      filaComparaveis++;
      filaSomaMin += (fimDescarga - etaReal) / 60000;
    }
  });

  return {
    carrosPrevistos,
    carrosRealizados,
    canceladas: porStatus['CANCELADO'] || 0,
    infrutiferas: porStatus['INFRUTÍFERA'] || 0,
    naoConsumida: porStatus['NÃO CONSUMIDA'] || 0,
    noShow: porStatus['NO SHOW'] || 0,
    abertas,
    pctCptOnTime: cptComparaveis ? +(cptOnTime / cptComparaveis * 100).toFixed(1) : 0,
    cptComparaveis,
    taxaConclusao: carrosPrevistos ? +(carrosRealizados / carrosPrevistos * 100).toFixed(1) : 0,
    atrasoMedioMin: cptComparaveis ? Math.round(atrasoSomaMin / cptComparaveis) : 0,
    pacotesSaca, qtySaca,
    pacotesScuttle, qtyScuttle,
    chegadaAntecipada,
    etaComparaveis,
    antecipacaoMedioMin: etaComparaveis ? Math.round(antecipacaoSomaMin / etaComparaveis) : 0,
    tempoFilaMedioMin: filaComparaveis ? Math.round(filaSomaMin / filaComparaveis) : 0,
  };
}

function toCarroRow(r) {
  return {
    lh_trips: r.lh_trips,
    cutoff: r.cutoff,
    status_agrupado: r.status_agrupado,
    solicitation_by: r.solicitation_by,
    turno_shipped: r.turno_shipped,
    compartilhado: r.__compartilhado,
    origin: r.origin_station_code,
    destino: r.destination_station_code,
    used_vehicle: r.used_vehicle,
    used_agency_name: r.used_agency_name,
    cpt_planejado: r.cpt_scheduled_origin_edited,
    cpt_realizado: r.cpt_realizado,
    orders_saca: toNum(r.orders_saca),
    orders_scuttle: toNum(r.orders_scuttle),
    to_saca: toNum(r.to_saca),
    to_scuttle: toNum(r.to_scuttle),
    eta_planejado: r.eta_destination_edited,
    eta_realizado: r.eta_destino_realizado,
    status_eta: r.status_eta_destino,
    fim_descarga: r.unloaded_destination_datetime,
  };
}

module.exports = { turnoDeHora, turnoDeDataHora, enrich, pertenceAoTurno, aggregate, toCarroRow, tipoCarregamento };
