
/* ------------------------------------------------------------------ */
/* Colaboradores: malha única com esqueleto (SkinnedMesh), corpo esculpido */
/* ------------------------------------------------------------------ */
const HUMAN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: 0, side: THREE.DoubleSide, envMapIntensity: .45 });
const SKIN = [0xf0c7a4, 0xdcaa7e, 0xc68a62, 0xa86f4a, 0x8d5a3b, 0x6b4229];
const HAIR = [0x1b1410, 0x3b2a1c, 0x5a4330, 0x0f0f0f, 0x7d5f40, 0xa8a199];
const ROLE = {
  pescador:   { vest: 0xf07a1f, label: 'Pescador', cap: [0x1f3a5f, null] },
  separador:  { vest: 0xf07a1f, label: 'Separador', cap: [null, 0xe8641b] },
  inducao:    { vest: 0xf2c230, label: 'Indução', cap: [0x1f3a5f, null] },
  goleiro:    { vest: 0x2e9a5c, label: 'Goleiro', cap: [0x1f3a5f] },
  paleteiro:  { vest: 0xc9d64a, label: 'Paleteiro (troca de scuttle)', cap: [null, 0x1f3a5f] },
  setup:      { vest: 0xf2c230, label: 'Setup de gaiolas', cap: [0xe8641b, null] },
  carregador: { vest: 0xc9d64a, label: 'Carregador de expedição', cap: [0x1f3a5f] },
  recebimento: { vest: 0xf2c230, label: 'Recebimento (entrada de gaiolas)', cap: [0x1f3a5f], mh: 'setup' },
  abastecedor: { vest: 0xf2c230, label: 'Abastecimento de gaiolas', cap: [0xe8641b, null], mh: 'inducao' },
  abastScuttle: { vest: 0xc9d64a, label: 'Abastecimento de scuttles vazias', cap: [null, 0x1f3a5f], mh: 'paleteiro' },
  saida: { vest: 0xc9d64a, label: 'Saída (stretch e doca)', cap: [0x1f3a5f], mh: 'carregador' },
  conferente: { vest: 0x2e9a5c, label: 'Conferência', cap: [null], mh: 'goleiro' },
  lider: { vest: 0x2e9a5c, label: 'Liderança', cap: [null], mh: 'goleiro' },
  stretchManual: { vest: 0xf2c230, label: 'Montagem e stretch manual de scuttles', cap: [null, 0x1f3a5f], mh: 'setup' },
  operadorRobo: { vest: 0xf2c230, label: 'Operador do robô de stretch', cap: [0x1f3a5f], mh: 'setup' },
  descarga: { vest: 0xf2c230, label: 'Descarga na telescópica', cap: [0x1f3a5f, null], mh: 'carregador' },
  inducaoSorter: { vest: 0xf07a1f, label: 'Indução do sorter', cap: [null, 0x1f3a5f], mh: 'inducao' },
  outbound: { vest: 0xc9d64a, label: 'Outbound (chute, gaiola, endereçamento)', cap: [0x1f3a5f], mh: 'carregador' },
  rampa: { vest: 0x2e9a5c, label: 'Rampas e sacas do sorter', cap: [0x1f3a5f, null], mh: 'separador' },
  tratativa: { vest: 0xf07a1f, label: 'Tratativa de avarias', cap: [null], mh: 'separador' },
};
const BONES = [ // nome, pai, posição relativa ao pai (altura de referência 1,75 m)
  ['root', -1, [0, 0, 0]], ['pelvis', 0, [0, .93, 0]], ['chest', 1, [0, .11, 0]], ['head', 2, [0, .48, 0]],
  ['shL', 2, [-.19, .40, 0]], ['elL', 4, [0, -.29, 0]], ['shR', 2, [.19, .40, 0]], ['elR', 6, [0, -.29, 0]],
  ['hipL', 1, [-.095, -.03, 0]], ['kneeL', 8, [0, -.44, 0]], ['hipR', 1, [.095, -.03, 0]], ['kneeR', 10, [0, -.44, 0]],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const BONE_WORLD = (() => { const out = []; BONES.forEach(([, p, pos], i) => { const v = V3(...pos); if (p >= 0) v.add(out[p]); out.push(v); }); return out; })();
const lathe = (pts, seg = 26) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function makeHumanGeometry(o) {
  const parts = [];
  const BW = BONE_WORLD.map(v => v.clone());
  for (const k of ['shL', 'elL', 'shR', 'elR']) BW[BI[k]].x *= o.shW || 1;
  const add = (geo, bone, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, sculpt = null) => {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz)));
    if (sculpt) { const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const v = sculpt(pa.getX(i), pa.getY(i), pa.getZ(i)); pa.setXYZ(i, v[0], v[1], v[2]); } g.computeVertexNormals(); }
    g.translate(BW[BI[bone]].x, BW[BI[bone]].y, BW[BI[bone]].z);
    const n = g.attributes.position.count, col = C(color);
    const ca = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; si[i * 4] = BI[bone]; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    parts.push(g);
  };
  const { skin, hair, shirt, pants, vest, glove = 0x2b2f35, boot = 0x1a1b1d, female, shW = 1, hipW = 1, hairStyle, capColor, beard, longSleeve } = o;
  const refl = 0xd9dde0, skinDark = new THREE.Color(skin).multiplyScalar(.8).getHex();

  // tronco: perfil torneado + escultura (peito, escápulas, ombros)
  const bump = (y, c, w) => Math.exp(-((y - c) * (y - c)) / (2 * w * w));
  const torsoSculpt = (x, y, z) => {
    let zz = z * .62;
    if (z > 0) zz *= 1 + .1 * bump(y, .3, .07) + (female ? .2 * bump(y, .28, .05) : 0);
    else zz *= 1 + .07 * bump(y, .34, .06);
    return [x * shW * (1 - .06 * bump(y, .05, .08)), y, zz];
  };
  add(lathe([[0, -.04], [.15, -.03], [.152, .06], [.158, .14], [.172, .24], [.186, .32], [.194, .38], [.19, .42], [.15, .455], [.09, .475], [0, .48]]), 'chest', shirt, 0, 0, 0, 0, 0, 0, 1, 1, 1, torsoSculpt);
  const vR = [[.161, .02], [.164, .1], [.177, .22], [.196, .31], [.204, .37], [.199, .41], [.168, .445]];
  add(lathe(vR), 'chest', vest, 0, 0, 0, 0, 0, 0, 1.012, 1, 1.02, torsoSculpt);
  for (const yb of [.13, .25]) {
    const r = yb < .2 ? .169 : .19;
    add(new THREE.CylinderGeometry(r + .006, r + .004, .035, 26, 1, true), 'chest', refl, 0, yb, 0, 0, 0, 0, 1.012, 1, 1.03, torsoSculpt);
  }
  for (const s of [-1, 1]) for (const f of [-1, 1]) add(box(.04, .16, .008), 'chest', refl, s * .08 * shW, .35, f * .133 * (f > 0 ? 1.08 : 1.05), f * -.22, 0, 0);
  add(box(.012, .3, .006), 'chest', 0x2b2f35, 0, .22, .121 * 1.06, -.08, 0, 0);   // zíper
  add(new THREE.CylinderGeometry(.05, .057, .1, 14), 'chest', skin, 0, .5, .005);

  // quadril
  const pelvisSculpt = (x, y, z) => {
    let zz = z * .68; if (z < 0) zz *= 1 + .12 * bump(y, -.04, .05);
    return [x * hipW, y, zz];
  };
  add(lathe([[0, -.13], [.12, -.125], [.16, -.09], [.172, -.02], [.168, .06], [.152, .12], [0, .12]]), 'pelvis', pants, 0, 0, 0, 0, 0, 0, 1, 1, 1, pelvisSculpt);
  add(new THREE.CylinderGeometry(.169, .169, .04, 26, 1, true), 'pelvis', 0x1b1d20, 0, .085, 0, 0, 0, 0, 1, 1, 1, pelvisSculpt);  // cinto

  // cabeça
  add(new THREE.SphereGeometry(.1, 26, 18), 'head', skin, 0, .135, 0, 0, 0, 0, .86, 1, .96);
  add(new THREE.SphereGeometry(.078, 20, 14), 'head', skin, 0, .085, .028, 0, 0, 0, .95, .9, 1);
  add(new THREE.SphereGeometry(.018, 10, 8), 'head', skin, 0, .115, .095, 0, 0, 0, .8, 1.4, 1.3);
  add(box(.036, .006, .01), 'head', skinDark, 0, .077, .1);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(.0115, 8, 6), 'head', 0x14161a, s * .032, .142, .082);
    add(box(.03, .006, .01), 'head', hair, s * .033, .158, .088, 0, 0, s * -.12);
    add(new THREE.SphereGeometry(.024, 10, 8), 'head', skin, s * .084, .13, 0, 0, 0, 0, .45, 1, .75);
  }
  if (beard) add(new THREE.SphereGeometry(.081, 18, 10, 0, PI, PI * .48, PI * .32), 'head', hair, 0, .086, .026, 0, 0, 0, .96, .92, 1);
  if (hairStyle !== 'cap' && hairStyle !== 'bald') {
    add(new THREE.SphereGeometry(.105, 22, 10, 0, TAU, 0, PI * .52), 'head', hair, 0, .14, -.006, 0, 0, 0, .89, 1.0, 1);
    add(new THREE.SphereGeometry(.103, 18, 8, PI, PI, PI * .45, PI * .22), 'head', hair, 0, .14, -.004, 0, 0, 0, .89, 1, 1);
  }
  if (hairStyle === 'pony') add(new THREE.CylinderGeometry(.028, .018, .17, 10), 'head', hair, 0, .08, -.115, .35, 0, 0);
  if (hairStyle === 'bun') add(new THREE.SphereGeometry(.045, 14, 10), 'head', hair, 0, .18, -.095);
  if (hairStyle === 'cap') {
    add(new THREE.SphereGeometry(.107, 22, 10, 0, TAU, 0, PI * .5), 'head', capColor, 0, .15, -.004, 0, 0, 0, .9, .95, 1);
    add(new THREE.CylinderGeometry(.088, .088, .01, 22, 1, false, -PI / 2, PI), 'head', capColor, 0, .155, .045, -.12, 0, 0, .92, 1, 1.15);
    add(new THREE.SphereGeometry(.103, 18, 8, PI, PI, PI * .45, PI * .2), 'head', hair, 0, .14, -.004, 0, 0, 0, .89, 1, 1);
  }

  // braços
  for (const [sh, el, s] of [['shL', 'elL', -1], ['shR', 'elR', 1]]) {
    add(new THREE.SphereGeometry(.06, 14, 10), sh, shirt, 0, -.02, 0, 0, 0, 0, 1, 1, .95);
    add(new THREE.CylinderGeometry(.062, .056, .16, 14, 1, true), sh, shirt, 0, -.09, 0);
    add(new THREE.CylinderGeometry(.05, .042, .3, 14), sh, longSleeve ? shirt : skin, 0, -.15, 0);
    add(new THREE.SphereGeometry(.043, 12, 10), el, longSleeve ? shirt : skin, 0, 0, 0);
    add(new THREE.CylinderGeometry(.043, .033, .24, 14), el, longSleeve ? shirt : skin, 0, -.13, 0);
    add(new THREE.SphereGeometry(.05, 14, 10), el, glove, 0, -.28, .004, 0, 0, 0, .78, 1.12, .48);
    add(new THREE.SphereGeometry(.04, 12, 8), el, glove, 0, -.33, .008, 0, 0, 0, .8, 1.0, .42);
    add(new THREE.CylinderGeometry(.014, .012, .06, 8), el, glove, -s * .036, -.28, .018, 0, 0, s * .5);
  }
  // pernas
  for (const [hip, knee] of [['hipL', 'kneeL'], ['hipR', 'kneeR']]) {
    add(new THREE.CylinderGeometry(.088, .063, .44, 16), hip, pants, 0, -.22, 0);
    add(new THREE.SphereGeometry(.064, 14, 10), knee, pants, 0, 0, 0);
    add(lathe([[.064, 0], [.066, -.08], [.062, -.16], [.052, -.28], [.045, -.37], [.044, -.39]], 16), knee, pants);
    add(box(.11, .1, .17), knee, boot, 0, -.40, 0);
    add(new THREE.SphereGeometry(.058, 14, 8), knee, boot, 0, -.425, .09, 0, 0, 0, 1, .62, 1.2);
    add(box(.116, .025, .29), knee, 0x0d0d0e, 0, -.448, .03);
  }
  const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(parts, false);
  parts.forEach(g => g.dispose());
  return geo;
}

let WORKER_SEQ = 0;
function makeWorker(roleKey) {
  const role = ROLE[roleKey], n = WORKER_SEQ++;
  const female = Math.random() < .38;
  const hairStyle = pick(role.cap) ? 'cap' : (female ? pick(['pony', 'bun', 'short']) : pick(['short', 'short', 'bald']));
  const o = {
    skin: pick(SKIN), hair: Math.random() < .08 ? HAIR[5] : pick(HAIR.slice(0, 5)), shirt: UNIFORME_SORTER ? 0x3b4047 : 0x1f3a5f, pants: UNIFORME_SORTER ? pick([0x353a41, 0x30353b]) : pick([0x2b3340, 0x262c36, 0x33302c]),
    vest: UNIFORME_SORTER ? 0xf2661c : role.vest, female, shW: female ? rand(.9, .95) : rand(.98, 1.08), hipW: female ? rand(1.04, 1.1) : rand(.96, 1.04),
    hairStyle, capColor: UNIFORME_SORTER ? 0x34383e : (pick(role.cap.filter(Boolean)) || 0x1f3a5f), beard: !female && Math.random() < .22, longSleeve: Math.random() < .35,
  };
  if (hairStyle === 'cap' && o.capColor == null) o.capColor = 0x1f3a5f;
  const geo = makeHumanGeometry(o);
  const bones = BONES.map(() => new THREE.Bone());
  BONES.forEach(([name, p, pos], i) => { bones[i].name = name; bones[i].position.set(...pos); if (p >= 0) bones[p].add(bones[i]); });
  bones[BI.shL].position.x *= o.shW; bones[BI.shR].position.x *= o.shW;
  const mesh = new THREE.SkinnedMesh(geo, HUMAN_MAT);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.userData.disposeGeo = true;
  const root = new THREE.Group(); root.add(mesh);
  const h = female ? rand(.92, 1.0) : rand(.97, 1.06); mesh.scale.setScalar(h);
  const hit = new THREE.Mesh(box(.5, 1.8, .4), MAT.hit); hit.position.y = .9; root.add(hit);
  const B = Object.fromEntries(BONES.map(([name], i) => [name, bones[i]]));
  const handL = new THREE.Object3D(); handL.position.y = -.31; B.elL.add(handL);
  const handR = new THREE.Object3D(); handR.position.y = -.31; B.elR.add(handR);
  const w = {
    id: n, role: roleKey, label: role.label, root, B, task: null, yaw: 0, restYaw: 0, phase: Math.random() * 20, state: 'livre', where: '',
    pose(reach, lean = reach) {
      if (reach > .04 || lean > .1) w.busyT = SIM_T;
      for (const [sh, el, s] of [[B.shL, B.elL, -1], [B.shR, B.elR, 1]]) {
        sh.rotation.set(-1.2 * reach - .04, 0, s * (.07 - .15 * reach));
        el.rotation.set(-.14 - .5 * reach * (1 - reach * .4), 0, 0);
      }
      B.chest.rotation.set(.16 * lean, 0, 0); B.pelvis.rotation.set(.06 * lean, 0, 0);
    },
    pushPose(k = 1) {      // empurrando gaiola / timão à frente
      w.busyT = SIM_T;
      for (const [sh, el, s] of [[B.shL, B.elL, -1], [B.shR, B.elR, 1]]) {
        sh.rotation.set(-.95 * k, 0, s * -.12 * k); el.rotation.set(-.5 * k, 0, 0);
      }
      B.chest.rotation.set(.14 * k, 0, 0);
    },
    pullPose(k = 1) {      // puxando a paleteira com a mão direita para trás
      w.busyT = SIM_T;
      B.shR.rotation.set(.32 * k, 0, .12 * k); B.elR.rotation.set(-.08, 0, 0);
      B.shL.rotation.set(-.04, 0, -.07); B.elL.rotation.set(-.2, 0, 0);
      B.chest.rotation.set(.1 * k, 0, 0);
    },
    walkPose(sw, armsFree) {
      B.hipL.rotation.x = sw * .5; B.hipR.rotation.x = -sw * .5;
      B.kneeL.rotation.x = Math.max(0, sw) * .75 + .02; B.kneeR.rotation.x = Math.max(0, -sw) * .75 + .02;
      B.pelvis.position.y = .93 - Math.abs(sw) * .02;
      B.pelvis.rotation.y = sw * .06;
      if (armsFree) { B.shL.rotation.x = -.04 - sw * .38; B.shR.rotation.x = -.04 + sw * .38; }
    },
    idle(dt) {
      w.phase += dt;
      w.pose(0, Math.sin(w.phase * .8) * .04);
      w.walkPose(0, false);
      B.pelvis.rotation.z = Math.sin(w.phase * .45) * .025;
      B.chest.rotation.z = -Math.sin(w.phase * .45) * .02;
      B.head.rotation.y = Math.sin(w.phase * .31 + n) * .35;
      B.head.rotation.x = Math.sin(w.phase * .23) * .06;
      if (Math.abs(w.yaw - w.restYaw) > .001) w.setYaw(lerpAngle(w.yaw, w.restYaw, Math.min(1, dt * 4)));
    },
    handsWorld(out) {
      const a = V3(), b = V3();
      if (w.mh && w.mh.hands.length === 4) {
        mhSync(w); w.mh.obj.updateMatrixWorld(true);
        const h = w.mh.hands, c = V3(), d = V3();
        h[0].getWorldPosition(a); h[2].getWorldPosition(c); h[1].getWorldPosition(b); h[3].getWorldPosition(d);
        return out.copy(a).add(b).add(c).add(d).multiplyScalar(.25);
      }
      handL.getWorldPosition(a); handR.getWorldPosition(b);
      return out.copy(a).add(b).multiplyScalar(.5);
    },
    setYaw(y) { w.yaw = y; root.rotation.y = y; },
    yawTo(pt) {      // pt em coordenadas da linha atual (world)
      const p = root.parent.worldToLocal(world.localToWorld(pt.clone()));
      return Math.atan2(p.x - root.position.x, p.z - root.position.z);
    },
  };
  hit.userData = { kind: 'worker', ref: w };
  w.pose(0); w.walkPose(0, false);
  const mh = mhAttach(w, roleKey);
  w.proc = mesh;
  if (mh) { mesh.visible = false; w.mh = mh; MH_LIVE.push(w); }
  return w;
}

/* ------------------------------------------------------------------ */
/* Pessoas MakeHuman (GLB com esqueleto) dirigidas pelo esqueleto acima */
/* ------------------------------------------------------------------ */
// O esqueleto simples continua calculando as poses (andar, alcançar, empurrar, puxar);
// a cada quadro as rotações são transferidas para o esqueleto completo do MakeHuman.
const MH = { list: [], byRole: {}, seq: {} };
let MH_LIVE = [];
const MH_MAP = [ // osso do boneco, osso MH (lado resolvido pelo sinal de x), corrige direção de repouso
  ['pelvis', 'root', false], ['chest', 'spine03', false], ['head', 'head', false],
  ['shX', 'upperarm01', true], ['elX', 'lowerarm01', true], ['hipX', 'upperleg01', true], ['kneeX', 'lowerleg01', true],
];
/* ambiente: HDRI de galpão (Poly Haven, CC0) para iluminação indireta e reflexos */
let ENV_EQUI = null;   // HDRI equiretangular original (usado também pelo modo Foto realista)
async function loadEnvironment(base = 'pessoas/') {
  if (!THREE.EXRLoader) return;
  const j = await fetch(base + 'ambiente.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const tex = await new Promise((ok, bad) => new THREE.EXRLoader().setDataType(THREE.FloatType).load('data:application/octet-stream;base64,' + j.exr, ok, undefined, bad));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const env = tex; ENV_EQUI = tex;   // o renderizador WebGPU pré-filtra o HDRI sozinho
  scene.environment = env;
}
async function loadPeople(base = 'pessoas/') {
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return false;
  const idx = await fetch(base + 'pessoas.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { loadMocap(await fetch(base + 'movimentos.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })); }
  catch (err) { console.warn('movimentos de captura indisponíveis', err); }
  const loader = new THREE.GLTFLoader();
  if (typeof MeshoptDecoder !== 'undefined') loader.setMeshoptDecoder(MeshoptDecoder);
  const tpls = await Promise.all(idx.map(e => new Promise((ok, bad) => loader.load(base + e.arquivo, g => ok({ e, g }), undefined, bad))));
  for (const { e, g } of tpls) {
    const t = mhPrepare(g.scene); t.roles = e.papeis;
    MH.list.push(t); for (const r of e.papeis) (MH.byRole[r] = MH.byRole[r] || []).push(t);
  }
  return true;
}
const DETAIL = {};
function detailTex(kind) {   // mapa de normais gerado no navegador a partir de um relevo (trama de tecido ou poros)
  if (DETAIL[kind]) return DETAIL[kind];
  const N = 256, h = new Float32Array(N * N);
  if (kind === 'trama') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / 8, v = y / 8, over = (Math.floor(u) + Math.floor(v)) % 2;
      const a = Math.sin(PI * (u % 1)), b = Math.sin(PI * (v % 1));
      h[y * N + x] = over ? a * .8 + b * .2 : b * .8 + a * .2;
    }
  } else {
    for (let i = 0; i < N * N; i++) h[i] = Math.random();
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + N) % N) * N + ((x + dx + N) % N)];
      h[y * N + x] = s / 9;
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N], dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
    const n = V3(-dx * 2, -dy * 2, 1).normalize(), i = (y * N + x) * 4;
    img.data[i] = (n.x * .5 + .5) * 255; img.data[i + 1] = (n.y * .5 + .5) * 255; img.data[i + 2] = (n.z * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  t.repeat.set(kind === 'trama' ? 70 : 40, kind === 'trama' ? 70 : 40); t.anisotropy = MAX_ANISO;
  return (DETAIL[kind] = t);
}
const UNIFORME_SORTER = true;   // variante planta-rj2-unificada
function mhPrepare(sceneRoot) {
  sceneRoot.updateMatrixWorld(true);
  let skinned = null;
  sceneRoot.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => {
        m.envMapIntensity = .5;
        if (m.name === 'refletivo') { m.emissive = C(0x30353a); return; }
        if (/esclera|iris|pupila/.test(m.name)) return;
        // tecido, cabelo, pele e couro: superfícies foscas (sem brilho de plástico)
        m.roughness = Math.max(m.roughness ?? .7, /pele/.test(m.name) ? .5 : /bota|cinto|luva/.test(m.name) ? .45 : .8);
        m.metalness = 0;
        // detalhe fino sobre a cor assada do Cycles: trama do tecido e textura da pele
        if (m.map && /camisa|calca|luva/.test(m.name)) {
          m.normalMap = detailTex('trama'); m.normalScale = new THREE.Vector2(.45, .45);
          if (m.isMeshPhysicalMaterial) { m.sheen = 1; m.sheenColor = C(0x1d2533); m.sheenRoughness = .85; }   // halo suave de tecido, na cor do pano
        } else if (m.map && /pele/.test(m.name)) {
          m.normalMap = detailTex('pele'); m.normalScale = new THREE.Vector2(.18, .18);
          if (m.isMeshPhysicalMaterial) { m.sheen = 1; m.sheenColor = C(0x3a1d14); m.sheenRoughness = .55; }    // luz quente nas bordas (pele)
        } else if (/cabelo/.test(m.name) && m.isMeshPhysicalMaterial) { m.sheen = 1; m.sheenColor = C(0x241a12); m.sheenRoughness = .4; }
        // uniforme da referência do sorter (prompt_operadores_sorter.md): colete laranja refletivo,
        // camiseta e calça cinza-escuras, luvas e botas pretas
        if (UNIFORME_SORTER) {
          if (/^colete/.test(m.name)) { m.map = null; m.color = C(0xf2661c); m.roughness = .62; if (m.isMeshPhysicalMaterial) { m.sheen = .6; m.sheenColor = C(0x5a2408); } }
          else if (/camisa/.test(m.name)) { if (m.map) m.color = C(0x7d838b); else m.color = C(0x3b4047); if (m.isMeshPhysicalMaterial) m.sheenColor = C(0x22262b); }
          else if (/calca/.test(m.name)) { m.color = C(0x9aa0a8); if (!m.map) m.color = C(0x353a41); }
          else if (/luva|bota|cinto/.test(m.name)) { m.map = null; m.color = C(/cinto/.test(m.name) ? 0x24272b : 0x18191b); }
        }
        m.needsUpdate = true;
      });
      if (o.isSkinnedMesh && !skinned) skinned = o;
    }
  });
  const bones = skinned.skeleton.bones, names = bones.map(b => b.name);
  // ordem topológica (pais antes dos filhos) e repouso em espaço do personagem
  const order = [], seen = new Set();
  const visit = b => { if (seen.has(b)) return; if (b.parent && b.parent.isBone) visit(b.parent); seen.add(b); order.push(b); };
  bones.forEach(visit);
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), sc = new THREE.Vector3();
  const rest = order.map(b => { b.matrixWorld.decompose(tmp, q, sc); return q.clone(); });
  const top = order[0].parent; top.matrixWorld.decompose(tmp, q, sc); const Q0 = q.clone();
  const bi = n => order.findIndex(b => b.name === n);
  const side = n => { const iL = bi(n + 'L'), p = V3(); order[iL].getWorldPosition(p); return p.x; };
  const map = [];
  for (const [pb, mb, sided] of MH_MAP) {
    const pairs = sided ? (() => { const xL = side(mb); return [[pb.replace('X', xL < 0 ? 'L' : 'R'), mb + 'L'], [pb.replace('X', xL < 0 ? 'R' : 'L'), mb + 'R']]; })() : [[pb, mb]];
    for (const [p, m] of pairs) {
      const i = bi(m); if (i < 0) continue;
      let C = new THREE.Quaternion();
      if (sided && /arm/.test(mb)) {  // braços: pose em A → ao longo do corpo, levemente afastados do quadril
        const dir = V3(0, 1, 0).applyQuaternion(rest[i]).normalize();
        C.setFromUnitVectors(dir, V3(Math.sign(dir.x) * .16, -1, .02).normalize());
      }                                 // pernas: mantém a postura natural do MakeHuman
      map.push({ i, p, C });
    }
  }
  const box3 = new THREE.Box3().setFromObject(sceneRoot);
  // captura de movimento: C leva a direção de repouso do osso MH para a do osso BVH
  const mc = new Map();
  if (MOCAP) for (const name in MOCAP.restDir) {
    const i = bi(name); if (i < 0) continue;
    const C = new THREE.Quaternion();
    if (name !== 'root') C.setFromUnitVectors(V3(0, 1, 0).applyQuaternion(rest[i]).normalize(), V3(...MOCAP.restDir[name]).normalize());
    mc.set(i, { name, C });
  }
  const rootW = V3(); order[0].getWorldPosition(rootW);
  return { mc, hipH: rootW.y - box3.min.y, scene: sceneRoot, orderNames: order.map(b => b.name), rest, Q0, map, rootY: order[0].position.y, floor: box3.min.y,
    hands: ['wristL', 'wristR', 'finger3-1L', 'finger3-1R'] };
}
function mhAttach(w, roleKey) {
  const pool = MH.byRole[ROLE[roleKey]?.mh || roleKey] || MH.list; if (!pool || !pool.length) return null;
  MH.seq[roleKey] = (MH.seq[roleKey] || 0) + 1;
  const t = pool[(MH.seq[roleKey] + w.id) % pool.length];
  const obj = THREE.SkeletonUtils.clone(t.scene);
  obj.position.y = -t.floor;
  w.root.add(obj);
  const byName = {}; obj.traverse(o => { if (o.isBone) byName[o.name] = o; });
  const order = t.orderNames.map(n => byName[n]);
  const parentIdx = order.map(b => order.indexOf(b.parent));
  const local = order.map(b => b.quaternion.clone());
  const mapByI = new Map(t.map.map(m => [m.i, { B: w.B[m.p], C: m.C }]));
  const hands = t.hands.map(n => byName[n]).filter(Boolean);
  const upper = new Set(), follow = new Set();
  order.forEach((b, k) => {
    if (/^(upperarm01|lowerarm01)/.test(b.name) || b.name === 'spine03') upper.add(k);
    else if (/^(spine01|spine02|neck0|head|clavicle|wrist)/.test(b.name)) follow.add(k);
  });
  return { t, obj, order, parentIdx, local, mapByI, hands, upper, follow, W: order.map(() => new THREE.Quaternion()), rootPos: order[0].position.clone(),
    // locomoção: fase do ciclo e pesos (parado / andando / de costas / ocupado com a parte de cima)
    loco: { last: null, yaw: null, speed: 0, fwd: 0, ph: Math.random(), phI: Math.random(), wW: 0, wB: 0, wU: 0, off: V3() } };
}

/* ---------- captura de movimento (CMU) ---------- */
let MOCAP = null;
function loadMocap(j) {
  for (const k in j.clips) {
    const c = j.clips[k];
    for (const b in c.q) c.q[b] = Float32Array.from(c.q[b]);
    c.root = Float32Array.from(c.root);
  }
  MOCAP = j;
}
const _qs = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function clipQ(clip, bone, f, out) {   // quaternion interpolado do quadro fracionário f
  const a = clip.q[bone]; if (!a) return null;
  const n = clip.frames, f0 = Math.floor(f), t = f - f0;
  const i0 = clip.loop ? ((f0 % n) + n) % n : clamp(f0, 0, n - 1), i1 = clip.loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1);
  _qs[0].fromArray(a, i0 * 4); _qs[1].fromArray(a, i1 * 4);
  return out.copy(_qs[0]).slerp(_qs[1], t);
}
function clipRoot(clip, f, out) {
  const a = clip.root, n = clip.frames, f0 = Math.floor(f), t = f - f0;
  const i0 = clip.loop ? ((f0 % n) + n) % n : clamp(f0, 0, n - 1), i1 = clip.loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1);
  return out.set(lerp(a[i0 * 3], a[i1 * 3], t), lerp(a[i0 * 3 + 1], a[i1 * 3 + 1], t), lerp(a[i0 * 3 + 2], a[i1 * 3 + 2], t));
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qInv = new THREE.Quaternion();
const _v1 = V3(), _v2 = V3(), _v3 = V3();
const _procW = new Map();
function procWorldQ(B, bone) {     // rotação do osso do boneco em espaço do personagem
  let q = _procW.get(bone); if (q) return q;
  q = bone.quaternion.clone();
  if (bone.parent && bone.parent.isBone) q.premultiply(procWorldQ(B, bone.parent));
  _procW.set(bone, q); return q;
}
/* mede o deslocamento real da pessoa e avança o ciclo de passos pela distância (sem pé deslizando) */
function mhLoco(w, dt) {
  const L0 = w.mh.loco, t = w.mh.t;
  const p = w.root.getWorldPosition(_v1), q = w.root.getWorldQuaternion(_qa);
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  if (!L0.last) { L0.last = p.clone(); L0.yaw = yaw; return; }
  if (dt <= 0) return;
  const dx = p.x - L0.last.x, dz = p.z - L0.last.z; L0.last.copy(p);
  let dy = yaw - L0.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); L0.yaw = yaw;
  const fwd = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / dt, lin = Math.hypot(dx, dz) / dt;
  const k = Math.min(1, dt * 7);
  L0.speed += (Math.max(lin, Math.abs(dy / dt) * .22) - L0.speed) * k;
  L0.fwd += (fwd - L0.fwd) * k;
  if (!MOCAP) return;
  const back = L0.fwd < -.08 && lin > .05, moving = L0.speed > .07;
  const W = MOCAP.clips.andar, B = MOCAP.clips.andar_tras;
  const strideW = W.stride * t.hipH, strideB = Math.abs(B.stride) * t.hipH;
  L0.ph += L0.speed * dt / (back ? strideB : strideW);
  L0.phI += dt / (MOCAP.clips.parado.frames / MOCAP.fps);
  const kw = Math.min(1, dt * 6);
  L0.wW += ((moving && !back ? clamp01(L0.speed / .35) : 0) - L0.wW) * kw;
  L0.wB += ((moving && back ? clamp01(L0.speed / .3) : 0) - L0.wB) * kw;
  L0.wU += ((SIM_T - (w.busyT ?? -9) < .2 ? 1 : 0) - L0.wU) * Math.min(1, dt * 8);
}
function mhSync(w) {
  const m = w.mh, t = m.t, L0 = m.loco; _procW.clear();
  const cl = MOCAP && t.mc.size ? MOCAP.clips : null;
  const fI = cl ? L0.phI * cl.parado.frames : 0, fW = cl ? L0.ph * cl.andar.frames : 0, fB = cl ? L0.ph * cl.andar_tras.frames : 0;
  const wU = cl ? L0.wU : 1;
  for (let k = 0; k < m.order.length; k++) {
    const b = m.order[k], pi = m.parentIdx[k], PW = pi < 0 ? t.Q0 : m.W[pi];
    const Wk = m.W[k];
    const mc = cl && t.mc.get(k), mp = m.mapByI.get(k);
    // base: captura (parado ↔ andando ↔ de costas) ou, sem captura, o boneco
    if (mc) {
      clipQ(cl.parado, mc.name, fI, _qa);
      if (L0.wW > .001) _qa.slerp(clipQ(cl.andar, mc.name, fW, _qb), L0.wW);
      if (L0.wB > .001) _qa.slerp(clipQ(cl.andar_tras, mc.name, fB, _qb), L0.wB);
      Wk.copy(_qa).multiply(mc.C).multiply(t.rest[k]);
    } else if (mp && !cl) {
      Wk.copy(procWorldQ(w.B, mp.B)).multiply(mp.C).multiply(t.rest[k]);
    } else {
      Wk.copy(PW).multiply(m.local[k]);
    }
    // parte de cima ocupada (alcançar, carregar, empurrar, puxar): braços e inclinação do boneco
    if (cl && wU > .001 && (m.upper.has(k) || m.follow.has(k))) {
      if (m.upper.has(k) && mp) _qc.copy(procWorldQ(w.B, mp.B)).multiply(mp.C).multiply(t.rest[k]);
      else _qc.copy(PW).multiply(m.local[k]);
      Wk.slerp(_qc, wU);
    }
    b.quaternion.copy(_qInv.copy(PW).invert().multiply(Wk));
  }
  const r = m.order[0];
  if (cl) {
    clipRoot(cl.parado, fI, _v2);
    if (L0.wW > .001) _v2.lerp(clipRoot(cl.andar, fW, _v3), L0.wW);
    if (L0.wB > .001) _v2.lerp(clipRoot(cl.andar_tras, fB, _v3), L0.wB);
    _v2.multiplyScalar(t.hipH);
    _v2.y += (w.B.pelvis.position.y - .93) * wU;   // agachar/baixar das tarefas
    _v2.applyQuaternion(_qInv.copy(t.Q0).invert());
    r.position.copy(m.rootPos).add(_v2);
  } else r.position.y = m.rootPos.y + (w.B.pelvis.position.y - .93);
}
let SIM_T = 0, _lastSync = 0;
const _camP = V3();
function mhSyncAll() {
  const dt = Math.max(0, Math.min(.25, SIM_T - _lastSync)); _lastSync = SIM_T;
  camera.getWorldPosition(_camP);
  for (const w of MH_LIVE) {
    if (!w.root.parent) continue;
    w.root.getWorldPosition(_v1);
    const near = _v1.distanceToSquared(_camP) < 60 * 60;   // longe: boneco leve (mesma pose, 1 draw call)
    if (w.mh.obj.visible !== near) { w.mh.obj.visible = near; w.proc.visible = !near; }
    mhLoco(w, dt);
    if (near) mhSync(w);
  }
}
