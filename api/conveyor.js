/**
 * PULSO — Conveyor: performance por grupo de estação, hora a hora (aba conveyor_pulso).
 *
 * Estrutura da aba mudou (confirmado com o Roberto em 2026-08-04): antes
 * cada linha vinha com `data` (BR) + `hora_extracao` + a estação crua (de
 * onde o grupo era inferido via regex no prefixo) + horas de trabalho +
 * produtividade. Agora (verificado ao vivo via debug-meta):
 *   - `data extração`  timestamp completo "YYYY-MM-DD HH:MM:SS" — é o
 *     horário em que o LOTE inteiro foi extraído (todas as linhas da aba
 *     têm o mesmo valor), não o horário de cada linha — só usamos a parte
 *     de DATA daqui; a hora de cada linha é a própria coluna `hora`.
 *   - `hora`            hora real a que a linha se refere (0-23)
 *   - `ops`/`nome ops`  id + nome do colaborador (nome é novo, não existia)
 *   - `workstation`/`nome ws`  código + nome do posto de trabalho
 *   - `esteira`         código do grupo JÁ vem pronto da planilha (ex.
 *     "P2", "POBC", "PTIN") — não precisa mais inferir via regex do nome
 *     da estação. Dois grupos novos apareceram: PTIN (Tintas) e
 *     P_TO-Audit (TO-Audit).
 *   - `pacotes`         substitui o antigo "total de processamento
 *     (pedidos)"; não existe mais "horas de trabalho"/"produtividade" —
 *     esses campos somem da página (não são mais calculáveis).
 *   - `turno`           novo, vem pronto por linha.
 *
 * Data operacional (cutoff 6h, ver api/_period.js): a data do lote não é
 * pré-bucketizada pro dia operacional, então combinamos data+hora aqui
 * (mesmo padrão de api/backlog.js e api/labor.js).
 *
 * Classificação esteira -> grupo de exibição:
 *   POBA/POBB -> OBA/OBB · POBC/POBD -> OBC/OBD · P4 -> Termoplástica
 *   P1 -> Esteira A · P2 -> Esteira B · PTIN -> Tintas
 *   P_TO-Audit -> TO-Audit · resto (ex: P_NON-TO) -> Non-TO
 *
 * Query params:
 *   date   YYYY-MM-DD (dia operacional a visualizar; default = hoje operacional)
 */
const { fetchTabByGid } = require('./_google');
const { toNum, dataOperacionalDe, hojeOperacionalIso } = require('./_period');

const SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1013894222' };
// Capacidade por hora (pedido do Roberto em 2026-08-21): soma de TARGET
// TERMO + TARGET ESTEIRA A + TARGET ESTEIRA B de labor_pulso — mesma aba
// já lida em api/overview.js pra Justificativas, aqui só agregada por hora
// (não por área) pra virar a linha "Capacidade" do gráfico do Conveyor.
const LABOR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1065816747' };
function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
async function getMetaPorHora(dataRef) {
  const { rows } = await fetchTabByGid(LABOR_SHEET.spreadsheetId, LABOR_SHEET.gid);
  const metaPorHora = Array(24).fill(0);
  rows.forEach(r => {
    if (r.hora === '' || r.hora === undefined) return;
    const dataIso = brToIso(r.data);
    if (dataIso === null) return;
    const hora = toNum(r.hora);
    const data = dataOperacionalDe(`${dataIso} ${String(hora).padStart(2, '0')}:00:00`);
    if (data !== dataRef) return;
    metaPorHora[hora] = toNum(r['target termo']) + toNum(r['target esteira a']) + toNum(r['target esteira b']);
  });
  return metaPorHora;
}
// SPP Scuttle (pedido do Roberto em 2026-08-19): lê cluster_pulso (mesma
// aba que api/outbound.js já cruza pra endereçamento) só pra essa média —
// aba "ao vivo", sem coluna de data/turno (aging calculado contra
// Date.now()), então o card não filtra por data/turno da tela Conveyor
// como os demais, é sempre o TO piso agora. Sem endpoint próprio (teto de
// 12 functions da Vercel).
const CLUSTER_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '646168208' };
async function sppScuttleAoVivo() {
  const { rows } = await fetchTabByGid(CLUSTER_SHEET.spreadsheetId, CLUSTER_SHEET.gid);
  const scuttles = rows.filter(r => r['to pack'] === 'Scuttle');
  if (!scuttles.length) return null;
  const soma = scuttles.reduce((s, r) => s + toNum(r.quantity), 0);
  return +(soma / scuttles.length).toFixed(1);
}

function classificarEsteira(esteira) {
  const e = String(esteira || '').toUpperCase();
  if (e === 'POBA' || e === 'POBB') return 'OBA/OBB';
  if (e === 'POBC' || e === 'POBD') return 'OBC/OBD';
  if (e === 'P4') return 'Termoplástica';
  if (e === 'P1') return 'Esteira A';
  if (e === 'P2') return 'Esteira B';
  if (e === 'PTIN') return 'Tintas';
  if (e === 'P_TO-AUDIT') return 'TO-Audit';
  return 'Non-TO';
}

module.exports = async (req, res) => {
  let rows;
  try {
    ({ rows } = await fetchTabByGid(SHEET.spreadsheetId, SHEET.gid));
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
    return;
  }

  const conveyor = rows
    .filter(r => r['data extração'] && r.hora !== '')
    .map(r => {
      const dataExtracao = String(r['data extração'] || '');
      const dataExtracaoIso = dataExtracao.slice(0, 10);
      const hora = toNum(r.hora);
      const dataIso = dataOperacionalDe(`${dataExtracaoIso} ${String(hora).padStart(2, '0')}:00:00`);
      return { ...r, dataIso, hora };
    })
    .filter(r => r.dataIso !== null);

  if (!conveyor.length) {
    res.status(200).json({
      ok: true, data: null, rows: [], grupos: [], sppScuttle: null,
      cobertura: { inicio: null, fim: null },
    });
    return;
  }

  const datasDisponiveis = [...new Set(conveyor.map(r => r.dataIso))].sort();
  const dataMinima = datasDisponiveis[0], dataMaxima = datasDisponiveis[datasDisponiveis.length - 1];
  const hojeIso = hojeOperacionalIso();
  const padrao = datasDisponiveis.includes(hojeIso) ? hojeIso : dataMaxima;
  const dataQuery = req.query.date;
  const dataRef = (dataQuery && datasDisponiveis.includes(dataQuery)) ? dataQuery : padrao;

  const doDia = conveyor.filter(r => r.dataIso === dataRef);

  // OPS em vez de nome (pedido do Roberto em 2026-08-19): identificação
  // padronizada pelo id da coluna `ops`, não expõe mais o nome do
  // colaborador (`nome ops`) em nenhuma tela do Conveyor.
  const linhas = doDia.map(r => ({
    hora: r.hora,
    opsId: r.ops || '',
    estacao: r.workstation || '',
    nomeEstacao: r['nome ws'] || '',
    grupo: classificarEsteira(r.esteira),
    turno: r.turno || '',
    totalProcessamento: toNum(r.pacotes),
  }));

  const grupos = ['OBA/OBB', 'OBC/OBD', 'Termoplástica', 'Esteira A', 'Esteira B', 'Tintas', 'TO-Audit', 'Non-TO'];

  let sppScuttle = null;
  try { sppScuttle = await sppScuttleAoVivo(); } catch (err) { /* card opcional, não derruba o Conveyor */ }

  let metaPorHora = null;
  try { metaPorHora = await getMetaPorHora(dataRef); } catch (err) { /* linha de capacidade é opcional, não derruba o Conveyor */ }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: true,
    data: dataRef,
    rows: linhas,
    grupos,
    sppScuttle,
    metaPorHora,
    cobertura: { inicio: dataMinima, fim: dataMaxima },
  });
};
