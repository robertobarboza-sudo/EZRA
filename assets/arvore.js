/* ================================================================
   ÁRVORE DE KPI'S — porte do bundle React "arvore-kpis" (versão final,
   enviada pelo Roberto em 2026-08-13) pro template do site, em JS puro.

   Substitui a antiga "Árvore (daily)", que era um espelho ESTÁTICO da
   planilha colado aqui dentro. Os dados vêm ao vivo da aba árvore_pulso,
   via /api/overview?arvore=1 (ver api/_arvore.js — mora dentro do overview
   por causa do teto de 12 funções serverless da Vercel).

   Conexões confirmadas com o Roberto em 2026-08-13 (aba árvore_pulso):
     Data        -> filtro de Mês/Semana + colunas de dia
     Bloco       -> filtro de Bloco
     PIC         -> filtro de PIC
     Semana      -> filtro de Semana + colunas de semana
     Target      -> cards de Target (resumo do drawer)
     Valor       -> os números da tabela/gráficos
     Observação  -> aba "Insights" do drawer (não confundir com a aba
                    "Insights (COP Boy)", que é gerada a partir dos números)
     Link        -> hiperlink junto do nome do KPI (ícone de fonte)

   A subpágina "Configurações" do bundle não entrou (pedido do Roberto) — a
   única preferência que ela controlava era a margem de "estável" na
   tendência, que aqui é fixa (ver ARV_TREND_MULT).
================================================================ */
let ARV_DATA = null;        // resposta crua do endpoint
let ARV_LOADING = false;
let ARV_SUBPAGE = 'arvore'; // arvore | visao | historico
let ARV_SEL_ISO = null;     // dia selecionado (coluna destacada / base dos cálculos)
let ARV_SEL_KPI = null;     // KPI aberto no drawer
let ARV_FILTROS = { busca: '', bloco: '', pic: '' };
let ARV_MESES_SEL = [];     // [] = ainda no padrão (mês atual + anterior) — ver arvEffectiveMonths
let ARV_MESES_TOCADO = false; // true assim que o usuário mexe no filtro de Mês (vazio passa a significar "todos")
let ARV_SEMANAS_SEL = [];   // [] = todas as semanas dos meses efetivos
let ARV_SEMANAS_ABERTAS = new Set(); // semanas expandidas (mostrando os dias)
let ARV_INSIGHT_TAB = 'auto'; // manual | auto — reaberto a cada troca de KPI no drawer
let ARV_HIST_SEL = [];      // ids dos KPIs comparados no Histórico
let ARV_HIST_PERIODO = '30';
let ARV_HIST_FILTRO = { busca: '', bloco: '' };
let ARV_CHART = null;       // instância Chart.js do drawer (destruída a cada abertura)
let ARV_CHART_HIST = null;

const ARV_LARG = { bloco: 34, pic: 92, sub: 132, kpi: 230, target: 68, ref: 74, semana: 74, dia: 48 };
const ARV_PALETA = ['#ee4d2d', '#1e8e3e', '#1a73e8', '#b15c00', '#8b5cf6', '#0ea5a4', '#d93025', '#6b7280'];
const ARV_PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Tudo']];
const ARV_MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ── status (5 rótulos, porte de utils/status.js do bundle) ────
   Única camada de cálculo de status da página — tabela, drawer, turnos,
   Visão Geral e insights usam esta mesma função pra nunca divergir. */
const ARV_STATUS5 = {
  in_target:            { key:'in_target',            text:'Dentro do Target',              dot:'🟢', color:'ok' },
  in_target_stable:     { key:'in_target_stable',      text:'Dentro do target estável',       dot:'🟢', color:'ok' },
  in_target_worsening:  { key:'in_target_worsening',   text:'Dentro do target piorando',      dot:'🟡', color:'warn' },
  out_target_improving: { key:'out_target_improving',  text:'Fora do target melhorando',      dot:'🟡', color:'warn' },
  out_target_worsening: { key:'out_target_worsening',  text:'Fora do target piorando',        dot:'🔴', color:'bad' },
  na:                   { key:'na',                    text:'Sem dado',                       dot:'⚪', color:'na' },
};
const ARV_TREND_MULT = 1; // margem (multiplicador) que define "estável" — era ajustável em Configurações no bundle, aqui é fixo
function arvValor(kpi, chave){
  const v = kpi.valores[chave];
  return v === undefined ? null : v;
}
function arvIsWithinTarget(kpi, v){
  if(v === null || v === undefined || kpi.target === null || kpi.target === undefined) return null;
  if(kpi.polarity === 'near_zero') return Math.abs(v) <= Math.abs(kpi.target);
  if(kpi.polarity === 'lower_better') return v <= kpi.target;
  return v >= kpi.target;
}
function arvTrend(kpi, delta){
  if(delta === null || delta === undefined) return 'stable';
  const base = kpi.unit === 'percent' ? 0.001 : Math.max(Math.abs(kpi.target) || 0, 1) * 0.01;
  const th = base * ARV_TREND_MULT;
  if(delta > th) return 'up';
  if(delta < -th) return 'down';
  return 'stable';
}
// value/compareValue -> um dos 6 status. compareValue costuma ser D-1; sem
// ele disponível, a tendência é tratada como estável (não inventa melhora/piora).
function arvStatusLabel(kpi, value, compareValue){
  const within = arvIsWithinTarget(kpi, value);
  if(within === null) return ARV_STATUS5.na;
  let trendState = 'stable';
  if(compareValue !== null && compareValue !== undefined){
    const d = value - compareValue;
    const trend = arvTrend(kpi, d);
    if(trend !== 'stable'){
      if(kpi.polarity === 'near_zero') trendState = Math.abs(value) < Math.abs(compareValue) ? 'improving' : 'worsening';
      else {
        const goingUp = trend === 'up';
        trendState = (kpi.polarity === 'lower_better' ? !goingUp : goingUp) ? 'improving' : 'worsening';
      }
    }
  }
  if(within){
    if(trendState === 'stable') return ARV_STATUS5.in_target_stable;
    if(trendState === 'worsening') return ARV_STATUS5.in_target_worsening;
    return ARV_STATUS5.in_target;
  }
  return trendState === 'improving' ? ARV_STATUS5.out_target_improving : ARV_STATUS5.out_target_worsening;
}
function arvPrevPeriodKey(colKey){
  return colKey.indexOf('-') !== -1 ? arvAddDias(colKey, -1) : arvPrevWeekLabel(colKey);
}
function arvPrevWeekLabel(label){
  const n = parseInt(String(label).replace(/^W/, ''), 10);
  return (!isFinite(n) || n <= 2) ? null : 'W' + (n - 1);
}
function arvFmtValor(kpi, v){
  if(v === null || v === undefined) return '—';
  if(kpi.unit === 'percent') return (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : 1 });
}
function arvFmtTarget(kpi){
  return kpi.target === null || kpi.target === undefined ? '—' : arvFmtValor(kpi, kpi.target);
}
function arvDelta(atual, anterior){
  if(atual === null || anterior === null || atual === undefined || anterior === undefined) return null;
  return atual - anterior;
}
function arvMelhorou(kpi, d){
  if(d === null || Math.abs(d) < 1e-9) return null;
  if(kpi.polarity === 'lower_better') return d < 0;
  if(kpi.polarity === 'near_zero') return false;
  return d > 0;
}
function arvFmtDelta(kpi, d){
  if(d === null) return '—';
  if(kpi.unit === 'percent') return (d > 0 ? '+' : '') + (d * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' p.p.';
  return (d > 0 ? '+' : '') + arvFmtValor(kpi, d).replace('—', '0');
}
function arvToneDelta(kpi, d){
  const m = arvMelhorou(kpi, d);
  return m === true ? 'arv-up' : m === false ? 'arv-down' : 'arv-flat';
}
function arvAddDias(iso, n){
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function arvFmtDataCurta(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'; }
function arvFmtDataLonga(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
function arvFmtMes(monthKey){ const [y,m] = monthKey.split('-').map(Number); return ARV_MESES_PT[m-1] + ' ' + y; }
function arvDia(iso){ return (ARV_DATA.days || []).find(d => d.iso === iso) || null; }
function arvHojeReal(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function arvTurnoEntries(kpi, colKey){
  if(!kpi.turnoRefs) return [];
  return Object.keys(kpi.turnoRefs).sort().map(tKey => {
    const sibling = (ARV_DATA.kpis || []).find(k => k.id === kpi.turnoRefs[tKey]);
    const value = sibling ? arvValor(sibling, colKey) : null;
    const prevValue = sibling ? arvValor(sibling, arvPrevPeriodKey(colKey)) : null;
    const statusLabel = sibling ? arvStatusLabel(sibling, value, prevValue) : ARV_STATUS5.na;
    return { turno: tKey, kpi: sibling, value, statusLabel };
  });
}
// Conta quantos períodos diários consecutivos (terminando no mais recente)
// se movem na mesma direção de melhora/piora.
function arvTrendStreak(kpi, trailingValues){
  const nums = (trailingValues || []).filter(v => v !== null && v !== undefined);
  if(nums.length < 3) return null;
  let dir = null, count = 0;
  for(let i = nums.length - 1; i > 0; i--){
    const d = nums[i] - nums[i-1];
    if(Math.abs(d) < 1e-9) break;
    const imp = arvMelhorou(kpi, d);
    if(imp === null) break;
    if(dir === null) dir = imp; else if(imp !== dir) break;
    count++;
  }
  return count >= 2 ? { improved: dir, periods: count + 1 } : null;
}

/* ── carga ──────────────────────────────────────────────────── */
function renderArvore(){
  if(!ARV_DATA){ arvLoad(); return; }
  arvRenderAtual();
  setBadge('arvore', 'ok', 'árvore_pulso');
}
async function arvLoad(force){
  if(ARV_LOADING) return;
  ARV_LOADING = true;
  setBadge('arvore', 'loading');
  const alvo = document.getElementById('arv-root-' + ARV_SUBPAGE);
  if(alvo && (force || !ARV_DATA)) alvo.innerHTML = '<div class="arv-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando árvore…</div>';
  try{
    const r = await fetch('/api/overview?arvore=1');
    const j = await r.json();
    if(!j.ok) throw new Error(j.erro || 'Falha ao carregar a árvore');
    ARV_DATA = j;
    if(!ARV_SEL_ISO || !arvDia(ARV_SEL_ISO)) ARV_SEL_ISO = j.meta.lastRealDate;
    ARV_MESES_SEL = arvDefaultMonths(ARV_SEL_ISO);
    ARV_MESES_TOCADO = false;
    ARV_SEMANAS_SEL = [];
    const semanaSel = (arvDia(ARV_SEL_ISO) || {}).wk;
    const semanaHoje = (arvDia(arvHojeReal()) || {}).wk;
    ARV_SEMANAS_ABERTAS = new Set([semanaSel, semanaHoje].filter(Boolean));
    arvRenderAtual();
    setBadge('arvore', 'ok', 'árvore_pulso');
  }catch(err){
    if(alvo) alvo.innerHTML = `<div class="arv-empty">Erro ao carregar: ${pulsoEscHtml(err.message)}</div>`;
    setBadge('arvore', 'erro', err.message);
  }finally{
    ARV_LOADING = false;
  }
}
function arvSwitchSubpage(key, el){
  ARV_SUBPAGE = key;
  if(el){
    el.parentElement.querySelectorAll('.bkl-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }
  ['arvore','visao','historico'].forEach(k => {
    const root = document.getElementById('arv-root-' + k);
    if(root) root.style.display = k === key ? '' : 'none';
  });
  const sub = { arvore:'Control Tower · Operação diária', visao:'Resumo executivo do dia selecionado', historico:'Comparação de indicadores ao longo do tempo' }[key];
  const el2 = document.getElementById('arv-page-subtitle');
  if(el2 && sub) el2.textContent = sub;
  arvRenderAtual();
}
function arvRenderAtual(){
  if(!ARV_DATA) return;
  if(ARV_SUBPAGE === 'arvore') arvRenderTabela();
  else if(ARV_SUBPAGE === 'visao') arvRenderVisao();
  else arvRenderHistorico();
}

/* ── filtro de período (Mês/Semana) ─────────────────────────── */
function arvMonthOptions(){
  const seen = new Set(); const out = [];
  (ARV_DATA.days || []).forEach(d => { const k = d.iso.slice(0,7); if(!seen.has(k)){ seen.add(k); out.push(k); } });
  return out.sort();
}
function arvDefaultMonths(iso){
  const cur = iso.slice(0,7);
  const [y,m] = cur.split('-').map(Number);
  const prevD = new Date(Date.UTC(y, m-2, 1));
  const prev = prevD.getUTCFullYear() + '-' + String(prevD.getUTCMonth()+1).padStart(2,'0');
  return [prev, cur];
}
function arvEffectiveMonths(){
  const all = arvMonthOptions();
  if(!ARV_MESES_TOCADO) return ARV_MESES_SEL.filter(m => all.includes(m));
  return ARV_MESES_SEL.length ? ARV_MESES_SEL.slice().sort() : all;
}
function arvWeekOptions(){
  const eff = arvEffectiveMonths();
  return (ARV_DATA.weeks || []).filter(w => eff.includes((w.startIso||'').slice(0,7)));
}
// remove da seleção ativa semanas que deixaram de pertencer aos meses marcados
function arvSanearSemanas(){
  if(!ARV_MESES_TOCADO || !ARV_MESES_SEL.length) return;
  const validos = new Set(arvWeekOptions().map(w => w.label));
  ARV_SEMANAS_SEL = ARV_SEMANAS_SEL.filter(l => validos.has(l));
}
function arvMsToggleDropdown(msKey){
  const id = 'arv-ms-dropdown-' + msKey;
  document.querySelectorAll('.spr-ms-dropdown').forEach(d => { if(d.id !== id) d.classList.remove('open'); });
  document.getElementById(id)?.classList.toggle('open');
}
document.addEventListener('change', e => {
  if(!e.target.classList.contains('arv-ms-checkbox')) return;
  const msKey = e.target.dataset.ms;
  const val = e.target.value;
  // `let` no topo do arquivo não vira propriedade de `window`, então o
  // array certo precisa ser referenciado direto (nada de window[nome]).
  const arr = msKey === 'meses' ? ARV_MESES_SEL : ARV_SEMANAS_SEL;
  const i = arr.indexOf(val);
  if(e.target.checked){ if(i < 0) arr.push(val); } else if(i >= 0) arr.splice(i, 1);
  if(msKey === 'meses') ARV_MESES_TOCADO = true;
  arvSanearSemanas();
  arvRenderTabela();
});
function arvMsSelectAll(msKey){
  if(msKey === 'meses'){ ARV_MESES_SEL = arvMonthOptions(); ARV_MESES_TOCADO = true; }
  else ARV_SEMANAS_SEL = arvWeekOptions().map(w => w.label);
  arvRenderTabela();
}
function arvMsReset(msKey){
  if(msKey === 'meses'){ ARV_MESES_SEL = []; ARV_MESES_TOCADO = true; }
  else ARV_SEMANAS_SEL = [];
  arvSanearSemanas();
  arvRenderTabela();
}
function arvMsHtml(msKey, label, options, selectedRaw){
  const selected = selectedRaw.length === 0 ? [] : selectedRaw;
  const resumo = (selected.length === 0 || selected.length === options.length) ? 'todos' : selected.length + ' sel.';
  const ativo = msKey === 'meses' ? ARV_MESES_TOCADO && selected.length > 0 : selected.length > 0;
  const itens = options.map(o => `
    <label class="spr-ms-item">
      <input type="checkbox" class="arv-ms-checkbox" data-ms="${msKey}" value="${pulsoEscHtml(o.value)}" ${selected.includes(o.value) ? 'checked' : ''}/>
      ${pulsoEscHtml(o.label)}
    </label>`).join('');
  return `
    <div class="spr-ms-wrap">
      <button class="spr-ms-btn ${ativo ? 'active' : ''}" type="button" onclick="arvMsToggleDropdown('${msKey}')">${label} <span style="opacity:.7">(${resumo})</span> <i class="fas fa-chevron-down" style="font-size:9px"></i></button>
      <div class="spr-ms-dropdown" id="arv-ms-dropdown-${msKey}">
        <div class="spr-ms-actions">
          <button type="button" class="spr-ms-action-btn" onclick="arvMsSelectAll('${msKey}')">Todos</button>
          <button type="button" class="spr-ms-action-btn" onclick="arvMsReset('${msKey}')">Limpar</button>
        </div>
        <div class="spr-ms-list">${itens || '<div class="spr-ms-empty">Nenhuma opção.</div>'}</div>
      </div>
    </div>`;
}

/* ── subpágina 1: a árvore (tabela hierárquica) ─────────────── */
function arvKpisFiltrados(){
  const q = (ARV_FILTROS.busca || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (ARV_DATA.kpis || []).filter(k => {
    if(ARV_FILTROS.bloco && k.bloco !== ARV_FILTROS.bloco) return false;
    if(ARV_FILTROS.pic && k.pic !== ARV_FILTROS.pic) return false;
    if(q){
      const alvo = `${k.kpi} ${k.bloco} ${k.subBloco} ${k.pic}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if(!alvo.includes(q)) return false;
    }
    return true;
  });
}
function arvSetFiltro(campo, valor){ ARV_FILTROS[campo] = valor; arvRenderTabela(); }
function arvToggleWeekOpen(label){
  if(ARV_SEMANAS_ABERTAS.has(label)) ARV_SEMANAS_ABERTAS.delete(label);
  else ARV_SEMANAS_ABERTAS.add(label);
  arvRenderTabela();
}
function arvIrDia(delta){
  const dias = ARV_DATA.days.map(d => d.iso);
  const i = dias.indexOf(ARV_SEL_ISO);
  const novo = dias[Math.min(dias.length - 1, Math.max(0, i + delta))];
  if(novo) arvSetDia(novo);
}
function arvSetDia(iso){
  if(!iso) return;
  ARV_SEL_ISO = iso;
  const semana = (arvDia(iso) || {}).wk;
  if(semana) ARV_SEMANAS_ABERTAS.add(semana);
  arvRenderAtual();
  if(ARV_SUBPAGE === 'arvore'){
    setTimeout(() => {
      const wrap = document.querySelector('#arv-root-arvore .arv-grid-wrap');
      const th = wrap && wrap.querySelector(`th[data-iso="${iso}"]`);
      if(wrap && th) wrap.scrollTo({ left: Math.max(0, th.offsetLeft - wrap.clientWidth * 0.55), behavior: 'smooth' });
    }, 40);
  }
}

function arvRenderTabela(){
  const root = document.getElementById('arv-root-arvore');
  if(!root) return;
  const kpis = arvKpisFiltrados();
  const refs = (ARV_DATA.meta.refWeeks || []).map(l => (ARV_DATA.weeks || []).find(w => w.label === l)).filter(Boolean);
  const pics = [...new Set((ARV_DATA.kpis || []).map(k => k.pic).filter(Boolean))].sort();
  const temDado = !!arvDia(ARV_SEL_ISO);

  const effMonths = arvEffectiveMonths();
  const weekOptions = arvWeekOptions();
  const daysByWeek = {};
  (ARV_DATA.days || []).forEach(d => { (daysByWeek[d.wk] = daysByWeek[d.wk] || []).push(d); });

  // offsets das colunas congeladas
  const off = {}; let acc = 0;
  ['bloco','pic','sub','kpi','target'].forEach(c => { off[c] = acc; acc += ARV_LARG[c]; });
  refs.forEach((w, i) => { off['ref' + i] = acc; acc += ARV_LARG.ref; });
  const frozenTotal = acc;

  // Monta Mês -> Semana -> (dias, se aberta) e a lista plana de colunas-folha.
  const leaves = []; const monthGroups = [];
  let x = frozenTotal;
  effMonths.forEach(monthKey => {
    const weeksAll = weekOptions.filter(w => w.startIso.slice(0,7) === monthKey);
    const weeksDoMes = ARV_SEMANAS_SEL.length ? weeksAll.filter(w => ARV_SEMANAS_SEL.includes(w.label)) : weeksAll;
    if(!weeksDoMes.length) return;
    const weekEntries = [];
    weeksDoMes.forEach(w => {
      const isOpen = ARV_SEMANAS_ABERTAS.has(w.label);
      const monthStart = leaves.length === 0 || leaves[leaves.length-1]._monthKey !== monthKey;
      if(!isOpen){
        leaves.push({ type:'week', key:w.label, week:w, width:ARV_LARG.semana, left:x, monthStart, _monthKey:monthKey });
        x += ARV_LARG.semana;
        weekEntries.push({ week:w, isOpen:false, leafCount:1 });
      }else{
        const wDays = daysByWeek[w.label] || [];
        leaves.push({ type:'weekTotal', key:w.label+'-total', week:w, width:ARV_LARG.semana, left:x, monthStart, _monthKey:monthKey });
        x += ARV_LARG.semana;
        wDays.forEach(d => {
          leaves.push({ type:'day', key:d.iso, day:d, week:w, width:ARV_LARG.dia, left:x, monthStart:false, _monthKey:monthKey });
          x += ARV_LARG.dia;
        });
        weekEntries.push({ week:w, isOpen:true, leafCount:wDays.length+1 });
      }
    });
    const leafCount = weekEntries.reduce((a,e) => a+e.leafCount, 0);
    if(leafCount > 0) monthGroups.push({ monthKey, weeks:weekEntries, leafCount });
  });
  const largura = x;

  const hojeIso = arvHojeReal();
  const hojeLeaf = leaves.find(l => l.type === 'day' && l.key === hojeIso);
  const linhaHojeLeft = hojeLeaf ? hojeLeaf.left + hojeLeaf.width : null;

  // rowspan="3" é essencial aqui: o cabeçalho tem 3 linhas (Mês/Semana/Dia),
  // mas essas colunas congeladas (Bloco..Target/refs) só existem na 1ª. Sem
  // o rowspan, o navegador empurra as linhas de Semana/Dia pra debaixo
  // delas em vez de alinhar com as colunas de mês — bug reportado pelo
  // Roberto em 2026-08-13 ("as datas estão abaixo dos KPIs").
  const thFrozen = (label, left, w, extra, title) =>
    `<th class="arv-frozen ${extra || ''}" rowspan="3" style="left:${left}px;width:${w}px;min-width:${w}px" ${title ? `title="${pulsoEscHtml(title)}"` : ''}>${label}</th>`;

  let head1 = '<tr>' +
    thFrozen('Bloco', off.bloco, ARV_LARG.bloco) +
    thFrozen('PIC', off.pic, ARV_LARG.pic) +
    thFrozen('Sub Bloco', off.sub, ARV_LARG.sub) +
    thFrozen('KPI', off.kpi, ARV_LARG.kpi, 'style-left') +
    thFrozen('Target', off.target, ARV_LARG.target) +
    refs.map((w, i) => thFrozen(w.label, off['ref' + i], ARV_LARG.ref, '', 'Semana de referência')).join('') +
    monthGroups.map(g => `<th class="arv-monthcol" colspan="${g.leafCount}">${pulsoEscHtml(arvFmtMes(g.monthKey))}</th>`).join('') +
    '</tr>';

  let head2 = '<tr>' + monthGroups.flatMap(g => g.weeks.map(we => we.isOpen
    ? `<th class="arv-weekcol" colspan="${we.leafCount}" onclick="arvToggleWeekOpen('${we.week.label}')" title="Clique para fechar a semana">▾ ${we.week.label}</th>`
    : `<th class="arv-weekcol" onclick="arvToggleWeekOpen('${we.week.label}')" title="Clique para abrir a semana" style="width:${ARV_LARG.semana}px;min-width:${ARV_LARG.semana}px">▸ ${we.week.label}</th>`
  )).join('') + '</tr>';

  let head3 = '<tr>' + monthGroups.flatMap(g => g.weeks.filter(we => we.isOpen).flatMap(we => {
    const totalTh = `<th class="arv-weekcol arv-weektotalcol" style="width:${ARV_LARG.semana}px;min-width:${ARV_LARG.semana}px" title="Resultado consolidado da semana">${we.week.label}</th>`;
    const dayThs = (daysByWeek[we.week.label] || []).map(d =>
      `<th class="arv-daycol ${d.iso === ARV_SEL_ISO ? 'arv-sel' : ''}" data-iso="${d.iso}" style="width:${ARV_LARG.dia}px;min-width:${ARV_LARG.dia}px">
        ${arvFmtDataCurta(d.iso)}<span class="arv-wd">${d.wd}</span>
      </th>`).join('');
    return totalTh + dayThs;
  })).join('') + '</tr>';

  const celula = (k, chave, cls, left, aggregate) => {
    const v = arvValor(k, chave);
    const compare = arvValor(k, arvPrevPeriodKey(chave));
    const st = arvStatusLabel(k, v, compare);
    const w = left !== undefined ? ARV_LARG.ref : (aggregate ? ARV_LARG.semana : ARV_LARG.dia);
    const estilo = left !== undefined ? `left:${left}px;width:${w}px;min-width:${w}px` : `width:${w}px;min-width:${w}px`;
    return `<td class="arv-cell arv-${st.color} ${aggregate ? 'arv-agg' : ''} ${cls}" style="${estilo}" title="${pulsoEscHtml(k.kpi + ' — ' + arvFmtValor(k, v) + (st.key !== 'na' ? ' · ' + st.text : ''))}" onclick="arvOpenDetail('${k.id}')">${arvFmtValor(k, v)}</td>`;
  };

  const spanAte = (i, chaveFn) => { let j = i + 1; while(j < kpis.length && chaveFn(kpis[j]) === chaveFn(kpis[i])) j++; return j - i; };
  let body = '';
  kpis.forEach((k, i) => {
    const iniBloco = i === 0 || kpis[i-1].bloco !== k.bloco;
    const iniPic = iniBloco || kpis[i-1].pic !== k.pic;
    const iniSub = iniPic || kpis[i-1].subBloco !== k.subBloco;
    body += `<tr class="${iniBloco ? 'arv-bloco-start' : ''}">`;
    if(iniBloco) body += `<td rowspan="${spanAte(i, x => x.bloco)}" class="arv-frozen arv-bloco" style="left:${off.bloco}px;width:${ARV_LARG.bloco}px;min-width:${ARV_LARG.bloco}px"><span>${pulsoEscHtml(k.bloco)}</span></td>`;
    if(iniPic) body += `<td rowspan="${spanAte(i, x => x.bloco + '|' + x.pic)}" class="arv-frozen arv-pic" style="left:${off.pic}px;width:${ARV_LARG.pic}px;min-width:${ARV_LARG.pic}px">${pulsoEscHtml(k.pic || '—')}</td>`;
    if(iniSub) body += `<td rowspan="${spanAte(i, x => x.bloco + '|' + x.pic + '|' + x.subBloco)}" class="arv-frozen arv-sub" style="left:${off.sub}px;width:${ARV_LARG.sub}px;min-width:${ARV_LARG.sub}px">${pulsoEscHtml(k.subBloco || '—')}</td>`;
    body += `<td class="arv-frozen arv-kpiname" style="left:${off.kpi}px;width:${ARV_LARG.kpi}px;min-width:${ARV_LARG.kpi}px" onclick="arvOpenDetail('${k.id}')">${pulsoEscHtml(k.kpi)}${k.fonte && /^https?:/.test(k.fonte) ? `<a class="arv-fonte" href="${pulsoEscHtml(k.fonte)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Fonte"><i class="fas fa-arrow-up-right-from-square"></i></a>` : ''}</td>`;
    body += `<td class="arv-frozen arv-target" style="left:${off.target}px;width:${ARV_LARG.target}px;min-width:${ARV_LARG.target}px">${arvFmtTarget(k)}</td>`;
    refs.forEach((w, ri) => { body += celula(k, w.label, 'arv-frozen', off['ref' + ri]); });
    leaves.forEach(l => {
      body += celula(k, l.type === 'day' ? l.day.iso : l.week.label, l.monthStart ? 'month-start' : '', undefined, l.type !== 'day');
    });
    body += '</tr>';
  });
  if(!kpis.length) body = `<tr><td colspan="99" class="arv-empty">Nenhum KPI encontrado com os filtros atuais.</td></tr>`;

  const allMonthOptions = arvMonthOptions().map(m => ({ value:m, label:arvFmtMes(m) }));
  const weekOptForFiltro = weekOptions.map(w => ({ value:w.label, label:`${w.label} (${arvFmtDataCurta(w.startIso)}–${arvFmtDataCurta(w.endIso)})` }));
  const dias0 = (ARV_DATA.days[0] || {}).iso || '';
  const diasN = (ARV_DATA.days[ARV_DATA.days.length-1] || {}).iso || '';

  root.innerHTML = `
    <div class="arv-toolbar">
      <input class="filter-select arv-busca" type="text" id="arv-f-busca" placeholder="Buscar KPI, Bloco, Sub Bloco ou PIC…" value="${pulsoEscHtml(ARV_FILTROS.busca)}" oninput="arvSetFiltro('busca',this.value)"/>
      <select class="filter-select" onchange="arvSetFiltro('bloco',this.value)">
        <option value="">Todos os Blocos</option>
        ${(ARV_DATA.blocks || []).map(b => `<option value="${pulsoEscHtml(b)}" ${ARV_FILTROS.bloco === b ? 'selected' : ''}>${pulsoEscHtml(b)}</option>`).join('')}
      </select>
      <select class="filter-select" onchange="arvSetFiltro('pic',this.value)">
        <option value="">Todos os PICs</option>
        ${pics.map(p => `<option value="${pulsoEscHtml(p)}" ${ARV_FILTROS.pic === p ? 'selected' : ''}>${pulsoEscHtml(p)}</option>`).join('')}
      </select>
      ${arvMsHtml('meses', 'Mês', allMonthOptions, ARV_MESES_SEL)}
      ${arvMsHtml('semanas', 'Semana', weekOptForFiltro, ARV_SEMANAS_SEL)}
      <div class="arv-daynav">
        <button class="arv-daybtn" onclick="arvIrDia(-1)" ${ARV_SEL_ISO === dias0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
        <span class="arv-daypill" data-semdado="${temDado ? '0' : '1'}">${arvFmtDataLonga(ARV_SEL_ISO)}${temDado ? '' : ' · sem dado'}</span>
        <button class="arv-daybtn" onclick="arvIrDia(1)" ${ARV_SEL_ISO === diasN ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        <input class="filter-select" type="date" value="${ARV_SEL_ISO || ''}" min="${dias0}" max="${diasN}" onchange="arvSetDia(this.value)" style="min-width:0"/>
        <button class="arv-daybtn" onclick="arvSetDia(ARV_DATA.meta.lastRealDate)">Mais recente</button>
      </div>
      <div class="arv-toolbar-spacer"></div>
      <span class="arv-count">${kpis.length} de ${(ARV_DATA.kpis || []).length} KPIs</span>
    </div>
    <div class="arv-legend">
      <span><i style="background:color-mix(in srgb, var(--green) 45%, transparent)"></i>Dentro do target</span>
      <span><i style="background:color-mix(in srgb, var(--amber) 45%, transparent)"></i>Próximo do target</span>
      <span><i style="background:color-mix(in srgb, var(--red) 45%, transparent)"></i>Fora do target</span>
      <span><i style="background:var(--surface-3)"></i>Sem dado</span>
      <span><i style="background:var(--orange);border-radius:2px;width:2px"></i>Hoje</span>
      <span>▸ semana fechada · ▾ semana aberta (clique no cabeçalho)</span>
    </div>
    <div class="arv-grid-wrap">
      <div style="position:relative;width:${largura}px">
        <table class="arv-grid" style="width:${largura}px;min-width:${largura}px">
          <thead>${head1}${head2}${head3}</thead>
          <tbody>${body}</tbody>
        </table>
        ${linhaHojeLeft !== null ? `<div class="arv-todayline" style="left:${linhaHojeLeft}px"></div>` : ''}
      </div>
    </div>`;
}

/* ── subpágina 2: Visão Geral ───────────────────────────────── */
function arvRenderVisao(){
  const root = document.getElementById('arv-root-visao');
  if(!root) return;
  const kpis = ARV_DATA.kpis || [];
  const cont = { ok:0, warn:0, bad:0, na:0 };
  const porBloco = {};
  const desvios = [];
  kpis.forEach(k => {
    const v = arvValor(k, ARV_SEL_ISO);
    const prevV = arvValor(k, arvAddDias(ARV_SEL_ISO, -1));
    const st = arvStatusLabel(k, v, prevV);
    const inTarget = st.key === 'in_target' || st.key === 'in_target_stable';
    const warnish = st.key === 'in_target_worsening' || st.key === 'out_target_improving';
    const outBad = st.key === 'out_target_worsening';
    if(inTarget) cont.ok++; else if(warnish) cont.warn++; else if(outBad) cont.bad++; else cont.na++;
    if(!porBloco[k.bloco]) porBloco[k.bloco] = { ok:0, total:0 };
    if(st.key !== 'na'){ porBloco[k.bloco].total++; if(inTarget) porBloco[k.bloco].ok++; }
    if((warnish || outBad) && k.target !== null && v !== null){
      const base = Math.max(Math.abs(k.target), k.unit === 'percent' ? 0.01 : 1);
      desvios.push({ k, v, st, score: Math.abs(v - k.target) / base });
    }
  });
  desvios.sort((a, b) => b.score - a.score);
  const blocos = (ARV_DATA.blocks || []).filter(b => porBloco[b]).map(b => ({
    bloco: b,
    pct: porBloco[b].total ? Math.round(porBloco[b].ok / porBloco[b].total * 100) : null,
  }));
  const cor = p => p === null ? 'var(--text-muted)' : p >= 90 ? 'var(--green)' : p >= 70 ? 'var(--amber)' : 'var(--red)';

  root.innerHTML = `
    <div class="arv-toolbar">
      <div class="arv-daynav">
        <button class="arv-daybtn" onclick="arvIrDia(-1)"><i class="fas fa-chevron-left"></i></button>
        <span class="arv-daypill">${arvFmtDataLonga(ARV_SEL_ISO)}</span>
        <button class="arv-daybtn" onclick="arvIrDia(1)"><i class="fas fa-chevron-right"></i></button>
        <button class="arv-daybtn" onclick="arvSetDia(ARV_DATA.meta.lastRealDate)">Mais recente</button>
      </div>
      <div class="arv-toolbar-spacer"></div>
      <span class="arv-count">Atualizado até ${arvFmtDataLonga(ARV_DATA.meta.lastRealDate)}</span>
    </div>
    <div id="arv-visao-kpis" style="margin-bottom:16px"></div>
    <div class="chart-card" style="margin-bottom:16px">
      <div class="chart-title" style="margin-bottom:14px">Performance por Bloco</div>
      ${blocos.length ? blocos.map(b => `
        <div class="arv-blocorow">
          <div class="arv-blocorow-nome" title="${pulsoEscHtml(b.bloco)}">${pulsoEscHtml(b.bloco)}</div>
          <div class="arv-bar-track"><div class="arv-bar-fill" style="width:${b.pct || 0}%;background:${cor(b.pct)}"></div></div>
          <div class="arv-blocorow-pct" style="color:${cor(b.pct)}">${b.pct === null ? '—' : b.pct + '%'}</div>
        </div>`).join('') : '<div class="arv-empty">Sem dado nesta data.</div>'}
    </div>
    <div class="chart-card">
      <div class="chart-title">Principais desvios</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin:2px 0 12px">KPIs com maior distância percentual em relação ao target na data selecionada.</div>
      ${desvios.length ? desvios.slice(0, 8).map((d, i) => `
        <button class="arv-dev" onclick="arvOpenDetail('${d.k.id}')">
          <span class="arv-dev-pos">${i+1}.</span>
          <span class="arv-dev-main">
            <span class="arv-dev-nome">${pulsoEscHtml(d.k.bloco)} — ${pulsoEscHtml(d.k.kpi)}</span>
            <span class="arv-dev-sub">${pulsoEscHtml(d.k.subBloco || d.k.pic || '')}</span>
          </span>
          <span class="arv-dev-val"><b>${arvFmtValor(d.k, d.v)}</b><span>meta ${arvFmtTarget(d.k)}</span></span>
          <span>${d.st.dot}</span>
        </button>`).join('') : '<div class="arv-empty">Nenhum desvio relevante nesta data.</div>'}
    </div>`;

  buildKPIs('arv-visao-kpis', [
    { label:'Total de KPIs', value: kpis.length, icon:'fa-list-check', type:'' },
    { label:'Dentro do Target', value: cont.ok, icon:'fa-circle-check', type:'success' },
    { label:'Atenção', value: cont.warn, icon:'fa-triangle-exclamation', type:'warning' },
    { label:'Fora do Target', value: cont.bad, icon:'fa-circle-xmark', type:'danger' },
    { label:'Sem dado', value: cont.na, icon:'fa-circle-minus', type:'' },
  ]);
}

/* ── subpágina 3: Histórico ─────────────────────────────────── */
function arvHistToggle(id){
  const i = ARV_HIST_SEL.indexOf(id);
  if(i >= 0) ARV_HIST_SEL.splice(i, 1);
  else if(ARV_HIST_SEL.length < 8) ARV_HIST_SEL.push(id);
  arvRenderHistorico();
}
function arvHistFiltro(campo, valor){ ARV_HIST_FILTRO[campo] = valor; arvRenderHistorico(); }
function arvHistPeriodo(p){ ARV_HIST_PERIODO = p; arvRenderHistorico(); }

function arvRenderHistorico(){
  const root = document.getElementById('arv-root-historico');
  if(!root) return;
  const dias = ARV_DATA.days || [];
  const fim = ARV_SEL_ISO || ARV_DATA.meta.lastRealDate;
  const nDias = ARV_HIST_PERIODO === 'all' ? dias.length : parseInt(ARV_HIST_PERIODO, 10);
  const ini = ARV_HIST_PERIODO === 'all' ? (dias[0] || {}).iso : arvAddDias(fim, -(nDias - 1));
  const janela = dias.filter(d => d.iso >= ini && d.iso <= fim);
  const sel = ARV_HIST_SEL.map(id => (ARV_DATA.kpis || []).find(k => k.id === id)).filter(Boolean);

  const q = (ARV_HIST_FILTRO.busca || '').toLowerCase();
  const lista = (ARV_DATA.kpis || []).filter(k => {
    if(ARV_HIST_FILTRO.bloco && k.bloco !== ARV_HIST_FILTRO.bloco) return false;
    if(q && !`${k.kpi} ${k.bloco} ${k.subBloco}`.toLowerCase().includes(q)) return false;
    return true;
  });

  root.innerHTML = `
    <div class="arv-hist">
      <div class="arv-picker">
        <div class="arv-picker-head">
          <div style="font-size:12.5px;font-weight:700;color:var(--text-sub)">Selecionar KPIs <span style="font-weight:500;color:var(--text-muted)">(até 8)</span></div>
          <select class="filter-select" onchange="arvHistFiltro('bloco',this.value)">
            <option value="">Todos os Blocos</option>
            ${(ARV_DATA.blocks || []).map(b => `<option value="${pulsoEscHtml(b)}" ${ARV_HIST_FILTRO.bloco === b ? 'selected' : ''}>${pulsoEscHtml(b)}</option>`).join('')}
          </select>
          <input class="filter-select" type="text" placeholder="Buscar KPI…" value="${pulsoEscHtml(ARV_HIST_FILTRO.busca)}" oninput="arvHistFiltro('busca',this.value)"/>
        </div>
        <div class="arv-picker-list">
          ${lista.length ? lista.map(k => `
            <label class="arv-picker-item">
              <input type="checkbox" ${ARV_HIST_SEL.includes(k.id) ? 'checked' : ''} onchange="arvHistToggle('${k.id}')" style="margin-top:2px;accent-color:var(--orange)"/>
              <span style="min-width:0"><b>${pulsoEscHtml(k.kpi)}</b><small>${pulsoEscHtml(k.bloco)} · ${pulsoEscHtml(k.subBloco || k.pic || '')}</small></span>
            </label>`).join('') : '<div class="arv-empty">Nenhum KPI encontrado.</div>'}
        </div>
      </div>
      <div style="min-width:0">
        <div class="arv-toolbar">
          <div class="arv-chips">
            ${sel.length ? sel.map((k, i) => `
              <span class="arv-chip"><i class="arv-dot" style="background:${ARV_PALETA[i % ARV_PALETA.length]}"></i>${pulsoEscHtml(k.kpi)}
                <button onclick="arvHistToggle('${k.id}')"><i class="fas fa-xmark"></i></button></span>`).join('')
              : '<span style="font-size:12px;color:var(--text-muted)">Selecione um ou mais KPIs à esquerda para comparar.</span>'}
          </div>
          <div class="arv-toolbar-spacer"></div>
          <div style="display:flex;gap:6px">
            ${ARV_PERIODOS.map(([k, l]) => `<div class="mon-view-btn ${ARV_HIST_PERIODO === k ? 'active' : ''}" onclick="arvHistPeriodo('${k}')">${l}</div>`).join('')}
          </div>
        </div>
        <div class="chart-card" style="margin-bottom:16px">
          <div class="chart-title">Evolução</div>
          ${new Set(sel.map(k => k.unit)).size > 1 ? '<div style="font-size:11px;color:var(--amber);margin:6px 0">KPIs com unidades diferentes — cada um é exibido na sua escala original.</div>' : ''}
          <div style="height:300px;margin-top:10px"><canvas id="arv-hist-chart"></canvas></div>
        </div>
        <div class="table-card">
          <div class="table-wrap" style="overflow-x:auto">
            <table class="arv-turnos" style="min-width:520px">
              <thead><tr><th>KPI</th><th style="text-align:right">Resultado (${arvFmtDataCurta(fim)})</th><th style="text-align:right">Target</th><th style="text-align:right">Média do período</th><th style="text-align:right">Status</th></tr></thead>
              <tbody>
                ${sel.length ? sel.map((k, i) => {
                  const v = arvValor(k, fim);
                  const prevV = arvValor(k, arvAddDias(fim, -1));
                  const st = arvStatusLabel(k, v, prevV);
                  const vals = janela.map(d => arvValor(k, d.iso)).filter(x => x !== null);
                  const media = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
                  return `<tr>
                    <td><span style="display:inline-flex;align-items:center;gap:6px"><i class="arv-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ARV_PALETA[i % ARV_PALETA.length]}"></i>${pulsoEscHtml(k.bloco)} — ${pulsoEscHtml(k.kpi)}</span></td>
                    <td style="text-align:right;font-weight:700">${arvFmtValor(k, v)}</td>
                    <td style="text-align:right;color:var(--text-muted)">${arvFmtTarget(k)}</td>
                    <td style="text-align:right;color:var(--text-muted)">${arvFmtValor(k, media)}</td>
                    <td style="text-align:right"><span class="arv-pill arv-${st.color}">${st.dot} ${st.text}</span></td>
                  </tr>`;
                }).join('') : '<tr><td colspan="5" class="arv-empty">Nenhum KPI selecionado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  if(ARV_CHART_HIST){ ARV_CHART_HIST.destroy(); ARV_CHART_HIST = null; }
  const cv = document.getElementById('arv-hist-chart');
  if(cv && sel.length){
    ARV_CHART_HIST = new Chart(cv, {
      type:'line',
      data:{
        labels: janela.map(d => arvFmtDataCurta(d.iso)),
        datasets: sel.map((k, i) => ({
          label: k.kpi,
          data: janela.map(d => { const v = arvValor(k, d.iso); return v === null ? null : (k.unit === 'percent' ? v * 100 : v); }),
          borderColor: ARV_PALETA[i % ARV_PALETA.length],
          backgroundColor: ARV_PALETA[i % ARV_PALETA.length] + '22',
          borderWidth:2, pointRadius: janela.length > 45 ? 0 : 2, pointHoverRadius:5, tension:.25, spanGaps:true,
        })),
      },
      options:{
        responsive:true, maintainAspectRatio:false, animation:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:10.5 } } } },
        scales:{ x:{ grid:{ display:false }, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:12, font:{ size:10 } } },
                 y:{ ticks:{ font:{ size:10 } } } },
      },
    });
  }
}

/* ── drawer de detalhe do KPI ───────────────────────────────── */
function arvOpenDetail(id){
  const k = (ARV_DATA.kpis || []).find(x => x.id === id);
  if(!k) return;
  ARV_SEL_KPI = id;
  const v = arvValor(k, ARV_SEL_ISO);
  const ontem = arvAddDias(ARV_SEL_ISO, -1);
  const vOntem = arvValor(k, ontem);
  const st = arvStatusLabel(k, v, vOntem);
  const dOntem = arvDelta(v, vOntem);
  const refLabel = (ARV_DATA.meta.refWeeks || []).slice(-1)[0];
  const dRef = refLabel ? arvDelta(v, arvValor(k, refLabel)) : null;
  const obsHoje = (k.obs || {})[ARV_SEL_ISO];
  const turnoEntries = arvTurnoEntries(k, ARV_SEL_ISO);
  const trailingDias = (ARV_DATA.days || []).filter(d => d.iso <= ARV_SEL_ISO).slice(-6);
  const trailingValues = trailingDias.map(d => arvValor(k, d.iso));
  const insightsAuto = arvInsights(k, v, st, dOntem, dRef, refLabel, turnoEntries, trailingValues);

  ARV_INSIGHT_TAB = obsHoje ? 'manual' : 'auto';

  document.getElementById('arv-detail-title').innerHTML =
    `<i class="fas fa-diagram-project" style="color:var(--orange);margin-right:8px"></i>${pulsoEscHtml(k.kpi)}
     <span style="color:var(--text-muted);font-weight:600;font-size:12px">· ${pulsoEscHtml(k.bloco)}${k.subBloco ? ' / ' + pulsoEscHtml(k.subBloco) : ''}</span>`;

  document.getElementById('arv-detail-body').innerHTML = `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">
      ${pulsoEscHtml(k.pic || '—')} · ${arvFmtDataLonga(ARV_SEL_ISO)}
      ${k.fonte && /^https?:/.test(k.fonte) ? `<a href="${pulsoEscHtml(k.fonte)}" target="_blank" rel="noopener" style="color:var(--orange);margin-left:6px">Fonte <i class="fas fa-arrow-up-right-from-square" style="font-size:9px"></i></a>` : ''}
    </div>
    <div class="arv-sum">
      <div class="arv-sum-item"><div class="arv-sum-label">Resultado</div><div class="arv-sum-value">${arvFmtValor(k, v)}</div></div>
      <div class="arv-sum-item"><div class="arv-sum-label">Target</div><div class="arv-sum-value">${arvFmtTarget(k)}</div></div>
      <div class="arv-sum-item"><div class="arv-sum-label">Status</div><div class="arv-sum-value" style="font-size:12px">${st.dot} ${st.text}</div></div>
    </div>
    <div class="arv-secao">Variações</div>
    <div class="arv-var">
      <div class="arv-var-item"><div class="arv-var-label">vs D-1 (${arvFmtDataCurta(ontem)})</div><div class="arv-var-value ${arvToneDelta(k, dOntem)}">${arvFmtDelta(k, dOntem)}</div></div>
      <div class="arv-var-item"><div class="arv-var-label">vs ${pulsoEscHtml(refLabel || '—')}</div><div class="arv-var-value ${arvToneDelta(k, dRef)}">${arvFmtDelta(k, dRef)}</div></div>
    </div>
    <div class="arv-secao">Evolução (últimos 14 dias)</div>
    <div style="height:200px"><canvas id="arv-detail-chart"></canvas></div>
    ${turnoEntries.length ? `
      <div class="arv-secao">Por turno</div>
      <table class="arv-turnos">
        <thead><tr><th>Turno</th><th style="text-align:right">Resultado</th><th style="text-align:right">Target</th><th style="text-align:right">Status</th></tr></thead>
        <tbody>${turnoEntries.map(t => t.kpi ? `<tr><td style="font-weight:600">${pulsoEscHtml(t.turno)}</td>
            <td style="text-align:right">${arvFmtValor(t.kpi, t.value)}</td>
            <td style="text-align:right;color:var(--text-muted)">${arvFmtTarget(t.kpi)}</td>
            <td style="text-align:right"><span class="arv-pill arv-${t.statusLabel.color}">${t.statusLabel.dot} ${t.statusLabel.text}</span></td></tr>` : '').join('')}</tbody>
      </table>` : ''}
    <div class="arv-secao" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>Insights</span>
      <div class="arv-insight-tabs">
        <div class="arv-insight-tab ${ARV_INSIGHT_TAB === 'manual' ? 'active' : ''}" onclick="arvSetInsightTab('manual')">Insights</div>
        <div class="arv-insight-tab ${ARV_INSIGHT_TAB === 'auto' ? 'active' : ''}" onclick="arvSetInsightTab('auto')">Insights (COP Boy)</div>
      </div>
    </div>
    <div id="arv-insight-body"></div>
  `;
  arvRenderInsightBody(obsHoje, insightsAuto);

  const dias = ARV_DATA.days || [];
  const iSel = dias.findIndex(d => d.iso === ARV_SEL_ISO);
  const janela = dias.slice(Math.max(0, (iSel < 0 ? dias.length - 1 : iSel) - 13), (iSel < 0 ? dias.length : iSel + 1));
  if(ARV_CHART){ ARV_CHART.destroy(); ARV_CHART = null; }
  const cv = document.getElementById('arv-detail-chart');
  if(cv){
    const alvo = k.target === null ? null : (k.unit === 'percent' ? k.target * 100 : k.target);
    ARV_CHART = new Chart(cv, {
      type:'line',
      data:{
        labels: janela.map(d => arvFmtDataCurta(d.iso)),
        datasets: [
          alvo !== null && { label:'Target', data: janela.map(() => alvo), borderColor:'var(--text-muted)', borderDash:[5,4], borderWidth:1.2, pointRadius:0, fill:false },
          { label:'Resultado', data: janela.map(d => { const x = arvValor(k, d.iso); return x === null ? null : (k.unit === 'percent' ? x * 100 : x); }),
            borderColor:'#ee4d2d', backgroundColor:'rgba(238,77,45,.10)', borderWidth:2, pointRadius:3, pointHoverRadius:6, fill:true, tension:.25, spanGaps:true },
        ].filter(Boolean),
      },
      options:{
        responsive:true, maintainAspectRatio:false, animation:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ display:false } },
        scales:{ x:{ grid:{ display:false }, ticks:{ font:{ size:10 }, maxRotation:0, autoSkip:true, maxTicksLimit:8 } },
                 y:{ ticks:{ font:{ size:10 }, callback:v => v + (k.unit === 'percent' ? '%' : '') } } },
      },
    });
  }
  document.getElementById('arv-detail-overlay').classList.add('open');
}
function arvSetInsightTab(tab){
  ARV_INSIGHT_TAB = tab;
  document.querySelectorAll('.arv-insight-tab').forEach(el => el.classList.remove('active'));
  const idx = tab === 'manual' ? 0 : 1;
  document.querySelectorAll('.arv-insight-tab')[idx]?.classList.add('active');
  const k = (ARV_DATA.kpis || []).find(x => x.id === ARV_SEL_KPI);
  arvRenderInsightBody(k ? (k.obs || {})[ARV_SEL_ISO] : null, arvLastInsightsAuto);
}
let arvLastInsightsAuto = [];
function arvRenderInsightBody(obsHoje, insightsAuto){
  arvLastInsightsAuto = insightsAuto;
  const el = document.getElementById('arv-insight-body');
  if(!el) return;
  if(ARV_INSIGHT_TAB === 'manual'){
    el.innerHTML = obsHoje
      ? `<div class="arv-insight-manual"><i class="fas fa-note-sticky" style="color:var(--orange);margin-right:6px"></i>${pulsoEscHtml(obsHoje)}</div>`
      : `<div class="arv-insight-empty">Nenhum insight cadastrado para este KPI nesta data (coluna Observação, planilha árvore_pulso).</div>`;
  }else{
    el.innerHTML = insightsAuto.length
      ? insightsAuto.map(ins => `<div class="arv-insight"><i class="fas ${ins.icone}" style="color:${ins.cor};margin-top:2px"></i><span>${ins.texto}</span></div>`).join('')
      : `<div class="arv-insight-empty">Sem dados suficientes para gerar insights automáticos.</div>`;
  }
}
function arvCloseDetail(){
  document.getElementById('arv-detail-overlay').classList.remove('open');
  if(ARV_CHART){ ARV_CHART.destroy(); ARV_CHART = null; }
}
// Leitura automática do KPI ("COP Boy") — texto derivado dos números, nunca
// fixo. Complementa (não substitui) o insight oficial da coluna Observação.
const ARV_ICONES = {
  check:['fa-circle-check','var(--green)'], warn:['fa-triangle-exclamation','var(--amber)'],
  alert:['fa-circle-exclamation','var(--red)'], up:['fa-arrow-trend-up','var(--green)'],
  down:['fa-arrow-trend-down','var(--red)'], target:['fa-bullseye','var(--orange)'], dash:['fa-circle-minus','var(--text-muted)'],
};
function arvIns(icone, texto){ const [i,c] = ARV_ICONES[icone]; return { icone:i, cor:c, texto }; }
function arvInsights(kpi, v, st, dOntem, dRef, refLabel, turnoEntries, trailingValues){
  const out = [];
  const gapTexto = (v !== null && kpi.target !== null) ? (() => {
    const gap = v - kpi.target;
    const dir = gap > 0 ? 'acima' : 'abaixo';
    const mag = arvFmtDelta(kpi, Math.abs(gap));
    return `${mag} ${dir} do Target`;
  })() : null;

  switch(st.key){
    case 'in_target': out.push(arvIns('check', 'O resultado está dentro do Target.')); break;
    case 'in_target_stable': out.push(arvIns('check', 'O resultado está dentro do Target e estável em relação ao período anterior.')); break;
    case 'in_target_worsening': out.push(arvIns('warn', 'O resultado está dentro do Target, mas a tendência é de piora.')); break;
    case 'out_target_improving': out.push(arvIns('up', gapTexto ? `O resultado está ${gapTexto}, porém melhorando e se aproximando da meta.` : 'O resultado está fora do Target, porém melhorando.')); break;
    case 'out_target_worsening': out.push(arvIns('alert', gapTexto ? `O resultado está ${gapTexto} e piorando.` : 'O resultado está fora do Target e piorando.')); break;
    default: out.push(arvIns('dash', 'Não há dado suficiente para avaliar este indicador na data selecionada.'));
  }

  if(dOntem !== null){
    const m = arvMelhorou(kpi, dOntem);
    const mag = arvFmtDelta(kpi, Math.abs(dOntem));
    if(m === true) out.push(arvIns('up', `O indicador apresentou melhora de ${mag} em relação ao D-1.`));
    else if(m === false) out.push(arvIns('down', `O indicador apresentou piora de ${mag} em relação ao D-1.`));
  }
  if(dRef !== null){
    const m = arvMelhorou(kpi, dRef);
    if(m === true) out.push(arvIns('up', `O indicador apresentou melhora em relação à semana ${refLabel || 'anterior'}.`));
    else if(m === false) out.push(arvIns('down', `O indicador apresentou piora em relação à semana ${refLabel || 'anterior'}.`));
  }
  const streak = arvTrendStreak(kpi, trailingValues);
  if(streak) out.push(arvIns(streak.improved ? 'up' : 'down', `O indicador apresentou ${streak.improved ? 'melhora' : 'piora'} nos últimos ${streak.periods} períodos.`));

  if(turnoEntries && turnoEntries.length){
    const withData = turnoEntries.filter(t => t.value !== null);
    const foraTarget = withData.filter(t => t.statusLabel.key.indexOf('out_target') === 0);
    const dentro = withData.filter(t => t.statusLabel.key.indexOf('in_target') === 0);
    if(foraTarget.length === 1 && dentro.length === withData.length - 1 && withData.length > 1){
      out.push(arvIns('alert', `${foraTarget[0].turno} é o único turno fora do target.`));
    }else if(foraTarget.length > 0 && foraTarget.length < withData.length){
      out.push(arvIns('alert', `${foraTarget.map(t => t.turno).join(', ')} ${foraTarget.length > 1 ? 'estão' : 'está'} fora do target.`));
    }else if(foraTarget.length === 0 && withData.length > 0){
      out.push(arvIns('check', 'Todos os turnos estão dentro do target.'));
    }
    if(withData.length > 1){
      const worst = withData.reduce((acc, t) => {
        const d = kpi.polarity === 'lower_better' ? t.value : -t.value;
        const accD = kpi.polarity === 'lower_better' ? acc.value : -acc.value;
        return d > accD ? t : acc;
      });
      if(worst.statusLabel.key.indexOf('in_target') !== 0) out.push(arvIns('target', `O maior desvio está concentrado no turno ${worst.turno}.`));
    }
  }
  return out.slice(0, 6);
}

