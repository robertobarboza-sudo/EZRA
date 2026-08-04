/**
 * PULSO — Overview: retrato acumulado da operação, juntando os números já
 * calculados pelas outras páginas (confirmado com o Roberto em 2026-08-04):
 *   - Outbound: carros carregados vs planejados na expedição
 *   - Inbound Line Haul: carros previstos vs descarregados
 *   - Inbound First Mile: carros descarregados
 *   - Carros em andamento (LH + FM somados: já chegou, ainda não descarregou)
 *   - % de atendimento da Clusterização
 *   - Pacotes no piso de outbound (= pacotesTotal da Clusterização, o piso
 *     de staging onde os TOs ficam endereçados aguardando expedição)
 *   - Backlog atual, entre perfis e clusters de aging (mesmos grupos da
 *     página Backlog — ver PERFIL_GRUPOS/AGING_CLUSTER_OF abaixo, têm que
 *     ficar em sincronia com o mesmo mapeamento em index.html)
 *   - Performance do ASM e do Conveyor somados: realizado (scans/pedidos do
 *     dia) vs planejado (labor_pulso: asm target / packing esteira+volumoso)
 *
 * Em vez de duplicar a lógica de negócio de cada página (residuo, correção
 * de clusterização, etc.), esse endpoint chama as próprias APIs irmãs via
 * HTTP interno (mesmo deployment) e só agrega os números que elas já
 * calculam — Outbound/Clusterização/ASM/Conveyor/Inbound LH/FM/Backlog já
 * resolvem sozinhos "hoje operacional" (cutoff 6h, ver api/_period.js),
 * então aqui não passamos nenhum filtro de data, só lemos o default de cada
 * uma. Cada chamada é isolada em try/catch — a queda de uma fonte não
 * derruba o Overview inteiro, só zera aquele bloco (`erros` sinaliza qual).
 */
const { fetchTabByGid } = require('./_google');
const { toNum, dataOperacionalDe, hojeOperacionalIso } = require('./_period');

// Planejamento de capacidade (labor_pulso) — inline em vez de um endpoint
// próprio (api/labor.js): Overview é o único consumidor hoje, e o limite de
// 12 funções serverless do plano Hobby da Vercel não sobra pra um endpoint
// dedicado só pra isso (confirmado com o Roberto em 2026-08-04, erro real
// de deploy). Se um dia existir uma página Labor Plan de verdade, separar
// de novo faz sentido — até lá, menos um function slot gasto.
const LABOR_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '1065816747' };
function brToIso(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
async function getLabor() {
  const { rows } = await fetchTabByGid(LABOR_SHEET.spreadsheetId, LABOR_SHEET.gid);
  const labor = rows
    .filter(r => r.data && r.hora !== '')
    .map(r => {
      const dataIso = brToIso(r.data);
      if (dataIso === null) return null;
      const hora = toNum(r.hora);
      const data = dataOperacionalDe(`${dataIso} ${String(hora).padStart(2, '0')}:00:00`);
      return {
        data, hora,
        asmTarget: toNum(r['asm target']),
        asmZonas: toNum(r['asm (zonas)']),
        esteiraTermo: toNum(r['esteira termo']),
        esteiras: toNum(r.esteiras),
        nv1: toNum(r['nv.1']), nv2: toNum(r['nv.2']), nv3: toNum(r['nv.3']),
        packingEsteira: toNum(r['packing esteira']),
        packingVolumoso: toNum(r['packing volumoso']),
      };
    })
    .filter(Boolean);
  if (!labor.length) return { rows: [] };
  const datasDisponiveis = [...new Set(labor.map(r => r.data))].sort();
  const hojeIso = hojeOperacionalIso();
  const dataRef = datasDisponiveis.includes(hojeIso) ? hojeIso : datasDisponiveis[datasDisponiveis.length - 1];
  return { rows: labor.filter(r => r.data === dataRef).sort((a, b) => a.hora - b.hora) };
}

const PERFIL_GRUPOS = [
  { label: 'P', match: p => p === 'P' },
  { label: 'M', match: p => p === 'M' },
  { label: 'G', match: p => p === 'G' },
  { label: 'Bulky + Ração + S/Class', match: p => p === 'BULKY' || p === 'RAÇÃO' || p === 'S/CLASS' },
  { label: 'Tinta + Líquido', match: p => p === 'TINTA' || p === 'LIQUIDO' },
];
const AGING_CLUSTER_OF = { '0-1h': '0-4h', '1-2h': '0-4h', '2-4h': '0-4h', '4-8h': '4-24h', '8-24h': '4-24h', '>24h': '>24h' };
const AGING_CLUSTERS = ['0-4h', '4-24h', '>24h'];

async function getJson(base, path) {
  const r = await fetch(base + path, { headers: { 'x-overview-internal': '1' } });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro || (path + ' respondeu erro'));
  return j;
}

module.exports = async (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;
  const erros = {};
  const safe = async (nome, fn) => {
    try { return await fn(); } catch (err) { erros[nome] = err.message; return null; }
  };

  const [outbound, cluster, lh, fm, backlog, asm, conveyor, labor] = await Promise.all([
    safe('outbound', () => getJson(base, '/api/outbound')),
    safe('cluster', () => getJson(base, '/api/cluster')),
    safe('inboundLh', () => getJson(base, '/api/inbound-lh')),
    safe('inboundFm', () => getJson(base, '/api/inbound-fm')),
    safe('backlog', () => getJson(base, '/api/backlog')),
    safe('asm', () => getJson(base, '/api/asm')),
    safe('conveyor', () => getJson(base, '/api/conveyor')),
    safe('labor', () => getLabor()),
  ]);

  // Outbound — carros carregados vs planejados na expedição
  const expedicao = outbound ? {
    carrosPrevistos: outbound.atual.carrosPrevistos,
    carrosRealizados: outbound.atual.carrosRealizados,
    pacotesSaca: outbound.atual.pacotesSaca,
    pacotesScuttle: outbound.atual.pacotesScuttle,
  } : null;

  // Inbound Line Haul — previstos vs descarregados (fim_descarga preenchido) + em andamento
  const lhRows = lh ? lh.rows : [];
  const lhDescarregados = lhRows.filter(r => r.fimDescarga).length;
  const lhAndamento = lhRows.filter(r => r.checkinDestino && !r.fimDescarga).length;
  const lineHaul = lh ? { previstos: lhRows.length, descarregados: lhDescarregados, andamento: lhAndamento } : null;

  // Inbound First Mile — descarregados (finalização de jornada preenchida) + em andamento
  const fmRows = fm ? fm.rows : [];
  const fmDescarregados = fmRows.filter(r => r.finalizacaoJornada).length;
  const fmAndamento = fmRows.filter(r => r.checkinDriver && !r.finalizacaoJornada).length;
  const firstMile = fm ? { descarregados: fmDescarregados, andamento: fmAndamento } : null;

  const carrosAndamento = lhAndamento + fmAndamento;

  // Clusterização — % de atendimento (pctClusterizacao) + pacotes no piso de outbound
  const clusterizacao = cluster ? {
    pctClusterizacao: cluster.atual.pctClusterizacao,
    pacotesNoPiso: cluster.atual.pacotesTotal,
  } : null;

  // Backlog — média por hora (mesma lógica de bklQtdMedia em index.html: soma
  // ÷ horas do dia, nunca soma crua, senão infla contando a mesma fila várias
  // vezes), quebrado por grupo de perfil e por cluster de aging.
  let backlogResumo = null;
  if (backlog) {
    const horas = backlog.opcoes.horas.length || 1;
    const media = rows => Math.round(rows.reduce((s, r) => s + r.qtdPacotes, 0) / horas);
    backlogResumo = {
      total: media(backlog.rows),
      perfis: PERFIL_GRUPOS.map(pg => ({ label: pg.label, qtd: media(backlog.rows.filter(r => pg.match(r.perfil))) })),
      clusters: AGING_CLUSTERS.map(c => ({ label: c, qtd: media(backlog.rows.filter(r => AGING_CLUSTER_OF[r.faixaAging] === c)) })),
    };
  }

  // ASM + Conveyor — realizado no dia (soma bruta, são contadores de volume,
  // não uma leitura pontual) vs planejado ATÉ AGORA (soma do labor_pulso só
  // das horas que já passaram — comparar contra o planejado do dia inteiro
  // sempre pareceria "atrasado" de manhã, mesmo no ritmo certo). Horário de
  // Brasília fixo (UTC-3, mesma conta de hojeOperacionalIso em _period.js).
  // NV.1-3/esteiras não entram na comparação (são níveis de equipe, não
  // volume) — viram só um snapshot da hora vigente (ou a mais próxima
  // disponível, pra planejamento pré-carregado do dia inteiro).
  const horaAgora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const asmRealizado = asm ? asm.rows.reduce((s, r) => s + r.scanNumbers, 0) : null;
  const conveyorRealizado = conveyor ? conveyor.rows.reduce((s, r) => s + r.totalProcessamento, 0) : null;
  const laborAteAgora = labor ? labor.rows.filter(r => r.hora <= horaAgora) : [];
  const asmPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.asmTarget, 0)) : null;
  const conveyorPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.packingEsteira + r.packingVolumoso, 0)) : null;
  const capacidadeAgora = labor && labor.rows.length
    ? (labor.rows.find(r => r.hora === horaAgora) || [...labor.rows].sort((a, b) => Math.abs(a.hora - horaAgora) - Math.abs(b.hora - horaAgora))[0])
    : null;

  const performance = {
    asm: { realizado: asmRealizado, planejado: asmPlanejado },
    conveyor: { realizado: conveyorRealizado, planejado: conveyorPlanejado },
    somado: {
      realizado: (asmRealizado ?? 0) + (conveyorRealizado ?? 0),
      planejado: (asmPlanejado ?? 0) + (conveyorPlanejado ?? 0),
    },
    capacidadeAgora: capacidadeAgora ? {
      hora: capacidadeAgora.hora,
      nv1: capacidadeAgora.nv1, nv2: capacidadeAgora.nv2, nv3: capacidadeAgora.nv3,
      asmZonas: capacidadeAgora.asmZonas,
      esteiras: capacidadeAgora.esteiras, esteiraTermo: capacidadeAgora.esteiraTermo,
    } : null,
  };

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    expedicao, lineHaul, firstMile, carrosAndamento,
    clusterizacao, backlog: backlogResumo, performance,
    erros: Object.keys(erros).length ? erros : null,
  });
};
