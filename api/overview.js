/**
 * PULSO — Overview: retrato acumulado da operação, juntando os números já
 * calculados pelas outras páginas. Blocos, nessa ordem (confirmado com o
 * Roberto em 2026-08-04):
 *   1. Backlog: atual (média/hora) + grupos de perfil + clusters de aging
 *      (mesmos grupos da página Backlog — ver PERFIL_GRUPOS/
 *      AGING_CLUSTER_OF abaixo, têm que ficar em sincronia com o mesmo
 *      mapeamento em index.html)
 *   2. Inbound Line Haul: carros previstos vs descarregados + em andamento
 *   3. Inbound First Mile: carros descarregados + em andamento
 *   4. ASM: realizado (scans) vs planejado até agora (labor_pulso asm
 *      target) + snapshot de capacidade (NV.1-3/zonas) da hora vigente
 *   5. Conveyor: realizado (pedidos) vs planejado até agora (labor_pulso
 *      packing esteira+volumoso) + snapshot de esteiras da hora vigente
 *   6. Outbound: carros carregados vs planejados na expedição, saca/scuttle
 *      separados (com TOs de cada), % de Clusterização e pacotes no piso
 *      (= pacotesTotal da Clusterização, o staging onde os TOs ficam
 *      endereçados aguardando expedição — por isso entra no bloco Outbound)
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

  // Outbound — carros carregados vs planejados na expedição, saca/scuttle
  // separados (com contagem de TOs de cada) e % de Clusterização/pacotes no
  // piso (piso = staging outbound, onde os TOs endereçados aguardam
  // expedição — por isso entram no bloco Outbound em vez de um bloco à parte).
  const outboundResumo = (outbound || cluster) ? {
    carrosPrevistos: outbound ? outbound.atual.carrosPrevistos : null,
    carrosRealizados: outbound ? outbound.atual.carrosRealizados : null,
    saca: outbound ? { pacotes: outbound.atual.pacotesSaca, tos: outbound.atual.qtySaca } : null,
    scuttle: outbound ? { pacotes: outbound.atual.pacotesScuttle, tos: outbound.atual.qtyScuttle } : null,
    pacotesNoPiso: cluster ? cluster.atual.pacotesTotal : null,
    pctClusterizacao: cluster ? cluster.atual.pctClusterizacao : null,
  } : null;

  // Inbound Line Haul — previstos vs descarregados (fim_descarga preenchido) + em andamento
  const lhRows = lh ? lh.rows : [];
  const lineHaul = lh ? {
    previstos: lhRows.length,
    descarregados: lhRows.filter(r => r.fimDescarga).length,
    andamento: lhRows.filter(r => r.checkinDestino && !r.fimDescarga).length,
  } : null;

  // Inbound First Mile — descarregados (finalização de jornada preenchida) + em andamento
  const fmRows = fm ? fm.rows : [];
  const firstMile = fm ? {
    descarregados: fmRows.filter(r => r.finalizacaoJornada).length,
    andamento: fmRows.filter(r => r.checkinDriver && !r.finalizacaoJornada).length,
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

  // ASM e Conveyor — realizado no dia (soma bruta, são contadores de volume,
  // não uma leitura pontual) vs planejado ATÉ AGORA (soma do labor_pulso só
  // das horas que já passaram — comparar contra o planejado do dia inteiro
  // sempre pareceria "atrasado" de manhã, mesmo no ritmo certo). Horário de
  // Brasília fixo (UTC-3, mesma conta de hojeOperacionalIso em _period.js).
  // NV.1-3 (ASM) e Esteiras/Esteira Termo (Conveyor) não entram na
  // comparação de volume (são níveis de equipe/equipamento) — viram um
  // snapshot da hora vigente em cada bloco.
  const horaAgora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const laborAteAgora = labor ? labor.rows.filter(r => r.hora <= horaAgora) : [];
  const laborAgora = labor && labor.rows.length
    ? (labor.rows.find(r => r.hora === horaAgora) || [...labor.rows].sort((a, b) => Math.abs(a.hora - horaAgora) - Math.abs(b.hora - horaAgora))[0])
    : null;

  const asmRealizado = asm ? asm.rows.reduce((s, r) => s + r.scanNumbers, 0) : null;
  const asmPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.asmTarget, 0)) : null;
  const asmResumo = (asm || labor) ? {
    realizado: asmRealizado,
    planejado: asmPlanejado,
    pctAtingimento: asmPlanejado ? Math.round((asmRealizado ?? 0) / asmPlanejado * 100) : null,
    capacidadeAgora: laborAgora ? { hora: laborAgora.hora, nv1: laborAgora.nv1, nv2: laborAgora.nv2, nv3: laborAgora.nv3, zonas: laborAgora.asmZonas } : null,
  } : null;

  const conveyorRealizado = conveyor ? conveyor.rows.reduce((s, r) => s + r.totalProcessamento, 0) : null;
  const conveyorPlanejado = labor ? Math.round(laborAteAgora.reduce((s, r) => s + r.packingEsteira + r.packingVolumoso, 0)) : null;
  const conveyorResumo = (conveyor || labor) ? {
    realizado: conveyorRealizado,
    planejado: conveyorPlanejado,
    pctAtingimento: conveyorPlanejado ? Math.round((conveyorRealizado ?? 0) / conveyorPlanejado * 100) : null,
    capacidadeAgora: laborAgora ? { hora: laborAgora.hora, esteiras: laborAgora.esteiras, esteiraTermo: laborAgora.esteiraTermo } : null,
  } : null;

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    outbound: outboundResumo, lineHaul, firstMile,
    asm: asmResumo, conveyor: conveyorResumo,
    backlog: backlogResumo,
    erros: Object.keys(erros).length ? erros : null,
  });
};
