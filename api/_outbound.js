/**
 * Helpers compartilhados entre api/outbound-ontime.js e api/outbound-historico.js
 * (aba rawdata_out_pulso — viagens LH de SOC, acompanhamento de CPT/SLA).
 *
 * Turnos (confirmado com o Roberto em 2026-07-30): T1 06h–13h59, T2 14h–21h59,
 * T3 22h–05h59 (vira o dia), sem lacunas — cobrem as 24h em blocos de 8h.
 *
 * "Carregamento compartilhado": a aba não tem coluna própria pra isso.
 * Confirmado com o Roberto: um carro é compartilhado quando o ETA de origem
 * (início do carregamento, `eta_scheduled_origin_edited`/`eta_origin_scheduled`)
 * cai num turno diferente do turno do CPT (`turno_shipped`, já vem pronto na
 * planilha). Nesse caso o carro continua "pertencendo" ao turno_shipped, mas
 * também precisa aparecer na visão do turno do ETA (o turno anterior, que
 * começou a carregar o veículo) — ver `pertenceAoTurno`.
 */
const { toNum } = require('./_period');

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
  const compartilhado = !!(turnoEta && turnoCpt && turnoEta !== turnoCpt);
  return { ...r, __turnoEta: turnoEta, __compartilhado: compartilhado };
}

// Um carro aparece na visão de um turno se for o dono (turno_shipped) OU se
// for compartilhado e o turno bater com o turno do ETA (início do carregamento).
function pertenceAoTurno(r, turno) {
  return r.turno_shipped === turno || (r.__compartilhado && r.__turnoEta === turno);
}

const STATUS_REALIZADO = 'FECHADA';

function aggregate(rows) {
  const carrosPrevistos = rows.length;
  const porStatus = {};
  rows.forEach(r => { const s = r.status_agrupado || '—'; porStatus[s] = (porStatus[s] || 0) + 1; });

  // SLA de CPT calculado por conta própria (não confia no status_cpt da
  // planilha — decidido com o Roberto em 2026-07-30): entre as viagens
  // FECHADAS com CPT planejado e realizado preenchidos, quantas saíram
  // dentro do prazo (cpt_realizado <= cpt_scheduled_origin_edited).
  let cptOnTime = 0, cptComparaveis = 0;
  rows.forEach(r => {
    if (r.status_agrupado !== STATUS_REALIZADO) return;
    const ref = r.cpt_scheduled_origin_edited || r.cpt_origin_scheduled;
    const real = r.cpt_realizado;
    if (!ref || !real) return;
    const dRef = new Date(String(ref).replace(' ', 'T') + 'Z');
    const dReal = new Date(String(real).replace(' ', 'T') + 'Z');
    if (isNaN(dRef) || isNaN(dReal)) return;
    cptComparaveis++;
    if (dReal <= dRef) cptOnTime++;
  });

  return {
    carrosPrevistos,
    carrosRealizados: porStatus[STATUS_REALIZADO] || 0,
    canceladas: porStatus['CANCELADO'] || 0,
    infrutiferas: porStatus['INFRUTÍFERA'] || 0,
    naoConsumida: porStatus['NÃO CONSUMIDA'] || 0,
    noShow: porStatus['NO SHOW'] || 0,
    abertas: porStatus['ABERTA'] || 0,
    pctCptOnTime: cptComparaveis ? +(cptOnTime / cptComparaveis * 100).toFixed(1) : 0,
    cptComparaveis,
  };
}

function toCarroRow(r) {
  return {
    lh_trips: r.lh_trips,
    cutoff: r.cutoff,
    status_agrupado: r.status_agrupado,
    turno_shipped: r.turno_shipped,
    compartilhado: r.__compartilhado,
    origin: r.origin_station_code,
    destino: r.destination_station_code,
    used_vehicle: r.used_vehicle,
    used_agency_name: r.used_agency_name,
    cpt_planejado: r.cpt_scheduled_origin_edited,
    cpt_realizado: r.cpt_realizado,
  };
}

module.exports = { turnoDeHora, turnoDeDataHora, enrich, pertenceAoTurno, aggregate, toCarroRow, STATUS_REALIZADO };
