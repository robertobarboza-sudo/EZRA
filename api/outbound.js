/**
 * PULSO — Outbound: acompanhamento de CPT/SLA (aba rawdata_out_pulso).
 *
 * Uma página só, dois modos (decidido com o Roberto em 2026-07-30):
 *   - "hoje" (padrão, sem `de`/`ate` na query): filtro fixo na data atual de
 *     verdade (relógio do servidor, não o cutoff mais recente da planilha —
 *     corrigido em 2026-07-30: a planilha pode ter cutoffs futuros
 *     pré-planejados, então "o cutoff mais recente" não é "hoje").
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

  const enriquecidas = rows.filter(r => r.cutoff).map(enrich);

  const cutoffs = enriquecidas.map(r => r.cutoff).sort();
  const dataMinima = cutoffs[0];
  const dataMaxima = cutoffs[cutoffs.length - 1];

  const deQuery = req.query.de || '';
  const ateQuery = req.query.ate || '';
  const modo = (deQuery || ateQuery) ? 'historico' : 'hoje';

  let inicio, fim;
  if (modo === 'hoje') {
    inicio = fim = new Date().toISOString().slice(0, 10);
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

  const passaFiltros = r =>
    (!turnos.length || turnos.some(t => pertenceAoTurno(r, t))) &&
    (!status.length || status.includes(r.status_agrupado)) &&
    (!solicitantes.length || solicitantes.includes(r.solicitation_by)) &&
    (!destinos.length || destinos.includes(r.destination_station_code)) &&
    (!agencias.length || agencias.includes(r.used_agency_name)) &&
    (!veiculos.length || veiculos.includes(r.used_vehicle)) &&
    (!busca || String(r.lh_trips || '').toLowerCase().includes(busca));

  const filtradas = doIntervalo.filter(passaFiltros);
  const atual = aggregate(filtradas);

  const LIMITE = 500;
  const ordenadas = modo === 'hoje'
    ? [...filtradas].sort((a, b) => String(a.hora_cpt_planejado || '99').localeCompare(String(b.hora_cpt_planejado || '99')))
    : [...filtradas].sort((a, b) => (b.cutoff || '').localeCompare(a.cutoff || ''));
  const carros = ordenadas.slice(0, LIMITE).map(toCarroRow);

  const uniq = key => [...new Set(doIntervalo.map(r => r[key]).filter(Boolean))].sort();

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    modo,
    intervalo: { inicio, fim },
    cobertura: { inicio: dataMinima, fim: dataMaxima },
    atual,
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
