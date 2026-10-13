/* ------------------------------------------------------------------ */
/* Planta: zonas, buffers da planta e equipes que ligam as linhas       */
/* ------------------------------------------------------------------ */
// Posições conforme a planta RJ2:
// - oeste: entrada (docas), buffer de scuttles e gaiolas, buffer de gaiolas (vazias), banheiros ao norte;
// - sudoeste: stretch com robô (1) e montagem/stretch manual de scuttles (2 pessoas);
// - centro: abastecimento e as 3 esteiras; leste: saída/descarga de scuttles e gaiolas (docas);
// - sul: circulação de pedestres (caminho seguro), mesa da liderança, tratativa de avarias e passagem de scuttles.
// Fluxos: scuttle vazia é montada (caixa no pallet + filme stretch) → buffer de scuttles → buffers laterais
// das linhas; scuttle cheia → buffer de saída da linha → saída/descarga → doca; avarias do goleiro → tratativa.
function newPlantState() {
  return {
    t: 0, induced: 0, picked: 0, sep: 0, kept: 0, swaps: 0, cageSwaps: 0, shipped: 0,
    received: 0, returned: 0, assembled: 0, scSupplied: 0, cgSupplied: 0, avFetched: 0, avTreated: 0,
    live: [], pool: [], workers: [], rec: [], cgW: [], scU: [], outU: [], smW: [], avW: [], roW: [],
    doorsIn: [], doorsOut: [], pFull: [], pEmpty: [], stock: [], st: [], outS: [], avArea: [], robotSt: null,
  };
}
function makeAgg() {
  const A = { hist: [] };
  Object.defineProperty(A, 't', { get: () => PLANT.t });
  for (const k of ['induced', 'picked', 'sep', 'kept', 'swaps', 'cageSwaps', 'avarias']) Object.defineProperty(A, k, { get: () => LINES.reduce((a, l) => a + (l.S[k] || 0), 0) });
  Object.defineProperty(A, 'shipped', { get: () => LINES.reduce((a, l) => a + l.S.shipped, 0) + PLANT.shipped });
  Object.defineProperty(A, 'islands', { get: () => LINES.flatMap(l => l.S.islands) });
  Object.defineProperty(A, 'workers', { get: () => [...LINES.flatMap(l => l.S.workers), ...PLANT.workers] });
  const bySide = (k, extra) => ({ get 1() { return [...LINES.flatMap(l => l.S[k][1]), ...(extra ? extra() : [])]; }, get '-1'() { return LINES.flatMap(l => l.S[k][-1]); } });
  A.jacks = bySide('jacks', () => [...PLANT.scU, ...PLANT.outU]); A.loaders = bySide('loaders'); A.setups = bySide('setups');
  return A;
}
const toRoot = (ln, v) => V3(v.x, 0, v.z + ln.z);
function addFilm(sc, k = .01) {   // filme stretch em volta da scuttle (cresce de baixo para cima)
  const f = new THREE.Mesh(ASSET.film, MAT.film); f.position.y = PAL_H; f.scale.y = Math.max(.01, (P.scuttleAlt - .05) * k);
  sc.grp.add(f); sc.film = f; return f;
}

function zoneBox(x0, z0, x1, z1, key, t = .08) {
  put(key, plane(x1 - x0, t), (x0 + x1) / 2, .006, z0); put(key, plane(x1 - x0, t), (x0 + x1) / 2, .006, z1);
  put(key, plane(t, z1 - z0), x0, .006, (z0 + z1) / 2); put(key, plane(t, z1 - z0), x1, .006, (z0 + z1) / 2);
}
function wallRun(axis, fixed, a, b, gaps, H = 3.0, T = .25) {   // parede ao longo de x ou z com vãos de porta
  const cuts = gaps.filter(g => g[1] > a && g[0] < b).sort((p, q) => p[0] - q[0]);
  let cur = a;
  const seg = (u, v) => {
    if (v - u < .05) return;
    if (axis === 'x') put('wallP', box(v - u, H, T), (u + v) / 2, H / 2, fixed); else put('wallP', box(T, H, v - u), fixed, H / 2, (u + v) / 2);
  };
  for (const [g0, g1] of cuts) {
    seg(cur, g0);
    const m = (g0 + g1) / 2, w = g1 - g0;    // verga, porta enrolada no alto e nivelador de doca
    if (axis === 'x') { put('wallP', box(w, .4, T), m, H - .2, fixed); put('doorDark', box(w - .1, .45, T * .6), m, H - .62, fixed); }
    else { put('wallP', box(T, .4, w), fixed, H - .2, m); put('doorDark', box(T * .6, .45, w - .1), fixed, H - .62, m); put('steelDark', box(1.4, .04, w - .3), fixed + (fixed < 0 ? .7 : -.7), .02, m); }
    cur = g1;
  }
  seg(cur, b);
}
function stationRobot() {   // robô de stretch: base redonda (tipo aspirador), mastro de 1,1 m e carro com o rolo de filme
  const grp = new THREE.Group();
  grp.add(instance(ASSET.robot));
  const car = new THREE.Group(); car.position.y = .45; grp.add(car);
  const roll = new THREE.Mesh(ASSET.robotRoll, MAT.filmRoll); roll.position.set(-.16, 0, 0); roll.castShadow = true; car.add(roll);
  const arm = new THREE.Mesh(ASSET.robotArm, MAT.steelDark); arm.position.set(-.08, 0, 0); car.add(arm);
  const led = new THREE.Mesh(ASSET.robotLed, MAT.robotLed); led.position.set(0, .66, 0); grp.add(led);
  return { grp, car, led };
}
function buildPlant() {
  const P0 = PLANT;
  ASSET.robot = buildAsset(() => {
    put('navy', cyl(.34, .22, 28), 0, .14, 0); put('rubber', cyl(.35, .05, 28), 0, .03, 0);
    put('white', cyl(.3, .02, 28), 0, .26, 0);
    put('steelDark', box(.07, .9, .07), 0, .7, 0); put('orange', box(.18, .08, .12), 0, 1.12, 0);
  });
  ASSET.robotRoll = new THREE.CylinderGeometry(.075, .075, .42, 16);
  ASSET.robotArm = new THREE.BoxGeometry(.14, .04, .04);
  ASSET.robotLed = new THREE.SphereGeometry(.035, 10, 8);
  // filme stretch: só as laterais (sem tampa nem fundo), justo na caixa, para o papelão aparecer por baixo
  ASSET.film = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(PI / 4).scale(1.03, 1, 1.23).translate(0, .5, 0);
  const zMidW = (L.zN + L.zS) / 2;

  /* paredes e docas: entrada a oeste; saída/descarga a leste (entre os pallets de saída); passagem de scuttles no sudeste */
  const doorW = 3.0;
  const zIn = []; for (let z = Math.ceil((L.zN + 4) / 7) * 7; z < L.zS - 3; z += 7) zIn.push(z);
  const nOut = 8, zO = Array.from({ length: nOut }, (_, i) => (i - (nOut - 1) / 2) * 4.2);
  const zOut = zO.slice(1).map((z, i) => (z + zO[i]) / 2);
  const zPass = (L.zS + L.bz1) / 2 + 1;
  wallRun('z', L.bx0, L.bz0, L.bz1, zIn.map(z => [z - doorW / 2, z + doorW / 2]));
  wallRun('z', L.bx1, L.bz0, L.bz1, [...zOut, zPass].map(z => [z - doorW / 2, z + doorW / 2]));
  if (!L.cmp) { wallRun('x', L.bz0, L.bx0, L.bx1, []); wallRun('x', L.bz1, L.bx0, L.bx1, []); }   // compacto: aberta para o sorter

  /* faixa norte: banheiros */
  const bN0 = L.bz0 + .2, bN1 = L.zN - 1.6, bx = L.pbx0;
  if (!L.cmp) for (const [i, nome] of [[0, 'BANHEIRO MASCULINO'], [1, 'BANHEIRO FEMININO']]) {
    const x0 = bx + i * 7.5, x1 = x0 + 7;
    put('wallP', box(x1 - x0, 2.4, .12), (x0 + x1) / 2, 1.2, bN1);
    put('wallP', box(.12, 2.4, bN1 - bN0), x0, 1.2, (bN0 + bN1) / 2); put('wallP', box(.12, 2.4, bN1 - bN0), x1, 1.2, (bN0 + bN1) / 2);
    put('doorDark', box(1.0, 2.1, .06), x0 + 1.4, 1.05, bN1 + .04);
    for (let k = 0; k < 3; k++) { put('white', box(.45, .42, .6), x0 + 2.8 + k * 1.3, .21, bN0 + .5); put('wallP', box(.05, 1.8, 1.4), x0 + 2.2 + k * 1.3, .9, bN0 + .75); }
    floorText(world, [{ t: nome, size: 64 }], (x0 + x1) / 2, (bN0 + bN1) / 2 + 1.2, 4.6, .6, 0, { w: 640, h: 96, color: '#4b5869' });
  }

  /* entrada (docas a oeste) e rotas seguras de pedestres nos cantos */
  zoneBox(L.bx0 + .4, L.zN + 1, L.xR + 1.2, L.zS - 1, 'green');
  floorText(world, [{ t: 'ENTRADA', size: 90 }, { t: 'scuttles e gaiolas', size: 40, weight: 600, font: MONO }], L.bx0 + 2.4, zMidW, 4.0, 1.4, -PI / 2, { w: 512, h: 180, color: '#1f6b41' });
  for (const z of zIn) {
    P0.doorsIn.push({ pos: V3(L.bx0 + 1.3, 0, z), psi: PI / 2, cage: null, res: false, kill: 0 });
    arrow(L.bx0 + 1.0, z + 1.9, 0, 1.6); arrow(L.bx0 + 2.6, z - 1.9, PI, 1.6);
  }
  for (const zr of [L.bz0 + 3.2, L.bz1 - 3.2]) {
    const rw = L.cmp ? 2.4 : 3.7;
    zoneBox(L.bx0 + .5, zr - 2.2, L.bx0 + .5 + rw, zr + 2.2, 'green', .1);
    floorText(world, [{ t: 'ROTA SEGURA', size: 70 }, { t: 'pedestres', size: 40, weight: 600, font: MONO }], L.bx0 + .5 + rw / 2, zr, 3.2, Math.min(1.1, rw - .4), -PI / 2, { w: 600, h: 180, color: '#1f6b41' });
  }

  /* buffers do oeste, em fileiras de frente para corredores que saem no corredor de abastecimento */
  const laneRows = (zl, make) => { for (const [dz, psi] of [[-1.6, PI], [1.6, 0]]) for (let i = 0; i < L.bufN; i++) {
    const pos = V3(L.pbx0 + .7 + i * 1.45, 0, zl + dz); make(pos, psi, dz);
    put('white', plane(1.3, .04), pos.x, .006, zl + dz + (dz < 0 ? -.6 : .6)); put('white', plane(.04, 1.2), pos.x - .7, .006, zl + dz);
  } };
  const zs = k => L.zN + 4.2 + k * L.lanePitch;
  const stockLanes = [zs(0), zs(1)], fullLanes = [zs(2), zs(3), zs(4)], emptyLanes = [zs(6), zs(7)];
  // buffer de scuttles (montadas e enroladas) + gaiolas cheias da entrada: área amarela
  stockLanes.forEach(zl => laneRows(zl, (pos, psi) => {
    const k = { T: pos, psi, sc: null, res: false };
    if (Math.random() < .75) { k.sc = newScuttle('VAZIA'); place(k.sc, world, pos, psi); addFilm(k.sc, 1); }
    P0.stock.push(k);
  }));
  fullLanes.forEach(zl => laneRows(zl, (pos, psi) => {
    const slot = { pos, psi: psi === PI ? 0 : PI, cage: null, res: false, t: -rand(0, 60) };
    if (Math.random() < .8) { slot.cage = newCage(P.gaiolaCap, 'Gaiola cheia (entrada)'); place(slot.cage, world, pos, slot.psi); }
    P0.pFull.push(slot);
  }));
  emptyLanes.forEach(zl => laneRows(zl, (pos, psi) => {
    const slot = { pos, psi: psi === PI ? 0 : PI, cage: null, res: false, t: -rand(0, 60) };
    if (Math.random() < .35) { slot.cage = newCage(0, 'Gaiola vazia'); place(slot.cage, world, pos, slot.psi); }
    P0.pEmpty.push(slot);
  }));
  zoneBox(L.pbx0 - .3, stockLanes[0] - 2.5, L.pbx1 + .3, fullLanes[2] + 2.5, 'yellow');
  zoneBox(L.pbx0 - .3, emptyLanes[0] - 2.5, L.pbx1 + .3, emptyLanes[1] + 2.5, 'red');
  floorText(world, [{ t: 'BUFFER DE SCUTTLES E GAIOLAS', size: 66 }, { t: 'scuttles montadas · gaiolas cheias da entrada', size: 34, weight: 600, font: MONO }], (L.pbx0 + L.pbx1) / 2, fullLanes[2] + 3.4, L.cmp ? 7 : 10, 1.3, 0, { w: 1000, h: 170, color: '#7a5d00' });
  floorText(world, [{ t: 'BUFFER DE GAIOLAS', size: 70 }, { t: 'gaiolas vazias · retorno pela entrada', size: 34, weight: 600, font: MONO }], (L.pbx0 + L.pbx1) / 2, emptyLanes[1] + 3.4, L.cmp ? 7 : 9, 1.3, 0, { w: 900, h: 170, color: '#a3271b' });
  hangSign(world, 'BUFFER', 'scuttles e gaiolas', (L.pbx0 + L.pbx1) / 2, stockLanes[0] - 3.6, 0, 4.6, 5.2);

  /* abastecimento das linhas (corredor oeste) */
  floorText(world, [{ t: 'ABASTECIMENTO DE SCUTTLES E GAIOLAS', size: 64 }], L.xW, zMidW + 14, 12, .9, -PI / 2, { w: 1100, h: 90, color: '#7a5d00' });
  for (const z of L.zLines) arrow(L.xW - 1.2, z + L.zAisle + 1.5, 0, 1.4);

  /* sudoeste: stretch com robô (1) e montagem com stretch manual (2 pessoas) */
  L.zLaneSW = L.zS - 14;
  const rx = L.xR + (L.cmp ? 3.2 : 4.1), rz = L.zLaneSW + 5;
  zoneBox(L.xR + .9, L.zLaneSW + 1.2, L.xR + (L.cmp ? 5.6 : 7.2), L.zS - .6, 'yellow');
  floorText(world, [{ t: 'STRETCH COM ROBÔ', size: 70 }, { t: 'montagem automática', size: 36, weight: 600, font: MONO }], rx, L.zS - 2, L.cmp ? 4.4 : 5.6, L.cmp ? 1.0 : 1.2, 0, { w: 700, h: 160, color: '#7a5d00' });
  put('white', cyl(1.42, .012, 48), rx, .004, rz); put('mat', cyl(1.34, .014, 48), rx, .005, rz);   // pista circular do robô
  { const r = stationRobot(); world.add(r.grp);
    P0.robotSt = { kind: 'robo', T: V3(rx, 0, rz), psi: 0, dist: 5, sc: null, res: false, state: 'livre', robot: r, ang: PI / 2, t0: 0, film: null, name: 'Stretch com robô' };
    P0.st.push(P0.robotSt);
    for (let k = 0; k < P.operadorRobo; k++) {   // operador: monta a caixa no pallet e libera o robô
      const w = makeWorker('operadorRobo'); w.home = V3(rx - 2.2 + k * 1.2, 0, L.zLaneSW + 2.2); w.root.position.copy(w.home);
      w.restYaw = 0; w.setYaw(0); w.where = 'Stretch com robô'; world.add(w.root); P0.roW.push(w); P0.workers.push(w);
    } }
  const mx = L.cmp ? L.xR + 8.0 : L.xW - 4.8, mzs = [L.zLaneSW + 4.2, L.zLaneSW + 10];
  zoneBox(L.xR + (L.cmp ? 5.9 : 7.5), L.zLaneSW + 1.2, L.xW - (L.cmp ? .4 : .7), L.zS - .6, 'navyP');
  floorText(world, [{ t: 'MONTAGEM DE SCUTTLES', size: 64 }, { t: 'stretch manual · 2 posições', size: 34, weight: 600, font: MONO }], mx - (L.cmp ? 1.4 : 2.6), L.zLaneSW + 7.1, L.cmp ? 4.2 : 5.6, L.cmp ? .5 : 1.1, -PI / 2, { w: 760, h: 160, color: '#1f3a5f' });
  for (let k = 0; k < 4; k++) put('wood', box(1.0, .14, 1.2), L.xW - 2.2, .07 + k * .15, L.zS - 1.6);      // pallets e caixas desmontadas
  for (let k = 0; k < 6; k++) put('kraft', box(1.15, .03, 1.3), L.xW - 2.2, .64 + k * .035, L.zS - 1.6);
  mzs.forEach((z, i) => {
    put('white', cyl(1.2, .01, 40), mx, .004, z);
    const st = { kind: 'manual', T: V3(mx, 0, z), psi: -PI / 2, dist: 3.1, sc: null, res: false, state: 'livre', film: null, name: `Stretch manual ${i + 1}` };
    P0.st.push(st);
    if (i < P.stretchManual) {
      const w = makeWorker('stretchManual'); w.home = V3(mx - 1.55, 0, z); w.root.position.copy(w.home);
      w.restYaw = PI / 2; w.setYaw(w.restYaw); w.where = 'Montagem de scuttles'; w.st = st; world.add(w.root); P0.smW.push(w); P0.workers.push(w);
    }
  });

  /* leste: saída / descarga de scuttles e gaiolas (pallets aguardando a doca) */
  const ox = L.xE + (L.cmp ? 2.2 : 3.6);
  zoneBox(L.xE + (L.cmp ? .6 : 1.2), zO[0] - 2.4, L.bx1 - .5, zO[nOut - 1] + 2.4, 'red');
  floorText(world, [{ t: 'SAÍDA / DESCARGA', size: 76 }, { t: 'scuttles e gaiolas', size: 38, weight: 600, font: MONO }], L.cmp ? L.xE + 4.4 : L.xE + 7.4, zMidW, 7, L.cmp ? 1.0 : 1.4, -PI / 2, { w: 800, h: 180, color: '#a3271b' });
  hangSign(world, 'SAÍDA', 'descarga de scuttles e gaiolas', ox, zO[0] - 4.2, 0, 4.6, 5.2);
  zO.forEach(z => { P0.outS.push({ T: V3(ox, 0, z), psi: PI / 2, sc: null, res: false, t: 0 }); put('white', plane(1.24, .04), ox, .006, z - .66); put('white', plane(1.24, .04), ox, .006, z + .66); });
  for (const z of zOut) { P0.doorsOut.push({ z }); arrow(L.bx1 - 2.6, z, 0, 1.6); }

  /* sul: circulação de pedestres (caminho seguro), mesa da liderança, tratativa de avarias e passagem de scuttles */
  const cs0 = L.zCS - L.cs / 2, cs1 = L.zCS + L.cs / 2, csEnd = L.bx1 - 3.2;
  zoneBox(L.xW - .4, cs0, csEnd, cs1, 'greenDark', .14);   // demarcação do caminho seguro: verde escuro, sem grade
  for (let x = L.xW + 4; x < csEnd - 4; x += 14) arrow(x, L.zCS, 0, 1.2);
  floorText(world, [{ t: 'CIRCULAÇÃO DE PEDESTRES', size: 66 }, { t: `caminho seguro · ${fmtM(L.cs)} m`, size: 36, weight: 600, font: MONO }], (L.xW + L.xE) / 2 - 10, L.zCS, 7, Math.min(L.cs * .9, 1.2), 0, { w: 900, h: 170, color: '#0d4a22' });
  if (L.cmp) buildEastRooms(P0, zO, nOut);
  else {
  const r0 = L.zRoom0, r1 = L.bz1 - .4, lx = L.xE - 22, bEnd = lx - 6;
    // mesa da liderança
    zoneBox(lx - 5, r0, lx + 5, r1, 'navyP');
    put('wood', box(3.2, .06, 1.4), lx, .76, r0 + 3.6); put('steelDark', box(3.0, .72, 1.2), lx, .37, r0 + 3.6);
    put('navy', box(.6, .4, .05), lx - .6, 1.0, r0 + 3.3); put('navy', box(.6, .4, .05), lx + .6, 1.0, r0 + 3.3);
    floorText(world, [{ t: 'MESA DA LIDERANÇA', size: 70 }], lx, r0 + 6.4, 6, .8, 0, { w: 800, h: 100, color: '#1f3a5f' });
    for (let k = 0; k < P.lideres; k++) {
      const w = makeWorker('lider'); w.home = V3(lx - .8 + k * 1.6, 0, r0 + 2.5); w.root.position.copy(w.home);
      w.restYaw = 0; w.setYaw(0); w.where = 'Mesa da liderança'; w.state = 'acompanhando a operação'; world.add(w.root); P0.workers.push(w);
    }
    // tratativa de avarias (sudeste): gaiolas de avarias vindas dos goleiros e mesa de tratativa
    const ax0 = L.xE - 14, ax1 = L.bx1 - 3.6, az = r0 + 2.1;
    zoneBox(ax0, r0 + .3, ax1, r1, 'orangeP');
    for (let i = 0; i < 4; i++) {
      const pos = V3(ax0 + 2 + i * 1.6, 0, az), sl = { pos, psi: PI, cage: null, res: false, name: `Tratativa ${i + 1}` };
      if (i < 2) { sl.cage = newCage(0, 'Gaiola de avarias (reserva)'); place(sl.cage, world, pos, PI); }
      P0.avArea.push(sl);
    }
    const tx = ax0 + 4.4, tz = r1 - 1.6;
    put('steelDark', box(2.6, .88, .9), tx, .44, tz); put('white', box(2.6, .03, .9), tx, .9, tz);
    floorText(world, [{ t: 'TRATATIVA DE AVARIAS', size: 66 }], ax0 + 9.4, r1 - 1.5, 6.4, .8, 0, { w: 900, h: 110, color: '#9a4a00' });
    for (let k = 0; k < P.tratativa; k++) {
      const w = makeWorker('tratativa'); w.home = V3(tx - .7 + k * 1.4, 0, tz - .95); w.root.position.copy(w.home);
      w.restYaw = 0; w.setYaw(0); w.where = 'Tratativa de avarias'; world.add(w.root); P0.avW.push(w); P0.workers.push(w);
    }
    // passagem de scuttles (faixa junto à parede leste, saída ao sul)
    zoneBox(L.bx1 - 2.8, zO[nOut - 1] + 3.2, L.bx1 - .5, r1, 'green', .1);
    for (let z = zO[nOut - 1] + 5; z < r1 - 1; z += 4) arrow(L.bx1 - 1.65, z, -PI / 2, 1.3);
    floorText(world, [{ t: 'PASSAGEM DE SCUTTLES', size: 56 }], L.bx1 - 1.65, (zO[nOut - 1] + r1) / 2 + 2, 5.6, .7, -PI / 2, { w: 760, h: 90, color: '#1f6b41' });

  }

  /* equipes da planta */
  for (let i = 0; i < P.recebimento; i++) {
    const w = makeWorker('recebimento'); w.home = V3(L.xR, 0, zMidW - 3 + i * 1.6); w.root.position.copy(w.home);
    w.restYaw = -PI / 2; w.setYaw(w.restYaw); w.where = 'Recebimento'; world.add(w.root); P0.rec.push(w); P0.workers.push(w);
  }
  for (let i = 0; i < P.abastGaiolas; i++) {
    const w = makeWorker('abastecedor'); w.home = V3(L.xW - .4, 0, zMidW + 9 + i * 1.5); w.root.position.copy(w.home);
    w.restYaw = PI / 2; w.setYaw(w.restYaw); w.where = 'Abastecimento das linhas'; world.add(w.root); P0.cgW.push(w); P0.workers.push(w);
  }
  for (let i = 0; i < P.abastScuttles; i++) {   // metade recolhe da montagem (estaciona no sudoeste), metade abastece do buffer
    const mont = i % 2 === 0, j = Math.floor(i / 2);
    const home = mont ? V3(L.pbx0 + 2.5 + (j % 3) * (L.cmp ? 2.4 : 3.6), 0, L.zLaneSW - 2.4 - Math.floor(j / 3) * 2.2) : V3(L.pbx0 + 2.5 + (j % 3) * (L.cmp ? 2.4 : 3.6), 0, emptyLanes[1] + 4.8 + Math.floor(j / 3) * 2.2);
    const u = makeUnit('abastScuttle', 1, home, PI / 2); u.dedic = mont ? 'montagem' : 'linhas';
    u.op.where = mont ? 'Scuttles: montagem → linhas / buffer' : 'Scuttles: buffer → linhas'; P0.scU.push(u);
  }
  for (let i = 0; i < P.carregadoresSaida; i++) {
    const u = makeUnit('saida', 1, V3(L.stX + 3.4, 0, L.zN + 1 + i * 1.7), 0); u.op.where = 'Saída / descarga'; P0.outU.push(u);
  }

  /* cotas da planta */
  dimLine(L.bx0, L.bz1 + 1.6, L.bx1, L.bz1 + 1.6, `${fmtM(L.bx1 - L.bx0, 1)} m · galpão`, { text: 2.2 });
  dimLine(L.bx1 + 1.6, L.bz0, L.bx1 + 1.6, L.bz1, `${fmtM(L.bz1 - L.bz0, 1)} m`, { text: 2 });
  if (L.nLines > 1) dimLine(L.X0 + 10, L.zLines[0] + L.zApron, L.X0 + 10, L.zLines[1] - L.zApron, `${fmtM(P.corredorLinhas)} m`, { text: .6 });
  dimLine(L.X0 + 20, cs0, L.X0 + 20, cs1, `${fmtM(L.cs)} m`, { text: .5 });
}

/* compacto: liderança e tratativa de avarias no fim da faixa leste (ao sul da saída) */
function buildEastRooms(P0, zO, nOut) {
  const x0 = L.xE + .6, x1 = L.bx1 - .5, za = zO[nOut - 1] + 3.0, zb = L.zS - .3;
  // tratativa de avarias: gaiolas em fila (ao longo de z) e mesa de tratativa
  const avz1 = za + 7.4;
  zoneBox(x0, za, x1, avz1, 'orangeP');
  for (let i = 0; i < 4; i++) {
    const pos = V3(x0 + 1.2, 0, za + 1.2 + i * 1.6), sl = { pos, psi: PI / 2, cage: null, res: false, name: `Tratativa ${i + 1}` };
    if (i < 2) { sl.cage = newCage(0, 'Gaiola de avarias (reserva)'); place(sl.cage, world, pos, PI / 2); }
    P0.avArea.push(sl);
  }
  const tx = x1 - 1.0, tz = za + 3.6;
  put('steelDark', box(.9, .88, 2.6), tx, .44, tz); put('white', box(.9, .03, 2.6), tx, .9, tz);
  floorText(world, [{ t: 'TRATATIVA DE AVARIAS', size: 66 }], (x0 + x1) / 2 + .6, avz1 - .7, 4.6, .6, 0, { w: 900, h: 110, color: '#9a4a00' });
  for (let k = 0; k < P.tratativa; k++) {
    const w = makeWorker('tratativa'); w.home = V3(tx - .95, 0, tz - .7 + k * 1.4); w.root.position.copy(w.home);
    w.restYaw = PI / 2; w.setYaw(w.restYaw); w.where = 'Tratativa de avarias'; world.add(w.root); P0.avW.push(w); P0.workers.push(w);
  }
  // mesa da liderança
  const lz0 = avz1 + .4;
  zoneBox(x0, lz0, x1, zb, 'navyP');
  const lx = (x0 + x1) / 2, lz = Math.min(zb - 1.0, lz0 + 2.4);
  put('wood', box(2.6, .06, 1.1), lx, .76, lz); put('steelDark', box(2.4, .72, .9), lx, .37, lz);
  put('navy', box(.55, .38, .05), lx - .5, 1.0, lz - .25); put('navy', box(.55, .38, .05), lx + .5, 1.0, lz - .25);
  for (let k = 0; k < P.lideres; k++) {
    const w = makeWorker('lider'); w.home = V3(lx - .7 + k * 1.4, 0, lz - 1.0); w.root.position.copy(w.home);
    w.restYaw = 0; w.setYaw(0); w.where = 'Mesa da liderança'; w.state = 'acompanhando a operação'; world.add(w.root); P0.workers.push(w);
  }
}

/* ---------- rotas ---------- */
const dedupe = pts => pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > .03);
const routeX = x => (a, b) => dedupe([V3(a.x, 0, a.z), V3(x, 0, a.z), V3(x, 0, b.z), V3(b.x, 0, b.z)]);
const cageRouteW = (a, b) => routeX(L.xW)(a, b);   // abastecimento: pelo corredor oeste
const cageRouteR = (a, b) => routeX(L.xR)(a, b);   // recebimento: pelo corredor da entrada
const swRoute = (a, b) => dedupe([V3(a.x, 0, a.z), V3(a.x, 0, L.zLaneSW), V3(b.x, 0, L.zLaneSW), V3(b.x, 0, b.z)]);   // dentro do sudoeste
function accPts(p, ax) {   // do ponto até o corredor (oeste ou leste)
  const P1 = V3(p.x, 0, p.z);
  if (p.x > L.xWest - .5 && p.x < L.xEast - .3 && p.z > L.zN && p.z < L.zS) {
    let zl = L.zLines[0]; for (const z of L.zLines) if (Math.abs(p.z - z) < Math.abs(p.z - zl)) zl = z;
    const lane = zl + Math.sign(p.z - zl || 1) * L.zAisle;
    return [P1, V3(p.x, 0, lane), V3(ax, 0, lane)];
  }
  return [P1, V3(ax, 0, p.z)];
}
const plantRoute = (a, b) => { const ax = (a.x < L.xWest - .5 || b.x < L.xWest - .5) ? L.xW : L.xE; return dedupe([...accPts(a, ax), ...accPts(b, ax).reverse()]); };
function pdock(u, T, psi, dist, onDock, wallSide = false) {
  const yawD = wallSide ? psi : psi - PI, f = fwdOf(yawD), D = T.clone().addScaledVector(f, FORK_C), A = T.clone().addScaledVector(f, Math.max(dist, FORK_C + 1));
  return [
    { gen: () => unitMove(u, plantRoute(unitPos(u), A)) },
    unitTurn(u, () => yawD),
    ...unitMove(u, [A, D], { backward: true, speed: P.velPaleteira * .6 }),
    { d: .5, end: onDock },
    ...unitMove(u, [D, A], { speed: P.velPaleteira * .7 }),
  ];
}
// volta ao estacionamento só se não houver próxima tarefa (senão encadeia direto, sem viagem perdida)
const goHomeUnit = (u, hasWork) => [{ gen: () => hasWork && hasWork(u) ? [] : [...unitMove(u, plantRoute(unitPos(u), u.home)), unitTurn(u, () => u.homeYaw)] }, { d: 0, end() { u.op.state = 'livre'; } }];
const lineNeedsSc = () => LINES.some(ln => [1, -1].some(s => ln.S.emptyBuf[s].some(K => !K.sc && !K.res)));
const scWork = u => (u.dedic !== 'montagem' && PLANT.stock.some(k => k.sc && !k.res) && lineNeedsSc()) || (u.dedic !== 'linhas' && PLANT.st.some(st => st.state === 'pronta' && !st.res) && (lineNeedsSc() || PLANT.stock.some(k => !k.sc && !k.res)));
const outWork = () => PLANT.outS.some(x => x.sc && !x.res) || (PLANT.outS.some(x => !x.sc && !x.res) && LINES.some(ln => ln.S.fullBuf.some(C => C.sc && !C.res)));
const goHomeWalk = (w, R) => [{ gen: () => [...walkSteps(w, R(w.root.position, w.home)), turnStep(w, () => w.restYaw)] }, { d: 0, end() { w.state = 'livre'; } }];

/* ---------- recebimento: doca → buffer de cheias; buffer de vazias → doca ---------- */
function startRecJob(w) {
  const empties = PLANT.pEmpty.filter(x => x.cage && !x.res), freeFull = PLANT.pFull.filter(x => !x.cage && !x.res);
  const door = PLANT.doorsIn.filter(d => !d.cage && !d.res).sort((a, b) => Math.abs(a.pos.z - w.root.position.z) - Math.abs(b.pos.z - w.root.position.z))[0];
  if (!door) return;
  const R = cageRouteR;
  if (empties.length >= 6 || (empties.length && !freeFull.length)) {          // devolve gaiola vazia
    const src = empties.sort((a, b) => a.t - b.t)[0]; src.res = true; door.res = true;
    w.state = 'devolvendo gaiola vazia pela doca';
    w.task = sequence([
      ...grabCageSteps(w, () => src, R),
      { d: 0, end() { src.res = false; } },
      ...deliverCageSteps(w, () => door, R, (d) => { d.res = false; d.kill = PLANT.t + 4; }),
      ...goHomeWalk(w, R),
    ]);
    return;
  }
  const dst = freeFull.sort((a, b) => Math.abs(a.pos.z - door.pos.z) - Math.abs(b.pos.z - door.pos.z))[0];
  if (!dst) return;
  dst.res = true; door.res = true;
  w.state = 'recebendo gaiola cheia na doca';
  w.task = sequence([
    { gen: () => walkSteps(w, R(w.root.position, door.pos.clone().add(V3(2.6, 0, 0)))) },
    { d: .6, start() { door.cage = newCage(P.gaiolaCap, 'Gaiola cheia (entrada)'); place(door.cage, world, door.pos, door.psi); } },
    ...grabCageSteps(w, () => door, R),
    { d: 0, end() { door.res = false; w.state = 'levando gaiola cheia ao buffer'; } },
    ...deliverCageSteps(w, () => dst, R, (sl) => { sl.res = false; sl.t = PLANT.t; PLANT.received++; }),
    ...goHomeWalk(w, R),
  ]);
}

/* ---------- abastecimento: buffer de cheias → buffer da indução de cada linha; vazias de volta ---------- */
function lineProxy(ln, slot) {   // posição da gaiola da linha vista pelo lado oeste, em coordenadas da planta
  return { pos: toRoot(ln, slot.pos), psi: slot.psi + PI, cage: slot.cage };
}
function startSupplyCageJob(w) {
  const R = cageRouteW;
  let best = null;
  for (const ln of LINES) {
    const need = ln.S.cageFull.filter(f => !f.cage && !f.res);
    if (need.length && (!best || need.length > best.need.length)) best = { ln, need };
  }
  const emptyLine = LINES.map(ln => ({ ln, e: ln.S.cageEmpty.filter(e => e.cage && !e.res) })).sort((a, b) => b.e.length - a.e.length)[0];
  const src = PLANT.pFull.filter(x => x.cage && !x.res).sort((a, b) => a.t - b.t)[0];
  const steps = [];
  const takeEmpty = (ln, E) => {
    E.res = true; const px = lineProxy(ln, E); let dump;
    steps.push(
      { d: 0, end() { px.cage = E.cage; w.state = `retirando gaiola vazia · ${ln.S.short}`; } },
      ...grabCageSteps(w, () => px, R),
      { d: 0, end() { E.cage = null; E.res = false; dump = freeOrOldest(PLANT.pEmpty); w.state = 'levando gaiola vazia ao buffer da planta'; } },
      ...deliverCageSteps(w, () => dump, R, (sl, c) => { sl.res = false; sl.t = PLANT.t; c.name = 'Gaiola vazia'; }),
    );
  };
  if (best && src) {
    const F = best.need[0], ln = best.ln, px = { pos: toRoot(ln, F.pos), psi: F.psi + PI, cage: null };
    F.res = true; src.res = true;
    w.state = `levando gaiola cheia · ${ln.S.short}`;
    steps.push(
      ...grabCageSteps(w, () => src, R),
      { d: 0, end() { src.res = false; } },
      ...deliverCageSteps(w, () => px, R, (_, c) => {
        ln.grp.attach(c.grp); c.grp.position.set(F.pos.x, 0, F.pos.z); c.grp.rotation.set(0, F.psi, 0);
        px.cage = null; F.cage = c; F.res = false; F.regen = 0; c.name = 'Gaiola cheia'; PLANT.cgSupplied++;
      }),
    );
    const E = ln.S.cageEmpty.filter(e => e.cage && !e.res)[0];
    if (E) takeEmpty(ln, E);
  } else if (emptyLine && emptyLine.e.length >= 3) {
    takeEmpty(emptyLine.ln, emptyLine.e[0]);
  } else return;
  w.task = sequence([...steps, ...goHomeWalk(w, R)]);
}

/* ---------- scuttles: linhas primeiro (buffer → buffers laterais); depois recolhe as montadas para o buffer ---------- */
function startSupplyScuttleJob(u) {
  let tgt = null;
  for (const ln of LINES) for (const s of [1, -1]) for (const K of ln.S.emptyBuf[s]) if (!K.sc && !K.res && (!tgt || (K.since ?? 0) < (tgt.K.since ?? 0))) tgt = { ln, K };
  const toLine = (ln, K) => pdockFn => [...pdock(u, toRoot(ln, K.T), K.psi, 2.3, () => { K.sc = dropLoad(u, ln.grp, K.T, K.psi); K.res = false; K.regen = 0; PLANT.scSupplied++; })];
  // 1) montada pronta: libera a posição de montagem (direto para a linha que precisa ou para o buffer)
  const st = PLANT.st.filter(x => x.state === 'pronta' && !x.res)[0], dst = PLANT.stock.filter(k => !k.sc && !k.res)[0];
  if (u.dedic !== 'linhas' && st && (tgt || dst)) {
    st.res = true;
    const pick = pdock(u, st.T, st.psi, st.dist, () => { attachLoad(u, st.sc); st.sc = null; st.film = null; st.res = false; st.state = 'livre'; PLANT.assembled++; });
    if (tgt) {
      tgt.K.res = true; u.op.state = `levando scuttle montada · ${tgt.ln.S.short}`;
      u.task = sequence([...pick, ...toLine(tgt.ln, tgt.K)(), ...goHomeUnit(u, scWork)]);
    } else {
      dst.res = true; u.op.state = `levando scuttle montada ao buffer · ${st.name}`;
      u.task = sequence([...pick, ...pdock(u, dst.T, dst.psi, 2.2, () => { dst.sc = dropLoad(u, world, dst.T, dst.psi); dst.res = false; }), ...goHomeUnit(u, scWork)]);
    }
    return;
  }
  // 2) linha precisa: tira do buffer de scuttles
  if (u.dedic === 'montagem') return;
  const src = PLANT.stock.filter(k => k.sc && !k.res).sort((a, b) => Math.abs(a.T.z - (tgt ? tgt.ln.z : 0)) - Math.abs(b.T.z - (tgt ? tgt.ln.z : 0)))[0];
  if (!tgt || !src) return;
  const { ln, K } = tgt; K.res = true; src.res = true;
  u.op.state = `levando scuttle vazia · ${ln.S.short}`;
  u.task = sequence([
    ...pdock(u, src.T, src.psi, 2.2, () => { attachLoad(u, src.sc); src.sc = null; src.res = false; }),
    ...toLine(ln, K)(),
    ...goHomeUnit(u, scWork),
  ]);
}

/* ---------- saída: buffer de cheias da linha → saída/descarga → doca ---------- */
function startOutJob(u) {
  const staged = PLANT.outS.filter(x => x.sc && !x.res).sort((a, b) => a.t - b.t), free = PLANT.outS.filter(x => !x.sc && !x.res);
  let pick = null;
  for (const ln of LINES) for (const C of ln.S.fullBuf) if (C.sc && !C.res && (!pick || C.t < pick.C.t)) pick = { ln, C };
  if (staged.length && (staged.length >= 3 || !pick || !free.length)) {
    const sl = staged[0]; sl.res = true;
    const door = PLANT.doorsOut.reduce((b, d) => Math.abs(d.z - sl.T.z) < Math.abs(b.z - sl.T.z) ? d : b, PLANT.doorsOut[0]);
    u.op.state = 'levando scuttle cheia à doca';
    u.task = sequence([
      ...pdock(u, sl.T, sl.psi, 2.3, () => { attachLoad(u, sl.sc); sl.sc = null; sl.res = false; }),
      { gen: () => {
          const Ap = V3(L.bx1 - 3.4, 0, door.z), D = V3(L.bx1 - .2 - FORK_C, 0, door.z);
          return [
            ...unitMove(u, plantRoute(unitPos(u), Ap)), unitTurn(u, () => -PI / 2),
            ...unitMove(u, [Ap, D], { backward: true, speed: P.velPaleteira * .7 }),
            { d: .4, end() { const o = u.load; u.grp.remove(o.grp); killScuttle(o); u.load = null; PLANT.shipped++; } },
            ...unitMove(u, [D, Ap]),
          ];
        } },
      ...goHomeUnit(u, outWork),
    ]);
    return;
  }
  if (!pick || !free.length) return;
  const { ln, C } = pick, sl = free.sort((a, b) => Math.abs(a.T.z - (ln.z + C.T.z)) - Math.abs(b.T.z - (ln.z + C.T.z)))[0];
  C.res = true; sl.res = true;
  u.op.state = `levando scuttle cheia à saída · ${ln.S.short}`;
  u.task = sequence([
    ...pdock(u, toRoot(ln, C.T), C.psi, 2.2, () => { attachLoad(u, C.sc); C.sc = null; C.res = false; }, true),
    ...pdock(u, sl.T, sl.psi, 2.3, () => { sl.sc = dropLoad(u, world, sl.T, sl.psi); sl.res = false; sl.t = PLANT.t; }),
    ...goHomeUnit(u, outWork),
  ]);
}

/* ---------- montagem de scuttles: robô (1) e stretch manual (2 pessoas) ---------- */
function newAssembly(st) {   // caixa montada no pallet da posição
  const sc = newScuttle('VAZIA'); place(sc, world, st.T, st.psi === -PI / 2 ? PI / 2 : 0); st.sc = sc; return sc;
}
function startRobotSetup(w, R) {   // a pessoa monta a caixa no pallet do robô e o robô enrola
  R.res = true; R.state = 'montando';
  const spot = R.T.clone().add(V3(0, 0, -1.45));
  w.state = 'montando caixa para o robô';
  w.task = sequence([
    { gen: () => walkSteps(w, swRoute(w.root.position, spot)) },
    turnStep(w, () => w.yawTo(R.T)),
    { d: P.tempoMontagem * .5, start() { newAssembly(R); }, fn(k) { w.pose(.55 + .3 * Math.sin(k * 18), .5 + .3 * Math.sin(k * 9)); } },
    { d: 0, end() { R.res = false; R.state = 'enrolando'; R.t0 = PLANT.t; } },
    ...goHomeWalk(w, swRoute),
  ]);
}
function startManualAssembly(w, st) {   // monta a caixa e passa o filme andando em volta da scuttle
  st.res = true; st.state = 'montando';
  const T = st.T, Rr = 1.15, laps = 4, a0 = -PI / 2;
  w.state = `montando scuttle · ${st.name}`;
  let y0 = 0;
  w.task = sequence([
    { gen: () => walkSteps(w, [w.root.position.clone(), V3(T.x + Rr * Math.sin(a0), 0, T.z + Rr * Math.cos(a0))]) },
    turnStep(w, () => w.yawTo(T)),
    { d: P.tempoMontagem, start() { newAssembly(st); }, fn(k) { w.pose(.6 + .3 * Math.sin(k * 22), .55 + .35 * Math.sin(k * 11)); } },
    { d: 0, end() { st.state = 'enrolando'; addFilm(st.sc); w.state = `passando filme stretch · ${st.name}`; } },
    { d: P.tempoStretchManual, start() { y0 = w.yaw; },
      fn(k) {
        const a = a0 + k * laps * 2 * PI;
        w.root.position.set(T.x + Rr * Math.sin(a), 0, T.z + Rr * Math.cos(a));
        w.setYaw(a + PI / 2 + .35);                         // de lado, rolo voltado para a caixa
        w.pose(.5, .1 + .25 * Math.sin(k * laps * 2 * PI * 1.5));
        const H = P.scuttleAlt - .05, up = 1 - Math.abs(((k * 2) % 2) - 1);
        if (st.sc && st.sc.film) st.sc.film.scale.y = Math.max(.01, Math.min(H, H * Math.min(1, k * 1.25) * (.6 + .4 * up)));
      } },
    { d: 0, end() { if (st.sc && st.sc.film) st.sc.film.scale.y = P.scuttleAlt - .05; st.state = 'pronta'; st.res = false; } },
    ...goHomeWalk(w, (a, b) => dedupe([V3(a.x, 0, a.z), V3(b.x, 0, a.z), V3(b.x, 0, b.z)])),
  ]);
}
function updateRobot(st, dt) {   // volta em círculo fixo subindo e descendo o rolo
  const r = st.robot, R = 1.38;
  if (st.state === 'enrolando' && st.sc) {
    const k = clamp01((PLANT.t - st.t0) / P.tempoStretch);
    if (!st.sc.film) addFilm(st.sc);
    st.ang += dt * (2 * PI * 5 / P.tempoStretch);
    const H = P.scuttleAlt + PAL_H, tri = 1 - Math.abs(((k * 3) % 2) - 1);
    r.car.position.y = .3 + tri * Math.min(.85, H - .3);
    st.sc.film.scale.y = Math.max(.01, (P.scuttleAlt - .05) * Math.min(1, k * 1.6));
    r.led.material = MAT.robotLedOn;
    if (k >= 1) st.state = 'pronta';
  } else {
    const park = PI / 2, d = Math.atan2(Math.sin(park - st.ang), Math.cos(park - st.ang));
    st.ang += clamp(d, -dt * 1.2, dt * 1.2);
    r.car.position.y += (.45 - r.car.position.y) * Math.min(1, dt * 2);
    r.led.material = st.state === 'pronta' ? MAT.robotLedDone : MAT.robotLed;
  }
  r.grp.position.set(st.T.x + R * Math.sin(st.ang), 0, st.T.z + R * Math.cos(st.ang));
  r.grp.rotation.y = st.ang + PI / 2;
}

/* ---------- tratativa de avarias: busca a gaiola de avarias do goleiro, devolve uma reserva e trata ---------- */
function avProxy(ln) { const av = ln.S.avSlot; return { pos: toRoot(ln, av.pos), psi: av.psi, cage: av.cage }; }
function bringSpareSteps(w, ln, spare) {
  const av = ln.S.avSlot, px = { pos: toRoot(ln, av.pos), psi: av.psi, cage: null };
  return [
    ...grabCageSteps(w, () => spare, plantRoute),
    { d: 0, end() { spare.res = false; w.state = `levando gaiola de avarias vazia · ${ln.S.short}`; } },
    ...deliverCageSteps(w, () => px, plantRoute, (_, c) => {
      ln.grp.attach(c.grp); c.grp.position.set(av.pos.x, 0, av.pos.z); c.grp.rotation.set(0, av.psi, 0);
      av.cage = c; av.res = false; c.name = av.name;
    }),
  ];
}
const avUrgent = () => LINES.some(ln => { const av = ln.S.avSlot; return av && !av.res && ((!av.cage && PLANT.avArea.some(s => s.cage && s.cage.fill === 0 && !s.res)) || (av.cage && av.cage.fill >= av.cage.cap * .8)); });
function startAvJob(w) {
  const area = PLANT.avArea;
  for (const ln of LINES) {   // linha sem gaiola de avarias: leva uma reserva vazia
    const av = ln.S.avSlot, spare = area.find(s => s.cage && s.cage.fill === 0 && !s.res);
    if (av && !av.cage && !av.res && spare) {
      av.res = true; spare.res = true; w.state = `levando gaiola de avarias · ${ln.S.short}`;
      w.task = sequence([...bringSpareSteps(w, ln, spare), ...goHomeWalk(w, plantRoute)]);
      return;
    }
  }
  const cand = LINES.filter(ln => { const av = ln.S.avSlot; return av && av.cage && !av.res && av.cage.fill >= av.cage.cap * .6; }).sort((a, b) => b.S.avSlot.cage.fill - a.S.avSlot.cage.fill)[0];
  const free = area.find(s => !s.cage && !s.res);
  if (cand && free) {   // busca a gaiola cheia de avarias e, se houver, deixa uma reserva no lugar
    const ln = cand, av = ln.S.avSlot, px = avProxy(ln); av.res = true; free.res = true;
    const spare = area.find(s => s !== free && s.cage && s.cage.fill === 0 && !s.res); if (spare) spare.res = true;
    w.state = `buscando avarias · ${ln.S.short}`;
    w.task = sequence([
      { until: () => !(av.lock > 0) },
      ...grabCageSteps(w, () => px, plantRoute),
      { d: 0, end() { av.cage = null; w.state = 'levando avarias à tratativa'; } },
      ...deliverCageSteps(w, () => free, plantRoute, (sl, c) => { sl.res = false; c.name = 'Gaiola de avarias (a tratar)'; PLANT.avFetched++; if (!spare) av.res = false; }),
      ...(spare ? bringSpareSteps(w, ln, spare) : []),
      ...goHomeWalk(w, plantRoute),
    ]);
    return;
  }
  const t = area.find(s => s.cage && s.cage.fill > 0 && !s.res);
  if (!t) return;
  t.res = true;
  const spot = t.pos.clone().add(V3(0, 0, 1.25));
  let acc = 0;
  w.state = 'tratando avarias';
  w.task = sequence([
    ...walkSteps(w, [w.root.position.clone(), V3(spot.x, 0, w.root.position.z), spot]),
    turnStep(w, () => w.yawTo(t.pos)),
    { until: () => !t.cage || t.cage.fill <= 0 || avUrgent(),
      fn(_, dt) {
        acc += dt; const k = acc / P.tempoAvaria;
        w.pose(.6 + .3 * Math.sin(k * PI * 2), .5 + .3 * Math.sin(k * PI * 2));
        if (acc >= P.tempoAvaria) { acc = 0; t.cage.fill--; setCageFill(t.cage); PLANT.avTreated++; if (t.cage.fill <= 0) t.cage.name = 'Gaiola de avarias (reserva)'; }
      } },
    { d: 0, end() { t.res = false; } },
    ...goHomeWalk(w, (a, b) => dedupe([V3(a.x, 0, a.z), V3(a.x, 0, b.z), V3(b.x, 0, b.z)])),
  ]);
}

function updatePlant(dt) {
  S.t += dt;
  for (const w of PLANT.rec) if (!w.task) startRecJob(w);
  for (const w of PLANT.cgW) if (!w.task) startSupplyCageJob(w);
  for (const u of PLANT.scU) if (!u.task) startSupplyScuttleJob(u);
  for (const u of PLANT.outU) if (!u.task) startOutJob(u);
  for (const w of PLANT.avW) if (!w.task) startAvJob(w);
  const R = PLANT.robotSt;
  for (const w of PLANT.roW) if (!w.task && R && R.state === 'livre' && !R.sc && !R.res) startRobotSetup(w, R);
  for (const w of PLANT.smW) {
    if (w.task) continue;
    if (!PLANT.roW.length && R && R.state === 'livre' && !R.sc && !R.res) startRobotSetup(w, R);
    else if (w.st.state === 'livre' && !w.st.sc && !w.st.res) startManualAssembly(w, w.st);
    else w.state = w.st.state === 'pronta' ? 'aguardando retirada da scuttle' : 'livre';
  }
  for (const d of PLANT.doorsIn) if (d.cage && d.kill && PLANT.t >= d.kill) { killCage(d.cage); d.cage = null; d.kill = 0; PLANT.returned++; }
  for (const ln of LINES) for (const s of [1, -1]) for (const K of ln.S.emptyBuf[s]) { if (K.sc) K.since = null; else if (K.since == null) K.since = PLANT.t; }
  if (R) updateRobot(R, dt);
  for (const w of PLANT.workers) { if (w.unit) continue; runWorker(w, dt); }
  for (const u of [...PLANT.scU, ...PLANT.outU]) {
    if (u.task) { if (u.task.step(dt)) u.task = null; }
    else { u.op.idle(dt); u.op.root.position.z = .82; }
  }
}
