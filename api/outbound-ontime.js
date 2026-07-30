/**
 * PULSO — Outbound On-time: visão "ao vivo" do CPT, sempre no cutoff mais
 * recente da base (equivalente a "hoje" — decidido com o Roberto em
 * 2026-07-30, mesmo padrão da Clusterização: sem seletor de data/dim). Foco
 * gerencial: o usuário escolhe seu turno e vê os carros previstos pra
 * carregar, incluindo os compartilhados vindos do turno anterior (ver
 * api/_outbound.js).
 *
 * Query params (afetam cards e a tabela de carros):
 *   turno                  lista separada por vírgula (T1,T2,T3)
 *   destino, agencia, veiculo   listas separadas por vírgula
 *   q                      busca livre em lh_trips
 */
const { fetchTabByGid } = require('./_google');
const { parseCSV } = require('./_period');
const { enrich, pertenceAoTurno, aggregate, toCarroRow } = require('./_outbound');

const OUTBOUND_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '0' };

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(OUTBOUND_SHEET.spreadsheetId, OUTBOUND_SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  // status=DESCONSIDERAR são registros administrativamente excluídos —
  // fora de qualquer visão (On-time ou Histórico).
  const consideradas = rows.filter(r => r.status !== 'DESCONSIDERAR').map(enrich);

  const refCutoff = consideradas.reduce((max, r) => (r.cutoff && (!max || r.cutoff > max)) ? r.cutoff : max, null);
  const doDia = consideradas.filter(r => r.cutoff === refCutoff);

  const turnos = parseCSV(req.query.turno);
  const destinos = parseCSV(req.query.destino);
  const agencias = parseCSV(req.query.agencia);
  const veiculos = parseCSV(req.query.veiculo);
  const busca = (req.query.q || '').trim().toLowerCase();

  const passaFiltros = r =>
    (!turnos.length || turnos.some(t => pertenceAoTurno(r, t))) &&
    (!destinos.length || destinos.includes(r.destination_station_code)) &&
    (!agencias.length || agencias.includes(r.used_agency_name)) &&
    (!veiculos.length || veiculos.includes(r.used_vehicle)) &&
    (!busca || String(r.lh_trips || '').toLowerCase().includes(busca));

  const filtradas = doDia.filter(passaFiltros);
  const atual = aggregate(filtradas);

  const LIMITE = 500;
  const ordenadas = [...filtradas].sort((a, b) => String(a.hora_cpt_planejado || '99').localeCompare(String(b.hora_cpt_planejado || '99')));
  const carros = ordenadas.slice(0, LIMITE).map(toCarroRow);

  const uniq = key => [...new Set(doDia.map(r => r[key]).filter(Boolean))].sort();

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    cutoff: refCutoff,
    atual,
    carros, carrosTotal: filtradas.length,
    opcoesFiltro: {
      turno: ['T1', 'T2', 'T3'],
      destino: uniq('destination_station_code'),
      agencia: uniq('used_agency_name'),
      veiculo: uniq('used_vehicle'),
    },
  });
};
