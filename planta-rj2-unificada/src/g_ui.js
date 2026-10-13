
/* ------------------------------------------------------------------ */
/* Render: oclusão de ambiente, profundidade de campo e antisserrilhado  */
/* ------------------------------------------------------------------ */
let pipeline = null, dofFocus = null, gi = null;
let quality = (() => { try { return localStorage.getItem('maquete-qualidade') || null; } catch (e) { return null; } })() || (innerWidth < 760 ? 'leve' : 'alta');
/* pipeline estilo Unreal em nós TSL:
   cena (cor, cor difusa, normal, velocidade) → SSGI (luz indireta + oclusão) → bloom → profundidade de campo
   → motion blur por objeto → TRAA (antisserrilhado temporal) → vinheta → tom fílmico */
function setupRender() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(quality === 'cinema' ? Math.min(dpr, 2) : quality === 'alta' ? Math.min(dpr, 1.5) : Math.min(dpr, 1.25));
  const ms = quality === 'leve' ? 2048 : 4096;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (pipeline && pipeline.dispose) pipeline.dispose();
  pipeline = null; dofFocus = null; gi = null;
  if (quality !== 'leve') {
    const T = TSL, cine = quality === 'cinema';
    const scenePass = T.pass(scene, camera);
    scenePass.setMRT(T.mrt({ output: T.output, diffuseColor: T.diffuseColor, normal: T.packNormalToRGB(T.normalView), velocity: T.velocity }));
    const color = scenePass.getTextureNode('output'), diffuse = scenePass.getTextureNode('diffuseColor');
    const depth = scenePass.getTextureNode('depth'), normalT = scenePass.getTextureNode('normal'), vel = scenePass.getTextureNode('velocity');
    scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType; scenePass.getTexture('normal').type = THREE.UnsignedByteType;
    const sceneNormal = T.sample(uv => T.unpackRGBToNormal(normalT.sample(uv)));
    gi = ssgi(color, depth, sceneNormal, camera);
    gi.sliceCount.value = cine ? 2 : 1; gi.stepCount.value = cine ? 10 : 8;
    gi.radius.value = 6; gi.giIntensity.value = cine ? 2.2 : 1.8; gi.aoIntensity.value = 1.1; gi.thickness.value = .6;
    let out = (window.__rp || {}).gi === false ? color : T.vec4(T.add(color.rgb.mul(gi.a), diffuse.rgb.mul(gi.rgb)), color.a);
    if (cine) out = out.add(bloom(out, .08, .3, .95));
    if ($('#dof').checked) { dofFocus = T.uniform(20); out = dof(T.convertToTexture(out), scenePass.getViewZNode(), dofFocus, T.uniform(8), T.uniform(1.2)); }
    const dbg = window.__rp || {};
    // motion blur só no modo cinema, com vetor limitado (nunca vira rastro): pessoas, paleteiras e volumes na esteira
    if (cine && dbg.mb !== false) out = motionBlur(T.convertToTexture(out), T.clamp(vel.xy.mul(T.uniform(.35)), T.vec2(-.006, -.006), T.vec2(.006, .006)), T.int(10));
    if (dbg.traa !== false) out = traa(out, depth, vel, camera);
    const vig = T.float(1).sub(T.smoothstep(T.float(.42), T.float(.95), T.screenUV.distance(T.vec2(.5, .5))).mul(.3));
    pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputNode = T.vec4(out.rgb.mul(vig), out.a);
  }
  resize();
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (photo && photo.glr) { photo.glr.setSize(w, h, false); if (photo.ready) photo.pt.updateCamera(); }
}
addEventListener('resize', resize);

/* ------------------------------------------------------------------ */
/* Câmeras                                                             */
/* ------------------------------------------------------------------ */
let camTween = null, follow = null, viewLine = 0;
function buildLineSel() {   // escolhe a esteira das vistas de linha (eixo, ilha, indução, goleiro, buffers)
  const el = $('#lineSel'); if (!el) return;
  el.innerHTML = '';
  viewLine = Math.min(viewLine, LINES.length - 1);
  LINES.forEach((ln, i) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = ln.S.short; b.setAttribute('aria-pressed', String(i === viewLine));
    b.addEventListener('click', () => {
      viewLine = i; el.querySelectorAll('.btn').forEach((o, j) => o.setAttribute('aria-pressed', String(j === i)));
      const cur = document.querySelector('#views [aria-pressed=true]')?.dataset.view;
      goView(['aerea', 'planta', 'recebimento', 'stretch', 'caminho', 'avarias'].includes(cur) ? 'eixo' : (cur || 'eixo'));
    });
    el.appendChild(b);
  });
}
function viewDef(name) {
  const W = L.bx1 - L.bx0, D = L.bz1 - L.bz0, cx = (L.bx0 + L.bx1) / 2, cz = (L.bz0 + L.bz1) / 2, k = Math.max(W, D) / 92, hw = L.bw / 2;
  const narrow = innerWidth < 760 ? 1.35 : 1;
  const mid = LINES[Math.min(viewLine, LINES.length - 1)], zm = mid.z;
  const isl = mid.S.islands[Math.min(1, mid.S.islands.length - 1)];
  const loc = (x, y, z) => isl.grp.localToWorld(V3(x, y, z));
  const av = PLANT.avArea.length ? PLANT.avArea[0].pos : V3(L.xE, 0, L.zS);
  if (SORTER_MODE && SR.data) {
    srFrame();
    const sv = (X, Y, Z) => srW(X, Y, Z).toArray();
    const ch = SRV.chutes && SRV.chutes[Math.floor(SRV.chutes.length * .3)], it = SRV.inds && SRV.inds[4];
    switch (name) {
      case 'geral': { const b = srWorldBounds(); const cx0 = (b.x0 + b.x1) / 2, cz0 = (b.z0 + b.z1) / 2; return { p: [cx0 - 150 * narrow, 170 * narrow, cz0 + 120 * narrow], t: [cx0, 0, cz0 + 8], fov: 38 }; }
      case 'sorter': return { p: sv(408, 160, 34), t: sv(425, 203, 1), fov: 42 };
      case 'docas': return { p: sv(452, 238, 9), t: sv(455, 266, 1.4), fov: 46 };
      case 'rampas': if (ch) { const q = ch.bag.clone().addScaledVector(ch.out, 7.5); return { p: [q.x, 4.6, q.z + 2], t: [ch.bag.x, 1.0, ch.bag.z], fov: 50 }; } break;
      case 'indsorter': if (it) { const q = it.w.home; return { p: [q.x - 5, 4.2, q.z + 5], t: [q.x, 1, q.z], fov: 50 }; } break;
    }
  }
  switch (name) {
    case 'aerea': return { p: [cx - 52 * k * narrow, 78 * k * narrow, cz + 74 * k * narrow], t: [cx + 2, 0, cz + 4], fov: 38 };
    case 'eixo': return { p: [L.X0 - 12, 9.6, zm + .01], t: [L.X0 + 30, 0, zm], fov: 46 };
    case 'planta': return { p: [cx, 142 * k * narrow, cz + .01], t: [cx, 0, cz], fov: 38 };
    case 'ilha': { const p = loc(L.rackW / 2 + P.corredorFlow / 2, 1.62, L.rack1 + 1.6), t = loc(-.4, .95, L.rack0 * .5); return { p: p.toArray(), t: t.toArray(), fov: 50 }; }
    case 'inducao': return { p: [L.X0 + L.ind * .78, 1.72, zm + hw + 3.6], t: [L.X0 + 1.2, .95, zm], fov: 52 };
    case 'goleiro': return { p: [L.golX + 4.2, 2.1, zm + hw + 4.2], t: [L.golX - .2, .95, zm], fov: 48 };
    case 'lateral': return { p: [L.golX + 1.5, 4.8, zm + 9.5], t: [L.eastBufX - .5, .9, zm], fov: 46 };
    case 'gaiolas': return { p: [L.X0 + 4.5, 4.6, zm + 8.5], t: [L.cageBufX + .5, .9, zm], fov: 50 };
    case 'recebimento': return { p: [L.xW + 3, 9, cz + 14], t: [(L.pbx0 + L.pbx1) / 2, 0, cz - 4], fov: 50 };
    case 'stretch': return { p: [L.xW + 3, 6.2, L.zLaneSW - 5], t: [L.xR + 7.5, .6, L.zLaneSW + 7], fov: 50 };
    case 'avarias': return { p: [av.x + 2, 4.6, av.z - 8], t: [av.x + 3, .8, av.z + 2], fov: 50 };
    case 'caminho': return { p: [L.xE - 2, 3.2, L.zCS - 5], t: [L.xE - 18, .6, L.zCS + 1.5], fov: 50 };
  }
  return null;
}
function goView(name, instant = false) {
  document.querySelectorAll('#views .btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  follow = null;
  if (name === 'paleteira') {
    const LS = (LINES[viewLine] || LINES[0]).S;
    const u = [...LS.jacks[1], ...LS.jacks[-1]].find(x => x.task) || [...S.jacks[1], ...S.jacks[-1]].find(x => x.task) || S.jacks[1][0] || S.jacks[-1][0];
    if (!u) return;
    follow = { u }; camTween = null; return;
  }
  const v = viewDef(name); if (!v) return;
  const to = { p: V3(...v.p), t: V3(...v.t), fov: v.fov };
  if (instant || reduceMotion) { camera.position.copy(to.p); controls.target.copy(to.t); camera.fov = to.fov; camera.updateProjectionMatrix(); camTween = null; return; }
  camTween = { from: { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov }, to, t: 0, dur: 1.6 };
}
function tweenCam(dt) {
  if (follow) {
    const u = follow.u, pos = u.grp.position;
    const want = V3(pos.x, 1.0, pos.z), cam = V3(pos.x - 5.5, 3.8, pos.z + (pos.z > 0 ? -5.5 : 5.5) * -1);
    const k = Math.min(1, dt * 2.5);
    controls.target.lerp(want, k); camera.position.lerp(cam, k);
    if (Math.abs(camera.fov - 48) > .1) { camera.fov = lerp(camera.fov, 48, k); camera.updateProjectionMatrix(); }
    return;
  }
  if (!camTween) return;
  camTween.t += dt; const k = ease(camTween.t / camTween.dur);
  camera.position.lerpVectors(camTween.from.p, camTween.to.p, k);
  controls.target.lerpVectors(camTween.from.t, camTween.to.t, k);
  camera.fov = lerp(camTween.from.fov, camTween.to.fov, k); camera.updateProjectionMatrix();
  if (camTween.t >= camTween.dur) camTween = null;
}
controls.addEventListener('start', () => { camTween = null; follow = null; });

/* ------------------------------------------------------------------ */
/* Interface: operação                                                 */
/* ------------------------------------------------------------------ */
let barEls = [], lcardEls = [];
/* cards por esteira (planta) e grupos de bancadas por esteira (painel) */
function buildBars() {
  const bars = $('#bars'); bars.innerHTML = ''; barEls = [];
  const cards = $('#lcards'); cards.innerHTML = ''; lcardEls = [];
  for (const ln of LINES) {
    const c = document.createElement('div'); c.className = 'lcard';
    c.innerHTML = `<h2>${ln.S.short}<small>${2 * L.nIsl} bancadas</small></h2>
      <div class="kpis"><div class="kpi hl"><span>Pacotes/h atual</span><b data-k="h">–</b></div>
      <div class="kpi"><span>Acumulado do turno</span><b data-k="acc">0</b></div>
      <div class="kpi"><span>Goleiro</span><b data-k="gol">0</b><small data-k="golp">–</small></div></div>`;
    cards.appendChild(c); lcardEls[ln.li] = c;
    const g = document.createElement('div'); g.className = 'bgroup';
    g.innerHTML = `<h3>${ln.S.short}<span data-k="tot">0 pct/h</span></h3><div class="bars"></div>`;
    bars.appendChild(g); ln.barHead = g.querySelector('[data-k=tot]');
    const box = g.querySelector('.bars');
    const n = ln.S.islands.length, half = n / 2;
    for (let r = 0; r < half; r++) for (const isl of [ln.S.islands[r], ln.S.islands[r + half]]) {
      const row = document.createElement('div'); row.className = 'bar';
      row.innerHTML = `<span>${isl.code}</span><span class="t"><i></i></span><span class="n">0</span>`;
      row.title = `Bancada ${isl.code}`;
      box.appendChild(row); barEls[isl.gidx] = row;
    }
  }
  const t = $('#ltable');
  t.tHead.innerHTML = `<tr><th></th>${LINES.map(ln => `<th title="${ln.S.short}">${ln.S.short.replace('Termoplástica', 'Termo')}</th>`).join('')}<th>Total</th></tr>`;
  const rows = [['Induzidos/h', 'inH'], ['Saída/h', 'outH'], ['Pesca', 'pick'], ['Separados', 'sep'],
    ['Goleiro', 'kept'], ['Goleiro %', 'keptP'], ['Troca scuttle', 'sw'], ['Troca gaiola', 'cg'], ['Expedidas', 'exp']];
  t.tBodies[0].innerHTML = rows.map(([lab, k]) => `<tr><th>${lab}</th>${LINES.map(ln => `<td data-l="${ln.li}" data-k="${k}">–</td>`).join('')}<td data-l="tot" data-k="${k}">–</td></tr>`).join('');
  t.tFoot.innerHTML = '';
}
/* taxa por hora nos últimos 10 min de um histórico [t, ...valores] */
function rateOf(h, t, get) {
  if (!h || !h.length) return null;
  const a = h.find(x => x[0] >= t - 600) || h[0], b = h[h.length - 1], dt = b[0] - a[0];
  return dt > 20 ? (get(b) - get(a)) / dt * 3600 : null;
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '–';
function headcount(p) {
  const nIsl = 2 * p.ilhasPorLado, n = p.linhas;
  return [
    ['Indução', n * (2 * p.inducaoPorLado + p.inducaoPonta)], ['Pescadores', n * nIsl * p.pescadoresPorIlha], ['Separadores', n * nIsl * p.separadoresPorIlha],
    ['Goleiros', n * p.goleiros], ['Paleteiros (scuttle)', n * 2 * p.paleteirosPorLado], ['Setup de gaiolas', n * 2 * p.setupPorLado],
    ['Recebimento', p.recebimento], ['Abastecimento de gaiolas', p.abastGaiolas], ['Abastecimento de scuttles', p.abastScuttles],
    ['Montagem / stretch manual', p.stretchManual], ['Operador do robô', p.operadorRobo], ['Saída / descarga', p.carregadoresSaida], ['Tratativa de avarias', p.tratativa], ['Liderança', p.lideres],
  ];
}
function refreshSpec() {
  const tot = headcount(P).reduce((a, [, n]) => a + n, 0);
  $('#spec').innerHTML = `
    <dt>Planta</dt><dd>${L.nLines} esteiras · galpão ${fmtM(L.bx1 - L.bx0, 0)} × ${fmtM(L.bz1 - L.bz0, 0)} m</dd>
    <dt>Esteira</dt><dd>${fmtM(L.len)} × ${fmtM(L.bw)} m · ${fmtM(P.velEsteira)} m/s</dd>
    <dt>Volume</dt><dd>${fmt(P.capacidade)} pct/h por esteira · ${fmt(P.capacidade * L.nLines)} no total · ineficiência ${P.ineficiencia}%</dd>
    <dt>PHD</dt><dd>indução ${fmt(P.phdInducao)} · pesca ${fmt(P.phdPescador)} · sep. ${fmt(P.phdSeparador)}</dd>
    <dt>Ilhas</dt><dd>${2 * L.nIsl * L.nLines} (${2 * L.nIsl} por esteira) · flow rack ${fmtM(L.rackW, 1)} × ${fmtM(L.rackL, 1)} m</dd>
    <dt>Scuttle</dt><dd>1,20 × 1,00 × ${fmtM(P.scuttleAlt)} m · ${P.scuttleCap} vol. · ${fmtM(pkgTargetM3(P) * 1000, 1)} L/vol.</dd>
    <dt>Goleiro</dt><dd>${P.goleiros} por esteira · ${P.gaiolasGoleiro} gaiolas · ${P.goleiroPct}%</dd>
    <dt>Montagem</dt><dd>1 robô (${P.tempoStretch} s) · ${P.stretchManual} manual (${P.tempoMontagem} + ${P.tempoStretchManual} s)</dd>
    <dt>Avarias</dt><dd>${P.avariaPct}% do goleiro · ${P.tratativa} pessoa(s) · ${P.tempoAvaria} s/volume</dd>
    <dt>Pessoas</dt><dd>${tot} na operação</dd>`;
  $('#kPeople').textContent = `${S.workers.length} pessoas`;
}
function refreshHud() {
  if (!AGG || !LINES.length || !$('#loading').hidden) return;
  const tab = $('#ltable'), set = (l, k, v) => { const el = tab.querySelector(`td[data-l="${l}"][data-k="${k}"]`); if (el) el.textContent = v; };
  const tot = { inH: 0, outH: 0, pick: 0, sep: 0, kept: 0, sw: 0, cg: 0, exp: 0, acc: 0, kAcc: 0 };
  let ok = true;
  for (const ln of LINES) {
    const s = ln.S, h = s.hist2;
    const outH = rateOf(h, s.t, x => x[1]);
    const inH = rateOf(h, s.t, x => x[4]);
    const acc = s.picked + s.kept - (s.out0 || 0), kAcc = s.kept - (s.kept0 || 0);
    const c = lcardEls[ln.li];
    if (c) {
      c.querySelector('[data-k=h]').textContent = outH == null ? '–' : fmt(outH);
      c.querySelector('[data-k=acc]').textContent = fmt(acc);
      c.querySelector('[data-k=gol]').textContent = fmt(kAcc);
      c.querySelector('[data-k=golp]').textContent = pct(kAcc, acc) + ' do total';
    }
    set(ln.li, 'inH', inH == null ? '–' : fmt(inH)); set(ln.li, 'outH', outH == null ? '–' : fmt(outH));
    set(ln.li, 'pick', fmt(s.picked)); set(ln.li, 'sep', fmt(s.sep)); set(ln.li, 'kept', fmt(s.kept));
    set(ln.li, 'keptP', pct(s.kept, s.picked + s.kept));
    set(ln.li, 'sw', fmt(s.swaps)); set(ln.li, 'cg', fmt(s.cageSwaps)); set(ln.li, 'exp', fmt(s.shipped));
    if (outH == null) ok = false;
    tot.inH += inH || 0; tot.outH += outH || 0; tot.pick += s.picked; tot.sep += s.sep; tot.kept += s.kept;
    tot.sw += s.swaps; tot.cg += s.cageSwaps; tot.exp += s.shipped; tot.acc += acc; tot.kAcc += kAcc;
    // bancadas: volumes por hora (barra) e acumulado do turno
    let lineIsl = 0; const rates = [];
    s.islands.forEach((isl, k) => { const r = rateOf(h, s.t, x => x[3][k]); rates[k] = r; lineIsl += r || 0; });
    const max = Math.max(1, ...rates.map(r => r || 0));
    s.islands.forEach((isl, k) => {
      const el = barEls[isl.gidx]; if (!el) return;
      const r = rates[k], n = isl.count - (isl.count0 || 0);
      el.querySelector('i').style.width = (100 * (r || 0) / max) + '%';
      el.querySelector('.n').textContent = r == null ? fmt(n) : `${fmt(r)}/h`;
      el.title = `Bancada ${isl.code}: ${r == null ? '–' : fmt(r)} vol/h · ${fmt(n)} no turno`;
    });
    if (ln.barHead) ln.barHead.textContent = `${fmt(lineIsl)} vol/h`;
  }
  set('tot', 'inH', ok ? fmt(tot.inH) : '–'); set('tot', 'outH', ok ? fmt(tot.outH) : '–');
  for (const k of ['pick', 'sep', 'kept', 'sw', 'cg', 'exp']) set('tot', k, fmt(tot[k]));
  set('tot', 'keptP', pct(tot.kept, tot.pick + tot.kept));
  set('tot', 'exp', fmt(AGG.shipped));
  const T0 = LINES[0].S, sec = Math.max(0, T0.t - (T0.t0 || 0));
  $('#shiftT').textContent = `turno ${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
}
setInterval(refreshHud, 400);

/* abas e painel */
document.querySelectorAll('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tabs [role=tab]').forEach(o => o.setAttribute('aria-selected', String(o === t)));
  for (const k of ['op', 'cfg', 'pl']) $('#tab-' + k).hidden = t.dataset.tab !== k;
  $('#panel').classList.remove('closed');
}));
$('#collapse').addEventListener('click', () => $('#panel').classList.toggle('closed'));
if (innerWidth < 760) $('#panel').classList.add('closed');
$('#views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) goView(b.dataset.view); });
let speedMul = 1, running = true;
$('#simSpeed').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (!b) return;
  speedMul = +b.dataset.s;
  document.querySelectorAll('#simSpeed .btn').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
});
$('#play').addEventListener('click', e => {
  running = !running; e.currentTarget.textContent = running ? 'Pausar' : 'Continuar';
  e.currentTarget.setAttribute('aria-pressed', String(!running));
});
$('#quality').value = quality;
$('#quality').addEventListener('change', e => { quality = e.target.value; try { localStorage.setItem('maquete-qualidade', quality); } catch (er) {} setupRender(); });
$('#dims').addEventListener('change', e => { if (dimGroup) dimGroup.visible = e.target.checked; });
$('#dof').addEventListener('change', () => setupRender());
$('#ghost').addEventListener('change', e => {
  const on = e.target.checked;
  for (const m of [MAT.kraft, MAT.kraftIn]) { m.transparent = on; m.opacity = on ? .3 : 1; m.depthWrite = !on; m.needsUpdate = true; }
});

/* ------------------------------------------------------------------ */
/* Interface: premissas                                                */
/* ------------------------------------------------------------------ */
const form = $('#cfgForm');
function buildForm() {
  let html = '';
  for (const g of SCHEMA) {
    html += `<fieldset><legend>${g.group}</legend>`;
    for (const [k, label, unit, mn, mx, st] of g.fields) {
      html += `<div class="field"><label for="cfg-${k}">${label}</label><span class="inp"><input id="cfg-${k}" name="${k}" type="number" inputmode="decimal" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"><span class="u">${unit}</span></span></div>`;
    }
    html += `</fieldset>`;
  }
  html += `<div><div class="sec-title"><span>Resultado das premissas</span></div><dl class="derived" id="derived"></dl><p class="warn" id="cfgWarn" hidden></p></div>`;
  html += `<div class="cfg-actions"><button class="btn primary" type="submit">Aplicar e remontar</button><button class="btn" type="button" id="cfgReset">Restaurar padrão</button><button class="btn" type="button" id="cfgCopy">Copiar</button></div>`;
  form.innerHTML = html;
  $('#cfgReset').addEventListener('click', () => { for (const k in DEFAULTS) { const el = $(`#cfg-${k}`); if (el) el.value = DEFAULTS[k]; } refreshDerived(); });
  $('#cfgCopy').addEventListener('click', e => {
    const txt = JSON.stringify(readForm(), null, 2), btn = e.currentTarget;
    const done = ok => { btn.textContent = ok ? 'Copiado' : 'Selecione e copie'; setTimeout(() => { btn.textContent = 'Copiar'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); else done(false);
  });
  refreshDerived();
}
function readForm() {
  const d = {};
  for (const g of SCHEMA) for (const [k] of g.fields) d[k] = parseFloat(String($(`#cfg-${k}`).value).replace(',', '.'));
  return sanitize(d);
}
function refreshDerived() {
  const p = readForm(), l = computeLayout(p);
  const eff = p.capacidade * (1 - p.ineficiencia / 100);
  const nInd = 2 * p.inducaoPorLado + p.inducaoPonta;
  const spacing = p.velEsteira * 3600 / Math.max(1, eff);
  const hc = headcount(p), tot = hc.reduce((a, [, n]) => a + n, 0);
  const nIsl = 2 * p.ilhasPorLado, indCap = nInd * p.phdInducao, flow = Math.min(eff, indCap);
  const perIsl = flow * (1 - p.goleiroPct / 100) / nIsl, toGol = flow * p.goleiroPct / 100;
  const util = (dem, cap) => cap > 0 ? Math.round(100 * dem / cap) : Infinity;
  const acts = [
    ['Indução', util(eff, indCap)],
    ['Pescador', util(perIsl, p.pescadoresPorIlha * p.phdPescador)],
    ['Separador', util(perIsl, p.separadoresPorIlha * p.phdSeparador)],
    ['Goleiro', util(toGol, p.goleiros * p.phdGoleiro)],
  ];
  const gargalo = indCap < eff ? 'indução' : 'esteira';
  $('#derived').innerHTML = `
    <dt class="tot">Vazão simulada</dt><dd class="tot">${fmt(flow)} pct/h</dd>
    <dt>Gargalo</dt><dd>${gargalo}</dd>
    <dt>Capacidade da indução</dt><dd>${fmt(indCap)} pct/h</dd>
    ${acts.map(([n, u]) => `<dt>Ocupação · ${n.toLowerCase()}</dt><dd style="color:${u > 100 ? 'var(--warn)' : 'inherit'}">${isFinite(u) ? u + '%' : '–'}</dd>`).join('')}
    <dt>Comprimento da esteira</dt><dd>${fmtM(l.len)} m</dd>
    <dt>Largura de cada ilha</dt><dd>${fmtM(2 * l.half)} m</dd>
    <dt>Área da planta</dt><dd>${fmtM(l.xEast - l.xWest, 0)} × ${fmtM(2 * l.zWall, 0)} m</dd>
    <dt>Vazão efetiva</dt><dd>${fmt(eff)} pct/h</dd>
    <dt>Por posição de indução</dt><dd>${nInd ? fmt(eff / nInd) : '–'} pct/h</dd>
    <dt>Por ilha</dt><dd>${fmt(eff * (1 - p.goleiroPct / 100) / (2 * p.ilhasPorLado))} pct/h</dd>
    <dt>Para o goleiro</dt><dd>${fmt(eff * p.goleiroPct / 100)} pct/h</dd>
    <dt>Espaçamento na esteira</dt><dd>${fmtM(spacing)} m</dd>
    <dt>Cubagem média por volume</dt><dd>${fmtM(pkgTargetM3(p) * 1000, 1)} L ≈ ${(() => { const s = Math.cbrt(pkgTargetM3(p) / .0336); return `${Math.round(40 * s)}×${Math.round(30 * s)}×${Math.round(28 * s)} cm`; })()}</dd>
    <dt>Scuttles nas ilhas</dt><dd>${2 * p.ilhasPorLado * 2 * p.scuttlesPorFila}</dd>
    ${hc.map(([n, v]) => `<dt>${n}</dt><dd>${v}</dd>`).join('')}
    <dt class="tot">Total de pessoas</dt><dd class="tot">${tot}</dd>`;
  const warn = $('#cfgWarn'), msgs = [];
  if (spacing < .9) msgs.push(`Espaçamento de ${fmtM(spacing)} m: volumes vão encostar na esteira. Aumente a velocidade ou reduza a capacidade.`);
  if (!nInd) msgs.push('Sem posições de indução: nenhum volume entra na esteira.');
  for (const [n, u] of acts) if (u > 100 && isFinite(u)) msgs.push(`${n} acima de 100% de ocupação: o excedente vai para o goleiro ou atrasa a linha.`);
  warn.hidden = !msgs.length; warn.textContent = msgs.join(' ');
}
form.addEventListener('input', refreshDerived);
form.addEventListener('submit', e => {
  e.preventDefault();
  P = readForm(); saveParams(P);
  rebuild();
});

/* exportação da cena em glTF binário (.glb), em metros, para Blender / Twinmotion.
   No link publicado o download passa pela permissão "downloads" (que aceita .zip, não .glb);
   aberto direto no computador, baixa o .glb puro. */
let downloadsNS = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloadsNS = d; }).catch(() => {}); } catch (e) {}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function zipStore(name, bytes) {   // .zip sem compressão, um arquivo
  let crc = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) crc = CRC_T[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); crc = (crc ^ 0xFFFFFFFF) >>> 0;
  const nm = new TextEncoder().encode(name), n = bytes.length;
  const lh = new DataView(new ArrayBuffer(30)), cd = new DataView(new ArrayBuffer(46)), end = new DataView(new ArrayBuffer(22));
  [[0, 0x04034b50, 4], [4, 20, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, nm.length, 2]].forEach(([o, v, s]) => s === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
  [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, n, 4], [24, n, 4], [28, nm.length, 2], [42, 0, 4]].forEach(([o, v, s]) => s === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true));
  const cdOff = 30 + nm.length + n, cdLen = 46 + nm.length;
  [[0, 0x06054b50, 4], [8, 1, 2], [10, 1, 2], [12, cdLen, 4], [16, cdOff, 4]].forEach(([o, v, s]) => s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
  return new Blob([lh.buffer, nm, bytes, cd.buffer, nm, end.buffer], { type: 'application/zip' });
}
$('#export').addEventListener('click', e => {
  const btn = e.currentTarget, label = btn.textContent;
  if (!ROOT || !THREE.GLTFExporter) return;
  btn.textContent = 'Gerando arquivo…'; btn.disabled = true;
  setTimeout(() => {
    const hidden = [], markers = [], slug = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    // nomes legíveis para trocar em lote no Unreal / Blender
    S.islands.forEach(i => { i.grp.name = `ilha_${i.code}`; i.slots.forEach(sl => { if (sl.sc) sl.sc.grp.name = `scuttle_I${i.code}_${sl.name}`; }); });
    hitTargets.forEach(h => { const r = h.userData.ref; if (!r || !r.grp) return; if (h.userData.kind === 'scuttle' && !r.grp.name) r.grp.name = 'scuttle_' + slug(r.code); if (h.userData.kind === 'cage') r.grp.name = 'gaiola_' + slug(r.name); });
    [1, -1].forEach(s => [...S.jacks[s], ...S.loaders[s]].forEach((u, i) => { u.grp.name = `paleteira_lado${s > 0 ? 'A' : 'B'}_${i + 1}`; }));
    S.workers.forEach(w => { w.root.name = `pessoa_${w.role}_${String(w.id).padStart(2, '0')}`; });
    if ($('#expMode').value === 'marcadores') {
      for (const w of S.workers) {
        const m = new THREE.Object3D(); w.root.getWorldPosition(m.position); w.root.getWorldQuaternion(m.quaternion);
        m.name = `marcador_${w.role}_${String(w.id).padStart(2, '0')}_${slug(w.where)}`; ROOT.add(m); markers.push(m);
        if (w.root.visible) { w.root.visible = false; hidden.push(w.root); }
      }
    }
    ROOT.traverse(o => {
      const skip = o.userData.noExport || o.isSprite || o.isLine || (o.material && o.material === MAT.hit);
      if (skip && o.visible) { o.visible = false; hidden.push(o); }
    });
    const done = (msg) => { hidden.forEach(o => { o.visible = true; }); markers.forEach(m => ROOT.remove(m)); btn.textContent = msg; btn.disabled = false; setTimeout(() => { btn.textContent = label; }, 2500); };
    try {
      new THREE.GLTFExporter().parse(ROOT, result => {
        const mb = b => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
        const fname = markers.length ? 'maquete-esteira-marcadores.glb' : 'maquete-esteira.glb';
        if (downloadsNS) {
          const zip = zipStore(fname, new Uint8Array(result));
          done('Confirme o download…');
          downloadsNS.save({ filename: fname.replace('.glb', '-glb.zip'), data: zip })
            .then(() => { btn.textContent = `Baixado (${mb(zip.size)}, .zip)`; setTimeout(() => { btn.textContent = label; }, 3000); })
            .catch(err => { btn.textContent = err && err.code === 'declined' ? 'Download cancelado' : 'Download indisponível aqui'; setTimeout(() => { btn.textContent = label; }, 3000); });
          return;
        }
        try {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          done(`Arquivo gerado (${mb(blob.size)})`);
        } catch (err) { done('Download bloqueado aqui'); }
      }, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    } catch (err) { done('Não foi possível exportar'); }
  }, 30);
});

/* tooltip */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = $('#tip');
let pointer = null;
renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerleave', () => { pointer = null; tip.hidden = true; });
function updateTip() {
  if (!pointer || !S) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((pointer.x - r.left) / r.width * 2 - 1, -(pointer.y - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(hitTargets, false)[0];
  if (!hit) { tip.hidden = true; return; }
  const { kind, ref } = hit.object.userData;
  if (kind === 'scuttle') tip.innerHTML = `<b>SCUTTLE ${ref.code}</b><br><span class="m">1,20 × 1,00 × ${fmtM(P.scuttleAlt)} m sobre PBR</span><br>${ref.fill}/${ref.cap} volumes`;
  else if (kind === 'cage') tip.innerHTML = `<b>${ref.name.toUpperCase()}</b><br><span class="m">Gaiola 1,20 × 1,00 × ${fmtM(P.gaiolaAlt)} m</span><br>${ref.fill}/${ref.cap} volumes`;
  else if (kind === 'worker') tip.innerHTML = `<b>${ref.label.toUpperCase()}</b><br><span class="m">${ref.where}</span><br>${ref.state}`;
  tip.hidden = false;
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, pointer.x + 14) + 'px';
  tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, pointer.y + 14) + 'px';
}
// alvos de hover dos colaboradores
function collectWorkerHits() { for (const w of S.workers) { const h = w.root.children.find(c => c.userData && c.userData.kind === 'worker'); if (h) hitTargets.push(h); } }

/* ------------------------------------------------------------------ */
/* Montagem, remontagem e laço                                          */
/* ------------------------------------------------------------------ */
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function setLoad(f, msg) { $('#loadBar').style.width = (f * 100) + '%'; if (msg) $('#loadMsg').textContent = msg; }
async function rebuild(first = false) {
  const ld = $('#loading'); ld.hidden = false; setLoad(.15, first ? 'Montando o centro de distribuição…' : 'Remontando com as novas premissas…');
  await nextFrame();
  MH_LIVE = []; buildWorld(); collectWorkerHits(); setLoad(.65, 'Simulando os primeiros minutos da operação…');
  await nextFrame();
  afterBuild(); buildBars(); buildLineSel(); refreshSpec(); refreshHud();
  if (first) { setupRender(); goView(SORTER_MODE && SR.data ? 'geral' : 'aerea', true); } else goView(document.querySelector('#views [aria-pressed=true]')?.dataset.view || (SORTER_MODE ? 'geral' : 'aerea'), true);
  setLoad(1); await nextFrame(); ld.hidden = true;
}
/* ------------------------------------------------------------------ */
/* Foto realista: traçado de caminho progressivo sobre a cena viva       */
/* ------------------------------------------------------------------ */
let photo = null;
const photoBtn = $('#photo'), photoInfo = $('#photoInfo');
/* cena da foto: toda malha visível no quadro vira geometria uniforme em coordenadas do mundo
   (posição, normal, uv, índice de 32 bits), com as pessoas na pose atual */
function buildPhotoScene(filter) {
  const ps = new THREE.Scene(); ps.background = scene.background;
  ps.environment = ENV_EQUI || scene.environment;
  for (const L0 of [sun, fillL]) { const l = L0.clone(); l.castShadow = false; l.target = new THREE.Object3D(); l.target.position.copy(L0.target.position); ps.add(l, l.target); }
  camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const camP = camera.position, sph = new THREE.Sphere(), maxD = Math.max(45, camP.distanceTo(controls.target) * 1.8);
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3(), canon = new Map();
  const keyOf = m => [m.type, m.color && m.color.getHex(), m.map && m.map.uuid, m.normalMap && m.normalMap.uuid, m.roughnessMap && m.roughnessMap.uuid,
    m.roughness, m.metalness, m.opacity, m.transparent, m.side, m.emissive && m.emissive.getHex(), m.vertexColors].join('|');
  const shared = new Set(Object.values(TEX)), plain = new Map();
  const canonM = m => {
    // texturas próprias (etiquetas, textos de piso, placas) viram cor lisa: o traçado aceita poucas texturas
    if (m.map && !shared.has(m.map) && window.__ptPlainLabels) {
      if (!plain.has(m)) { const q = m.clone(); q.map = null; if (m.isMeshBasicMaterial) q.color.set(0xf4f4f0); plain.set(m, q); }
      m = plain.get(m);
    }
    const k = keyOf(m); if (!canon.has(k)) canon.set(k, m); return canon.get(k);
  };
  let tris = 0;
  scene.traverseVisible(o => {
    if (!o.isMesh || o.material === MAT.hit || o.material === MAT.table || (dimGroup && isChildOf(o, dimGroup))) return;
    if (AO_HIDE.includes(o) && o.material && o.material.transparent) return;   // textos de piso e grade (decalques)
    const g = o.geometry; if (!g.attributes.position) return;
    if (!/^fixo_/.test(o.name)) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); sph.radius += 1;
      if (sph.center.distanceTo(camP) - sph.radius > maxD || !fr.intersectsSphere(sph)) return;
    }
    if (filter && !filter(o)) return;
    const n = g.attributes.position.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(g.attributes.position, i);
      v.applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const idx = g.index ? Uint32Array.from({ length: g.index.count }, (_, i) => g.index.getX(i)) : Uint32Array.from({ length: n }, (_, i) => i);
    bg.setIndex(new THREE.BufferAttribute(idx, 1));
    if (g.attributes.normal && !o.isSkinnedMesh) {
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < n; i++) { nv.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); N[i * 3] = nv.x; N[i * 3 + 1] = nv.y; N[i * 3 + 2] = nv.z; }
      bg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    } else bg.computeVertexNormals();
    if (g.attributes.uv) for (let i = 0; i < n; i++) { U[i * 2] = g.attributes.uv.getX(i); U[i * 2 + 1] = g.attributes.uv.getY(i); }
    bg.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    // material único: sem grupos (o índice já cobre todas as faces); grupos só com lista de materiais de verdade
    let mat = o.material;
    if (Array.isArray(mat) && g.groups.length) {
      for (const gr of g.groups) bg.addGroup(gr.start, gr.count, gr.materialIndex || 0);
      mat = mat.map(canonM);
    } else mat = canonM(Array.isArray(mat) ? mat[0] : mat);
    tris += idx.length / 3;
    ps.add(new THREE.Mesh(bg, mat));
  });
  const texs = new Set(); for (const m of canon.values()) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]);
  window.__ptTex = texs.size;
  return { ps, tris, mats: new Set([...canon.values()]).size };
}
function isChildOf(o, p) { for (let q = o.parent; q; q = q.parent) if (q === p) return true; return false; }
async function startPhoto(filter = null) {
  photoBtn.disabled = true; photoBtn.textContent = 'Preparando…';
  try {
    const { WebGLPathTracer } = await loadPathTracer();
    const wasRunning = running; running = false;
    for (const w of MH_LIVE) if (w.root.parent) mhSync(w);           // todas as pessoas na pose atual, em detalhe máximo
    photoBtn.textContent = 'Montando a cena…';
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const near = []; for (const w of MH_LIVE) if (w.root.parent && !w.mh.obj.visible) { w.mh.obj.visible = true; w.proc.visible = false; near.push(w); }
    const { ps, tris, mats } = buildPhotoScene(filter);
    for (const w of near) { w.mh.obj.visible = false; w.proc.visible = true; }
    window.__ptMats = mats;
    // o traçado de caminho roda num renderizador WebGL próprio, numa tela por cima do palco
    const glr = new THREE.WebGLRenderer({ antialias: false });
    glr.setPixelRatio(renderer.getPixelRatio()); glr.setSize(stage.clientWidth, stage.clientHeight, false);
    glr.toneMapping = renderer.toneMapping; glr.toneMappingExposure = renderer.toneMappingExposure; glr.outputColorSpace = THREE.SRGBColorSpace;
    Object.assign(glr.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    stage.appendChild(glr.domElement);
    const pt = new WebGLPathTracer(glr);
    Object.assign(pt, { renderDelay: 0, minSamples: 1, fadeDuration: 400, bounces: 5, filterGlossyFactor: .5, renderScale: Math.min(1, 1.5 / (renderer.getPixelRatio() || 1)) });
    pt.tiles.set(2, 2); pt.textureSize.set(1024, 1024);
    if (window.__ptOpts) { const o = window.__ptOpts; if (o.tiles) pt.tiles.set(o.tiles, o.tiles); if (o.tex) pt.textureSize.set(o.tex, o.tex); for (const k of ['rasterizeScene', 'renderScale', 'bounces']) if (k in o) pt[k] = o[k]; }
    photo = { pt, ps, glr, wasRunning, ready: false };
    pt.setScene(ps, camera);
    photo.ready = true;
    photoInfo.textContent = `${Math.round(tris / 1000)} mil triângulos`;
    photoBtn.textContent = 'Sair da foto'; photoBtn.setAttribute('aria-pressed', 'true');
  } catch (err) {
    console.error(err); if (photo) { photo.pt.dispose(); photo.glr.dispose(); photo.glr.domElement.remove(); running = photo.wasRunning; } photo = null;
    photoBtn.textContent = 'Foto indisponível'; setTimeout(() => { photoBtn.textContent = 'Foto realista'; }, 2500);
  }
  photoBtn.disabled = false;
}
function stopPhoto() {
  if (!photo) return;
  const p = photo; photo = null;
  p.pt.dispose(); p.ps.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  p.glr.dispose(); p.glr.domElement.remove();
  running = p.wasRunning; photoInfo.textContent = '';
  photoBtn.textContent = 'Foto realista'; photoBtn.setAttribute('aria-pressed', 'false');
}
photoBtn.addEventListener('click', () => { if (photo) stopPhoto(); else startPhoto(); });
controls.addEventListener('change', () => { if (photo && photo.ready) photo.pt.updateCamera(); });

const clock = new THREE.Timer();
let tick = 0;
function frame() {
  clock.update(); const real = Math.min(.1, clock.getDelta());
  if (photo) {
    tweenCam(real); controls.update();
    if (photo.ready) { photo.pt.renderSample(); photoInfo.textContent = `${Math.floor(photo.pt.samples)} amostras`; }
    requestAnimationFrame(frame); return;
  }
  if (S && running && !document.hidden && $('#loading').hidden) {
    let left = real * speedMul;
    while (left > 1e-6) { const h = Math.min(.05, left); update(h); left -= h; }
  }
  tweenCam(real); controls.update();
  if (roofGroup) roofGroup.visible = camera.position.y < H_ROOF - .3;
  if (dofFocus) dofFocus.value = camera.position.distanceTo(controls.target);
  if ((tick++ & 3) === 0) updateTip();
  if (tick % 4 === 1 || !S) sun.shadow.needsUpdate = true;
  mhSyncAll();
  if (pipeline) pipeline.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
buildForm();
setLoad(.05, 'Carregando as pessoas…');
Promise.all([
  renderer.init(),
  loadPeople().catch(err => console.warn('pessoas MakeHuman indisponíveis, usando bonecos simples', err)),
  loadEnvironment().catch(err => console.warn('HDRI indisponível', err)),
  SORTER_MODE ? loadSorter().catch(err => console.warn('sorter indisponível', err)) : null,
])
  .then(() => rebuild(true)).then(() => { requestAnimationFrame(frame); });
window.__maquete = { get gi() { return gi; }, get pipeline() { return pipeline; }, mhSync, startPhoto, stopPhoto, get photo() { return photo; }, get PLANT() { return PLANT; }, get LINES() { return LINES; }, get S() { return S; }, get L() { return L; }, get P() { return P; }, camera, controls, goView, renderer, scene, setQuality: q => { quality = q; setupRender(); }, update };
