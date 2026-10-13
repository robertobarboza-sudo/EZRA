
/* ------------------------------------------------------------------ */
/* Pacotes                                                             */
/* ------------------------------------------------------------------ */
/* mistura de volumes (medidas-base em m); a escala é ajustada para a cubagem média da premissa */
const PKG_MIX = [
  { d: [.40, .30, .28], mat: 'pkgKraft', w: 4 }, { d: [.45, .35, .30], mat: 'pkgKraft', w: 3 },
  { d: [.35, .25, .25], mat: 'pkgKraft2', w: 3 }, { d: [.50, .40, .35], mat: 'pkgKraft2', w: 2 },
  { d: [.30, .30, .30], mat: 'pkgKraft', w: 2 }, { d: [.60, .40, .30], mat: 'pkgKraft', w: 1 },
  { d: [.42, .32, .25], mat: 'pkgWhite', w: 2 },
  { d: [.46, .16, .36], mat: 'bag', w: 1, bag: true }, { d: [.50, .18, .38], mat: 'bagDark', w: 1, bag: true },
];
const mixVol = t => t.bag ? PI / 6 * t.d[0] * t.d[1] * t.d[2] : t.d[0] * t.d[1] * t.d[2];
let PKG_BAG = [], PKG_SCALE = 1;
function buildPkgTypes() {
  if (PKG_BAG.length) new Set(PKG_BAG.map(t => t.geo)).forEach(g => g.dispose());
  const total = PKG_MIX.reduce((a, t) => a + t.w, 0), mean = PKG_MIX.reduce((a, t) => a + t.w * mixVol(t), 0) / total;
  PKG_SCALE = Math.cbrt(pkgTargetM3(P) / mean);
  const types = PKG_MIX.map(t => {
    const [a, b, c] = t.d.map(v => v * PKG_SCALE);
    const geo = t.bag ? new THREE.SphereGeometry(1, 18, 10).scale(a / 2, b / 2, c / 2) : new THREE.BoxGeometry(a, b, c);
    return { geo, mat: t.mat, h: b, w: t.w };
  });
  PKG_BAG = types.flatMap(t => Array(t.w).fill(t));
}
function getPkg() {
  const t = pick(PKG_BAG);
  let mesh = S.pool.pop();
  if (!mesh) { mesh = new THREE.Mesh(); mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); }
  mesh.geometry = t.geo; mesh.material = MAT[t.mat]; mesh.visible = true; mesh.rotation.set(0, rand(-.2, .2), 0);
  const p = { mesh, h: t.h, x: 0, z: 0, state: 'held', dest: -1, box: 0 };
  S.live.push(p); return p;
}
function freePkg(p) { p.mesh.visible = false; S.pool.push(p.mesh); const i = S.live.indexOf(p); if (i >= 0) S.live.splice(i, 1); }
function newPkg() {
  const p = getPkg();
  if (Math.random() * 100 < P.goleiroPct || !S.islands.length) p.dest = -1;
  else { p.dest = randInt(S.islands.length); p.box = randInt(S.islands[p.dest].slots.length); }
  return p;
}

/* ------------------------------------------------------------------ */
/* Sequenciador de etapas (incremental; aceita etapas geradas na hora e esperas) */
/* ------------------------------------------------------------------ */
function sequence(steps) {
  let i = 0, el = 0;
  return {
    step(dt) {
      while (i < steps.length) {
        const s = steps[i];
        if (s.gen) { steps.splice(i, 1, ...s.gen()); continue; }
        if (!s.started) { s.started = true; if (s.start) s.start(); }
        if (s.until) { if (s.fn) s.fn(0, dt); if (!s.until()) return false; if (s.end) s.end(); i++; el = 0; dt = 0; continue; }
        el += dt; const d = s.d || 0, k = d > 0 ? clamp01(el / d) : 1;
        if (s.fn) s.fn(k);
        if (k < 1) return false;
        dt = el - d; el = 0; if (s.end) s.end(); i++;
      }
      return true;
    },
  };
}
const tmp = V3(), tmp2 = V3();
const lw = (o, v) => world.worldToLocal(o.localToWorld(v));   // ponto local de o → coordenadas da linha atual
function arc(a, b, t, hgt) { const p = a.clone().lerp(b, t); p.y += Math.sin(PI * t) * hgt; return p; }
function holdPos(w, out) {   // ponto à frente das mãos (volume carregado não atravessa o corpo)
  w.handsWorld(out);
  w.root.getWorldQuaternion(_q); tmp2.set(0, 0, .12).applyQuaternion(_q);
  return world.worldToLocal(out.add(tmp2));
}
/* trajetória suave: cantos arredondados e perfil de velocidade com aceleração e frenagem */
function smoothPath(pts, r = .7) {
  const P0 = pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > .02).map(p => V3(p.x, 0, p.z));
  if (P0.length < 3) return P0;
  const out = [P0[0]];
  for (let i = 1; i < P0.length - 1; i++) {
    const a = P0[i - 1], c = P0[i], b = P0[i + 1];
    const la = c.distanceTo(a), lb = c.distanceTo(b), rr = Math.min(r, la * .45, lb * .45);
    const p1 = c.clone().addScaledVector(a.clone().sub(c).normalize(), rr), p2 = c.clone().addScaledVector(b.clone().sub(c).normalize(), rr);
    for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; out.push(V3(u * u * p1.x + 2 * u * t * c.x + t * t * p2.x, 0, u * u * p1.z + 2 * u * t * c.z + t * t * p2.z)); }
  }
  out.push(P0[P0.length - 1]);
  return out;
}
function pathTrack(pts, speed, accel) {
  const P = smoothPath(pts), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const Ln = cum[cum.length - 1];
  let ta = speed / accel, da = .5 * accel * ta * ta, vmax = speed;
  if (2 * da > Ln) { ta = Math.sqrt(Ln / accel); vmax = accel * ta; da = Ln / 2; }
  const tc = (Ln - 2 * da) / vmax, T = 2 * ta + tc;
  const sAt = t => t < ta ? .5 * accel * t * t : t < ta + tc ? da + vmax * (t - ta) : Ln - .5 * accel * Math.max(0, T - t) ** 2;
  const at = (sv, out) => {
    let i = 1; while (i < cum.length - 1 && cum[i] < sv) i++;
    const seg = Math.max(1e-6, cum[i] - cum[i - 1]), k = clamp01((sv - cum[i - 1]) / seg);
    return out.copy(P[i - 1]).lerp(P[i], k);
  };
  return { P, Ln, T, sAt, at };
}
const _tp = V3(), _tq = V3();
function trackStep(T, { setPos, getYaw, setYaw, backward, onFrame }) {
  let lastK = 0;
  return {
    d: T.T, start() { lastK = 0; },
    fn(k) {
      const t = k * T.T, dt = Math.max(0, (k - lastK) * T.T); lastK = k;
      const sv = T.sAt(t);
      T.at(sv, _tp); setPos(_tp);
      T.at(Math.min(T.Ln, sv + .25), _tq);
      if (_tq.distanceToSquared(_tp) > 1e-5 && sv < T.Ln - .02) {
        const head = Math.atan2(_tq.x - _tp.x, _tq.z - _tp.z) + (backward ? PI : 0);
        setYaw(lerpAngle(getYaw(), head, Math.min(1, dt * 7 + (k === 0 ? 0 : .02))));
      }
      if (onFrame) onFrame(k, sv, T.Ln);
    },
  };
}
/* caminhada de pessoa (coordenadas do pai) */
function walkSteps(w, pts, { speed = P.velPessoa, mode = 'free', backward = false, carry = null } = {}) {
  const T = pathTrack(pts, backward ? speed * .7 : speed, 1.4);
  if (T.Ln < .03) return [];
  return [trackStep(T, {
    setPos: p => { w.root.position.x = p.x; w.root.position.z = p.z; }, getYaw: () => w.yaw, setYaw: y => w.setYaw(y), backward,
    onFrame(k, sv, Ln) {
      if (mode === 'push') w.pushPose(1); else if (mode === 'carry') w.pose(.55, .15); else w.pose(0, 0);
      w.walkPose(Math.sin(sv * 4.6) * Math.min(1, sv / .25, (Ln - sv) / .25) * (backward ? .6 : 1), mode === 'free');   // boneco leve (longe)
      if (carry) carry();
    },
  })];
}
function turnStep(w, yawFn, mode = 'free', carry = null) {
  let y0 = 0, y1 = 0;
  return { d: .4, start() { y0 = w.yaw; y1 = yawFn(); }, fn(k) { w.setYaw(lerpAngle(y0, y1, ease(k))); if (mode === 'push') w.pushPose(1); else if (mode === 'carry') w.pose(.55, .15); w.walkPose(Math.sin(k * PI) * .15, mode === 'free'); if (carry) carry(); } };
}
const routeVia = (from, to, lane) => {
  const pts = [V3(from.x, 0, from.z)];
  if (Math.abs(from.z - lane) > .05) pts.push(V3(from.x, 0, lane));
  pts.push(V3(to.x, 0, lane), V3(to.x, 0, to.z));
  return pts;
};

/* ------------------------------------------------------------------ */
/* Pescador: pega da esteira e coloca no flow rack da ilha              */
/* ------------------------------------------------------------------ */
function rackHeadLocal(isl, p) { return V3(p.rx, isl.rk.deck(L.rack0 + .35) + p.h / 2, L.rack0 + .35); }
function startPick(isl, w, p) {
  p.state = 'held'; p.claimed = true;
  const p0 = p.mesh.position.clone();
  p.rx = rand(-L.rackW / 2 + .4, L.rackW / 2 - .4); p.rz = L.rack0 + .35;
  const headW = lw(isl.grp, rackHeadLocal(isl, p));
  let yB, yR, from;
  isl.reserved = (isl.reserved || 0) + 1;
  w.state = 'pescando';
  w.task = sequence(fitCycle(w, [
    { d: .42, start() { yB = w.yawTo(p0); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(w.restYaw, yB, e)); w.pose(e * .95, e); holdPos(w, tmp); p.mesh.position.lerpVectors(p0, tmp, e); } },
    { d: .5, start() { yR = w.yawTo(headW); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(yB, yR, e)); w.pose(lerp(.95, .6, e), lerp(1, .3, e)); w.walkPose(Math.sin(PI * k) * .2, false); holdPos(w, tmp); p.mesh.position.copy(tmp); } },
    { d: .35, start() { from = p.mesh.position.clone(); }, fn(k) { w.pose(.6 + .35 * Math.sin(PI * k), .5); p.mesh.position.lerpVectors(from, headW, ease(k)); },
      end() { p.state = 'rack'; isl.rack.push(p); isl.reserved--; S.picked++; } },
    { d: .4, fn(k) { const e = ease(k); w.setYaw(lerpAngle(yR, w.restYaw, e)); w.pose(.5 * (1 - e), .3 * (1 - e)); } },
    { d: 0, end() { w.state = 'livre'; } },
  ], P.phdPescador, false));   // pescador: PHD é capacidade (fôlego), não tempo travado
}

/* ------------------------------------------------------------------ */
/* Separador: pega do flow rack e coloca na scuttle                      */
/* ------------------------------------------------------------------ */
function startSep(isl, w, p) {
  const slot = isl.slots[p.box], sc = slot.sc;
  slot.lock = (slot.lock || 0) + 1;
  isl.rack.splice(isl.rack.indexOf(p), 1); p.state = 'held';
  const home = w.home, ax = slot.bs * (L.rackW / 2 + P.corredorFlow / 2);
  const route = [home, V3(ax, 0, home.z), V3(ax, 0, slot.pos.z)];
  const p0 = p.mesh.position.clone();
  let yP, from, entry, inner;
  const hold = () => { holdPos(w, tmp); p.mesh.position.copy(tmp); };
  w.state = `levando para ${slot.name}`;
  w.task = sequence(fitCycle(w, [
    { d: .45, start() { yP = w.yawTo(p0); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(w.restYaw, yP, e)); w.pose(.95 * e, 1.1 * e); holdPos(w, tmp); p.mesh.position.lerpVectors(p0, tmp, e); } },
    { d: .25, fn(k) { const e = ease(k); w.pose(lerp(.95, .55, e), lerp(1.1, .15, e)); hold(); } },
    ...walkSteps(w, route, { mode: 'carry', carry: hold }),
    turnStep(w, () => w.yawTo(lw(sc.grp, V3(0, 1.2, 0))), 'carry', hold),
    { d: .42, start() {
        from = p.mesh.position.clone();
        entry = lw(sc.grp, V3(0, PAL_H + Math.min(1.25, P.scuttleAlt * .55), .35));
        inner = lw(sc.grp, V3(rand(-.2, .2), PAL_H + .2 + (P.scuttleAlt - .4) * sc.fill / sc.cap, rand(-.2, .2)));
      },
      fn(k) { w.pose(.55 + .45 * Math.sin(PI * Math.min(1, k * 1.4)), .3); p.mesh.position.copy(k < .7 ? arc(from, entry, k / .7, .3) : entry.clone().lerp(inner, (k - .7) / .3)); p.mesh.rotation.x += .05; },
      end() {
        freePkg(p); sc.fill++; setScFill(sc); isl.count++; S.sep++; slot.lock--;
        if (sc.fill >= sc.cap * P.scuttleTroca / 100 && slot.state === 'ok') { slot.state = 'pedida'; S.scJobs[isl.s].push(slot); }
      } },
    ...walkSteps(w, [route[2], route[1], route[0]]),
    turnStep(w, () => w.restYaw),
    { d: 0, end() { w.state = 'livre'; } },
  ], P.phdSeparador));
}

/* ------------------------------------------------------------------ */
/* Goleiro: pega do flow rack do goleiro e coloca na gaiola             */
/* ------------------------------------------------------------------ */
function goalSlotX(i) { return S.goal.x1 - .42 - i * .64; }
function startKeep(w, p, slot) {
  const c = slot.cage; p.state = 'held';
  S.goalQ.splice(S.goalQ.indexOf(p), 1);
  slot.lock = (slot.lock || 0) + 1;
  const p0 = p.mesh.position.clone();
  let yP, yC, from, entry, inner;
  w.state = `colocando em ${slot.name}`;
  w.task = sequence(fitCycle(w, [
    { d: .45, start() { yP = w.yawTo(p0); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(w.restYaw, yP, e)); w.pose(e, e * 1.1); holdPos(w, tmp); p.mesh.position.lerpVectors(p0, tmp, e); } },
    { d: .5, start() { yC = w.yawTo(lw(c.grp, V3(0, 1, 0))); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(yP, yC, e)); w.pose(1 - .45 * e, 1.1 - .9 * e); w.walkPose(Math.sin(PI * k) * .25, false); holdPos(w, tmp); p.mesh.position.copy(tmp); } },
    { d: .4, start() {
        from = p.mesh.position.clone(); entry = lw(c.grp, V3(0, Math.min(1.2, P.gaiolaAlt * .7), -.3));
        inner = lw(c.grp, V3(rand(-.3, .3), .35 + (P.gaiolaAlt - .5) * c.fill / c.cap, rand(0, .2)));
      },
      fn(k) { w.pose(.55 + .45 * Math.sin(PI * Math.min(1, k * 1.4)), .3); p.mesh.position.copy(k < .65 ? arc(from, entry, k / .65, .2) : entry.clone().lerp(inner, (k - .65) / .35)); p.mesh.rotation.z += .05; },
      end() {
        freePkg(p); c.fill++; setCageFill(c); S.kept++; slot.lock--;
        if (c.fill >= c.cap * .7 && !slot.req) { slot.req = true; S.cgJobs[slot.s].push({ type: 'gol', slot }); }
      } },
    { d: .45, start() { yC = w.yaw; }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(yC, w.restYaw, e)); w.pose(.4 * (1 - e), .3 * (1 - e)); } },
    { d: 0, end() { w.state = 'livre'; } },
  ], P.phdGoleiro));
}

/* goleiro: volume avariado vai para a gaiola de avarias, logo depois do flow rack */
function startKeepAv(w, p, slot) {
  const c = slot.cage, s = w.side || 1; p.state = 'held';
  S.goalQ.splice(S.goalQ.indexOf(p), 1);
  slot.lock = (slot.lock || 0) + 1;
  const p0 = p.mesh.position.clone(), home = w.home, spot = V3(L.golX + L.golL / 2 + .1, 0, s * .55);
  const hold = () => { holdPos(w, tmp); p.mesh.position.copy(tmp); };
  let yP, from, entry, inner;
  w.state = `separando avaria · ${slot.name}`;
  w.task = sequence(fitCycle(w, [
    { d: .45, start() { yP = w.yawTo(p0); }, fn(k) { const e = ease(k); w.setYaw(lerpAngle(w.restYaw, yP, e)); w.pose(e, e * 1.1); holdPos(w, tmp); p.mesh.position.lerpVectors(p0, tmp, e); } },
    ...walkSteps(w, [home, V3(spot.x, 0, home.z), spot], { mode: 'carry', carry: hold }),
    turnStep(w, () => w.yawTo(lw(c.grp, V3(0, 1, 0))), 'carry', hold),
    { d: .4, start() {
        from = p.mesh.position.clone(); entry = lw(c.grp, V3(0, Math.min(1.2, P.gaiolaAlt * .7), -.2));
        inner = lw(c.grp, V3(rand(-.3, .3), .35 + (P.gaiolaAlt - .5) * c.fill / c.cap, rand(-.1, .2)));
      },
      fn(k) { w.pose(.55 + .45 * Math.sin(PI * Math.min(1, k * 1.4)), .3); p.mesh.position.copy(k < .65 ? arc(from, entry, k / .65, .2) : entry.clone().lerp(inner, (k - .65) / .35)); },
      end() { freePkg(p); c.fill++; setCageFill(c); S.kept++; S.avarias = (S.avarias || 0) + 1; slot.lock--; } },
    ...walkSteps(w, [spot, V3(spot.x, 0, home.z), home]),
    turnStep(w, () => w.restYaw),
    { d: 0, end() { w.state = 'livre'; } },
  ], P.phdGoleiro));
}

/* ------------------------------------------------------------------ */
/* Indução: pega da gaiola de abastecimento e coloca na esteira          */
/* ------------------------------------------------------------------ */
/* ritmo de cada indutor: o mais lento entre o PHD da pessoa e a vazão efetiva da esteira dividida pela equipe */
const inductInterval = () => {
  const n = Math.max(1, S.inductors.length);
  return Math.max(3600 / Math.max(1, P.phdInducao), n * 3600 / Math.max(1, P.capacidade * (1 - P.ineficiencia / 100)));
};
/* ajusta a sequência ao ciclo do PHD: acelera se o movimento não cabe, ou completa com tempo de processo (bipar, conferir) */
function fitCycle(w, steps, phd, pad = true) {
  const cycle = 3600 / Math.max(1, phd), base = steps.reduce((a, s) => a + (s.d || 0), 0);
  if (base > cycle) { const f = cycle / base; steps.forEach(s => { if (s.d) s.d *= f; }); }
  else if (pad) steps.splice(steps.length - 1, 0, { d: cycle - base, fn(k) { w.pose(.18 + .06 * Math.sin(k * 40), .06); } });
  return steps;
}
function startInduct(w) {
  const slot = w.slot, c = slot.cage;
  const D = Math.min(2.4, Math.max(1.0, inductInterval() * .8));
  const home = w.home, near = home.clone().addScaledVector(fwdOf(slot.psi + PI), -.4);
  const entry = lw(c.grp, V3(rand(-.25, .25), .3 + (P.gaiolaAlt - .6) * c.fill / c.cap, -.15));
  const spot = w.spot();
  let p, cy, from;
  w.state = 'induzindo';
  w.task = sequence([
    { d: .32 * D, start() { cy = w.yawTo(entry); }, fn(k) {
        const e = ease(k); w.setYaw(lerpAngle(w.restYaw, cy, Math.min(1, e * 1.4)));
        w.root.position.x = lerp(home.x, near.x, e); w.root.position.z = lerp(home.z, near.z, e);
        w.pose(.75 * e, 1.1 * e); w.walkPose(Math.sin(PI * e) * .3, false); } },
    { d: .14 * D, start() {
        p = newPkg(); p.mesh.position.copy(entry);
        c.fill = Math.max(0, c.fill - 1); setCageFill(c);
        if (c.fill <= c.cap * .3 && !slot.req) { slot.req = true; S.cgJobs[slot.s].push({ type: 'ind', slot }); }
      }, fn(k) { holdPos(w, tmp); p.mesh.position.lerpVectors(entry, tmp, ease(k)); } },
    { d: .3 * D, fn(k) {
        const e = ease(k); w.setYaw(lerpAngle(cy, w.restYaw, e));
        w.root.position.x = lerp(near.x, home.x, e); w.root.position.z = lerp(near.z, home.z, e);
        w.walkPose(Math.sin(PI * e) * .3, false); w.pose(lerp(.75, .55, e), lerp(1.1, .2, e)); holdPos(w, tmp); p.mesh.position.copy(tmp); } },
    { d: .24 * D, start() { from = p.mesh.position.clone(); spot.y = L.bt + p.h / 2; },
      fn(k) { w.pose(.55 + .4 * Math.sin(PI * k), .2 + .5 * Math.sin(PI * k)); p.mesh.position.lerpVectors(from, spot, ease(k)); },
      end() { p.state = 'belt'; p.x = spot.x; p.z = spot.z; S.induced++; } },
    { d: .2, fn(k) { w.pose(.55 * (1 - k), .2 * (1 - k)); } },
    { d: 0, end() { w.state = 'livre'; } },
  ]);
}

/* ------------------------------------------------------------------ */
/* Setup de gaiolas: troca gaiola vazia da indução e cheia do goleiro    */
/* ------------------------------------------------------------------ */
/* rota do setup: zona oeste (indução e buffers) pelo corredor antes da esteira; leste pelo corredor lateral */
function routeSetup(from, to) {
  const west = p => p.x < L.XP + .5, xc = L.xCor;
  const laneOf = p => (p.z >= 0 ? 1 : -1) * L.zAisle, P0 = V3(from.x, 0, from.z);
  if (!west(from) && !west(to)) return routeVia(from, to, laneOf(from));
  const pts = [P0];
  if (west(from)) pts.push(V3(xc, 0, from.z)); else pts.push(V3(from.x, 0, laneOf(from)), V3(xc, 0, laneOf(from)));
  if (west(to)) pts.push(V3(xc, 0, to.z), V3(to.x, 0, to.z)); else pts.push(V3(xc, 0, laneOf(to)), V3(to.x, 0, laneOf(to)), V3(to.x, 0, to.z));
  return pts.filter((p, i) => !i || p.distanceTo(pts[i - 1]) > .03);
}
const pathTo = (lane, from, to) => typeof lane === 'function' ? lane(from, to) : lane === null ? [from.clone(), to] : routeVia(from, to, lane);
function grabCageSteps(w, getSlot, lane) {
  let slot, c, H;
  return [
    { gen() {
        slot = getSlot(); c = slot.cage; H = slot.pos.clone().add(fwdOf(slot.psi).multiplyScalar(1.05));
        return [
          ...walkSteps(w, pathTo(lane, w.root.position, H)),
          turnStep(w, () => slot.psi + PI),
          { d: .45, start() {
              w.root.attach(c.grp); c._p0 = c.grp.position.clone(); c._y0 = c.grp.rotation.y;
              slot.cage = null; w.carrying = c;
            }, fn(k) { const e = ease(k); c.grp.position.lerpVectors(c._p0, V3(0, 0, 1.05), e); c.grp.rotation.y = lerpAngle(c._y0, PI, e); w.pushPose(e); } },
          ...walkSteps(w, [H, H.clone().add(fwdOf(slot.psi).multiplyScalar(1.4))], { mode: 'push', backward: true, speed: P.velPaleteira * .7 }),
        ];
      } },
  ];
}
function deliverCageSteps(w, getSlot, lane, onDone) {
  let slot;
  return [
    { gen() {
        slot = getSlot();
        const H = slot.pos.clone().add(fwdOf(slot.psi).multiplyScalar(1.05)), pre = H.clone().add(fwdOf(slot.psi).multiplyScalar(1.4));
        return [
          ...walkSteps(w, pathTo(lane, w.root.position, pre), { mode: 'push', speed: P.velPaleteira }),
          turnStep(w, () => slot.psi + PI, 'push'),
          ...walkSteps(w, [pre, H], { mode: 'push', speed: P.velPaleteira * .7 }),
          { d: .3, end() {
              const c = w.carrying; world.attach(c.grp); c.grp.position.set(slot.pos.x, 0, slot.pos.z); c.grp.rotation.set(0, slot.psi, 0);
              slot.cage = c; w.carrying = null; if (onDone) onDone(slot, c);
            } },
          ...walkSteps(w, [H, H.clone().add(fwdOf(slot.psi).multiplyScalar(.9))], { backward: true }),
        ];
      } },
  ];
}
function freeOrOldest(list, name) {
  let s = list.find(x => !x.cage && !x.res);
  if (!s) { s = list.filter(x => x.cage && !x.res).sort((a, b) => a.t - b.t)[0]; if (s) { killCage(s.cage); s.cage = null; } }
  if (s) s.res = true;
  return s;
}
function startCageJob(w, job) {
  const slot = job.slot, R = routeSetup;
  if (job.type === 'ind') {
    // indução: tira a gaiola vazia e coloca a cheia. A cheia fica pré-posicionada na fileira de trás,
    // em diagonal (sem ocupar o espaço de outra posição); a vazia vai direto ao buffer de vazias.
    const src = S.cageFull.filter(x => x.cage && !x.res).sort((a, b) => Math.abs(a.pos.z) - Math.abs(b.pos.z))[0];
    if (!src) return false;
    src.res = true;
    const out = fwdOf(slot.psi), side = V3(out.z, 0, -out.x);   // para fora da esteira / ao longo dela
    const pitch = L.ind / Math.max(1, P.inducaoPorLado);
    const F = { pos: slot.pos.clone().addScaledVector(out, 2.6).addScaledVector(side, Math.min(1.0, pitch / 2)), psi: slot.psi, cage: null };
    let dump;
    w.state = `buscando gaiola cheia para ${slot.name}`;
    w.task = sequence([
      ...grabCageSteps(w, () => src, R),
      { d: 0, end() { src.res = false; src.regen = S.t + rand(40, 80); w.state = `pré-posicionando gaiola cheia na ${slot.name}`; } },
      ...deliverCageSteps(w, () => F, R),
      { d: 0, end() { w.state = `aguardando ${slot.name} esvaziar`; } },
      { until: () => slot.cage && slot.cage.fill <= 0 && !slot.worker.task },
      { d: 0, end() { w.state = `tirando gaiola vazia da ${slot.name}`; } },
      ...grabCageSteps(w, () => slot, R),
      { until: () => !!(dump = dump || freeOrOldest(S.cageEmpty)), end() { w.state = 'levando gaiola vazia ao buffer'; } },
      ...deliverCageSteps(w, () => dump, R, (sl, c) => { sl.res = false; sl.t = S.t; c.name = 'Gaiola vazia'; c.fill = 0; setCageFill(c); }),
      { d: 0, end() { w.state = `colocando gaiola cheia na ${slot.name}`; } },
      ...grabCageSteps(w, () => F, R),
      ...deliverCageSteps(w, () => slot, null, (sl, c) => { c.name = sl.name; sl.req = false; S.cageSwaps++; }),
      { gen: () => [...walkSteps(w, R(w.root.position, w.home)), turnStep(w, () => w.restYaw)] },
      { d: 0, end() { w.state = 'livre'; } },
    ]);
    return true;
  }
  // goleiro: leva uma vazia do buffer, troca quando a gaiola enche e devolve a cheia ao buffer de cheias (volta para a indução)
  const src = S.cageEmpty.filter(x => x.cage && !x.res).sort((a, b) => a.t - b.t)[0];
  if (!src) return false;
  src.res = true;
  const s = slot.pos.z >= 0 ? 1 : -1;
  const B = { pos: slot.pos.clone().add(V3(slot.pos.x < L.golX ? -1.5 : 1.5, 0, 0)), psi: slot.psi, cage: null };
  const Pk = { pos: slot.pos.clone().add(V3(0, 0, s * 3.2)), psi: slot.psi, cage: null };
  let dump;
  w.state = `levando gaiola vazia para ${slot.name}`;
  w.task = sequence([
    ...grabCageSteps(w, () => src, R),
    { d: 0, end() { src.res = false; } },
    ...deliverCageSteps(w, () => B, R),
    { d: 0, end() { w.state = `aguardando ${slot.name} encher`; } },
    { until: () => slot.cage && slot.cage.fill >= slot.cage.cap * .95 && !(slot.lock > 0) },
    { d: 0, end() { w.state = `trocando gaiola do ${slot.name}`; } },
    ...grabCageSteps(w, () => slot, null),
    ...deliverCageSteps(w, () => Pk, null),
    ...grabCageSteps(w, () => B, null),
    ...deliverCageSteps(w, () => slot, null, (sl, c) => { c.name = sl.name; c.fill = 0; setCageFill(c); sl.req = false; S.cageSwaps++; }),
    ...grabCageSteps(w, () => Pk, null),
    { until: () => !!(dump = dump || freeOrOldest(S.cageFull)), end() { w.state = 'levando gaiola cheia ao buffer da indução'; } },
    ...deliverCageSteps(w, () => dump, R, (sl, c) => { sl.res = false; sl.t = S.t; sl.regen = 0; c.name = 'Gaiola cheia (goleiro)'; }),
    { gen: () => [...walkSteps(w, R(w.root.position, w.home)), turnStep(w, () => w.restYaw)] },
    { d: 0, end() { w.state = 'livre'; } },
  ]);
  return true;
}

/* ------------------------------------------------------------------ */
/* Paleteira: unidade (paleteira + operador) e docagem em pallets        */
/* ------------------------------------------------------------------ */
const FORK_C = .925;   // centro da carga atrás da unidade
function unitPos(u) { return u.grp.position; }
function unitMove(u, pts, { backward = false, speed = P.velPaleteira } = {}) {
  const op = u.op, T = pathTrack(pts, speed, .8);
  if (T.Ln < .03) return [];
  return [trackStep(T, {
    setPos: p => { u.grp.position.x = p.x; u.grp.position.z = p.z; }, getYaw: () => u.grp.rotation.y, setYaw: y => { u.grp.rotation.y = y; }, backward,
    onFrame(k, sv, Ln) {
      op.setYaw(backward ? PI : 0);
      op.root.position.z = backward ? .62 : .82;
      if (backward) op.pushPose(1); else op.pullPose(1);
      op.walkPose(Math.sin(sv * 4.6) * Math.min(1, sv / .25, (Ln - sv) / .25), false);
    },
  })];
}
function unitTurn(u, yawFn) {
  let y0 = 0, y1 = 0;
  return { d: 1.2, start() { y0 = u.grp.rotation.y; y1 = yawFn(); },
    fn(k) { u.grp.rotation.y = lerpAngle(y0, y1, ease(k)); u.op.setYaw(0); u.op.root.position.z = .82; u.op.pullPose(1); u.op.walkPose(Math.sin(k * PI * 3) * .3, false); } };
}
/* encaixa nos garfos o pallet em T (yaw da carga psi) e retorna ao ponto de aproximação */
function dockSteps(u, T, psi, approachDist, lane, onDock, { fromWallSide = false } = {}) {
  const yawD = fromWallSide ? psi : psi - PI;
  const f = fwdOf(yawD), D = T.clone().addScaledVector(f, FORK_C), A = T.clone().addScaledVector(f, Math.max(approachDist, FORK_C + 1));
  return [
    { gen: () => unitMove(u, routeVia(unitPos(u), A, lane)) },
    unitTurn(u, () => yawD),
    ...unitMove(u, [A, D], { backward: true, speed: P.velPaleteira * .6 }),
    { d: .5, end: onDock },
    ...unitMove(u, [D, A], { speed: P.velPaleteira * .7 }),
  ];
}
function attachLoad(u, obj) { u.grp.attach(obj.grp); obj.grp.position.y += .035; u.load = obj; }
function dropLoad(u, parent, pos, yaw) {
  const o = u.load; parent.attach(o.grp); o.grp.position.set(pos.x, 0, pos.z); o.grp.rotation.set(0, yaw, 0); u.load = null; return o;
}
function islandSlotWorld(slot) {
  const T = lw(slot.isl.grp, slot.pos.clone()); T.y = 0;
  return { T, psi: slot.isl.grp.rotation.y + slot.yaw };
}
function startScuttleJob(u, slot) {
  const s = u.side, lane = s * L.zAisle;
  const C = S.fullBuf.filter(x => !x.sc && !x.res).sort((a, b) => Math.abs(a.T.z - s * 3) - Math.abs(b.T.z - s * 3))[0];
  const K = S.emptyBuf[s].filter(x => x.sc && !x.res).sort((a, b) => Math.abs(a.T.x - slot.isl.xc) - Math.abs(b.T.x - slot.isl.xc))[0];
  if (!C || !K) return false;
  C.res = true; K.res = true; slot.state = 'em troca';
  const { T, psi } = islandSlotWorld(slot), gapD = .6 + L.gap / 2;
  u.op.state = `trocando scuttle ${slot.isl.code}·${slot.name}`;
  u.task = sequence([
    { gen: () => { const yawD = psi - PI, f = fwdOf(yawD), A = T.clone().addScaledVector(f, Math.max(gapD, FORK_C + 1)); return [...unitMove(u, routeVia(unitPos(u), A, lane)), unitTurn(u, () => yawD)]; } },
    { until: () => !(slot.lock > 0) },
    { gen: () => {
        const yawD = psi - PI, f = fwdOf(yawD), D = T.clone().addScaledVector(f, FORK_C), A = T.clone().addScaledVector(f, Math.max(gapD, FORK_C + 1));
        return [
          ...unitMove(u, [A, D], { backward: true, speed: P.velPaleteira * .6 }),
          { d: .5, end() { attachLoad(u, slot.sc); slot.sc = null; slot.state = 'ausente'; } },
          ...unitMove(u, [D, A], { speed: P.velPaleteira * .7 }),
        ];
      } },
    ...dockSteps(u, C.T, C.psi, 2.3, lane, () => { C.sc = dropLoad(u, world, C.T, C.psi); C.t = S.t; C.res = false; }),
    ...dockSteps(u, K.T, K.psi, 2.3, lane, () => { attachLoad(u, K.sc); K.sc = null; K.res = false; K.regen = S.t + rand(30, 50); }),
    ...dockSteps(u, T, psi, gapD, lane, () => {
      const sc = dropLoad(u, slot.isl.grp, slot.pos, slot.yaw);
      sc.fill = 0; setScFill(sc); setLabel(sc, `I${slot.isl.code}·${slot.name}`);
      slot.sc = sc; slot.state = 'ok'; S.swaps++;
    }),
    { gen: () => [...unitMove(u, routeVia(unitPos(u), u.home, lane)), unitTurn(u, () => u.homeYaw)] },
    { d: 0, end() { u.op.state = 'livre'; } },
  ]);
  return true;
}
function startLoadJob(u, C) {
  const s = u.side, lane = s * L.zApron;
  C.res = true;
  const dockX = L.dockXs.reduce((b, x) => Math.abs(x - C.T.x) < Math.abs(b - C.T.x) ? x : b, L.dockXs[0] ?? C.T.x);
  u.op.state = 'carregando caminhão';
  u.task = sequence([
    ...dockSteps(u, C.T, C.psi, 2.2, lane, () => { attachLoad(u, C.sc); C.sc = null; C.res = false; }, { fromWallSide: true }),
    { gen: () => {
        const Ap = V3(dockX, 0, lane), f = fwdOf(C.psi + PI);   // unidade de costas para a parede
        const D = V3(dockX, 0, s * (L.zWall + 3.2)).addScaledVector(f, FORK_C);
        return [
          ...unitMove(u, routeVia(unitPos(u), Ap, lane)),
          unitTurn(u, () => C.psi + PI),
          ...unitMove(u, [Ap, D], { backward: true, speed: P.velPaleteira * .7 }),
          { d: .4, end() { const o = u.load; u.grp.remove(o.grp); killScuttle(o); u.load = null; S.shipped++; } },
          ...unitMove(u, [D, Ap]),
        ];
      } },
    { gen: () => [...unitMove(u, routeVia(unitPos(u), u.home, lane)), unitTurn(u, () => u.homeYaw)] },
    { d: 0, end() { u.op.state = 'livre'; } },
  ]);
}

/* ------------------------------------------------------------------ */
/* Laço da simulação                                                   */
/* ------------------------------------------------------------------ */
function runWorker(w, dt) {
  if (w.task) { if (w.task.step(dt)) w.task = null; }
  else w.idle(dt);
}
function update(dt) {
  SIM_T += dt;
  TEX.belt.offset.x -= P.velEsteira * dt / 1.2;
  for (const ln of LINES) {
    S = ln.S; world = ln.grp; updateLine(dt);
    // histórico por esteira: [t, saída da esteira (pesca + goleiro), goleiro, volumes por bancada, induzidos]
    const h = S.hist2 || (S.hist2 = []);
    if (!h.length || S.t - h[h.length - 1][0] >= 2) { h.push([S.t, S.picked + S.kept, S.kept, S.islands.map(i => i.count), S.induced]); if (h.length > 400) h.shift(); }
  }
  S = PLANT; world = ROOT; updatePlant(dt);
  if (SORTER_MODE) { S = PLANT; world = ROOT; sorterUpdate(dt); }
  S = AGG;
  if (!AGG.hist.length || AGG.t - AGG.hist[AGG.hist.length - 1][0] >= 2) { AGG.hist.push([AGG.t, AGG.induced]); if (AGG.hist.length > 400) AGG.hist.shift(); }
}
function updateLine(dt) {
  S.t += dt;
  const v = P.velEsteira;

  // indução
  for (const w of S.inductors) {
    w.timer -= dt;   // o relógio corre também durante o movimento: ciclo = intervalo da premissa
    if (w.task) continue;
    if (w.timer <= 0) {
      if (w.slot.cage && w.slot.cage.fill > 0) { startInduct(w); w.timer += inductInterval() * rand(.8, 1.2); if (w.timer < 0) w.timer = 0; }
      else { w.timer = .5; w.state = 'aguardando gaiola'; }
    }
  }

  // esteira (cada volume respeita o da frente)
  const belt = S.live.filter(p => p.state === 'belt').sort((a, b) => b.x - a.x);
  let limit = S.goalQ.length ? Math.min(goalSlotX(S.goalQ.length), L.X1 + .4) : L.X1 + .4;
  limit = Math.min(limit, goalSlotX(S.goalQ.length));
  for (const p of belt) {
    p.x = Math.min(p.x + v * dt, limit);
    limit = Math.min(limit, p.x - .62);
    if (p.dest >= 0 && !p.claimed) {
      const isl = S.islands[p.dest];
      let taken = false;
      if (isl.rack.length + (isl.reserved || 0) < P.flowCap) {
        for (const w of isl.pickers) {
          if (w.task || (w.tokens ?? 3) < 1) continue;
          if (p.x > w.wx - 1.0 && p.x < w.wx + .7) { w.tokens = (w.tokens ?? 3) - 1; startPick(isl, w, p); taken = true; break; }
        }
      }
      if (taken) continue;
      if (p.x > Math.max(...isl.pickers.map(w => w.wx)) + .8) { p.dest = -1; p.missed = true; }
    }
    if (p.x >= L.X1 - .25) { p.state = 'goal'; p.av = Math.random() * 100 < P.avariaPct; S.goalQ.push(p); }
    p.mesh.position.set(p.x, L.bt + p.h / 2, p.z);
  }
  // flow rack do goleiro
  S.goalQ.forEach((p, i) => {
    const tx = goalSlotX(i);
    p.x = Math.min(tx, p.x + v * dt);
    p.z += (clamp(p.z, -L.bw / 2 + .35, L.bw / 2 - .35) - p.z) * Math.min(1, dt * 2);
    const y = p.x > S.goal.x0 ? S.goal.deck(p.x) + .03 : L.bt;
    p.mesh.position.set(p.x, y + p.h / 2, p.z);
  });
  // flow racks das ilhas (volumes rolam até a fila)
  for (const isl of S.islands) {
    for (const w of isl.pickers) w.tokens = Math.min(3, (w.tokens ?? 3) + dt * P.phdPescador / 3600);
    isl.rack.forEach((p, i) => {
      const tz = Math.max(L.rack0 + .35, L.rack1 - .42 - i * .62);
      p.rz = Math.min(tz, p.rz + .7 * dt);
      p.mesh.position.copy(lw(isl.grp, V3(p.rx, isl.rk.deck(p.rz) + p.h / 2, p.rz)));
    });
    for (const w of isl.seps) {
      if (w.task) continue;
      const tz0 = (i) => Math.max(L.rack0 + .35, L.rack1 - .42 - i * .62);
      const cand = isl.rack.slice(0, 4).find((p, i) => {
        const sl = isl.slots[p.box];
        return p.rz >= tz0(i) - .08 && sl.sc && sl.sc.fill < sl.sc.cap && (!w.sideOnly || sl.bs === w.sideOnly);
      });
      if (cand) startSep(isl, w, cand);
      else w.state = isl.rack.length ? 'aguardando scuttle' : 'livre';
    }
  }
  // goleiros
  for (const w of S.goleiros) {
    if (w.task) continue;
    const p = S.goalQ.find((q, i) => q.state === 'goal' && q.x >= goalSlotX(i) - .05);
    if (!p) continue;
    const av = S.avSlot;
    if (p.av && av && av.cage && !av.res && av.cage.fill + (av.lock || 0) < av.cage.cap) { startKeepAv(w, p, av); continue; }
    const slots = (S.goleiros.length === 2 ? S.gSlots[w.side] : [...S.gSlots[1], ...S.gSlots[-1]]).filter(sl => sl.cage && sl.cage.fill < sl.cage.cap);
    if (!slots.length) { w.state = 'aguardando gaiola'; continue; }
    slots.sort((a, b) => a.cage.fill - b.cage.fill);
    startKeep(w, p, slots[0]);
  }
  // equipes móveis
  for (const s of [1, -1]) {
    for (const u of S.jacks[s]) if (!u.task && S.scJobs[s].length) { const slot = S.scJobs[s][0]; if (startScuttleJob(u, slot)) S.scJobs[s].shift(); }
    for (const w of S.setups[s]) if (!w.task && S.cgJobs[s].length) { const job = S.cgJobs[s][0]; if (startCageJob(w, job)) S.cgJobs[s].shift(); }
    // reposição automática só quando não há equipe de abastecimento de scuttles na planta
    if (!P.abastScuttles) for (const K of S.emptyBuf[s]) if (!K.sc && !K.res && K.regen && S.t >= K.regen) { K.sc = newScuttle('VAZIA'); place(K.sc, world, K.T, K.psi); K.regen = 0; }
  }
  // gaiolas cheias chegam ao buffer da indução; scuttles cheias saem do buffer de saída
  if (!P.abastGaiolas) for (const F of S.cageFull) if (!F.cage && !F.res && F.regen && S.t >= F.regen) { F.cage = newCage(P.gaiolaCap, 'Gaiola cheia'); place(F.cage, world, F.pos, F.psi); F.regen = 0; }
  const occ = S.fullBuf.filter(x => x.sc && !x.res);
  if (!P.carregadoresSaida && occ.length > 7) { const o = occ.sort((a, b) => a.t - b.t)[0]; if (S.t - o.t > 40) { killScuttle(o.sc); o.sc = null; S.shipped++; } }

  for (const w of S.workers) { if (w.unit) continue; runWorker(w, dt); }
  for (const s of [1, -1]) for (const u of [...S.jacks[s], ...S.loaders[s]]) {
    if (u.task) { if (u.task.step(dt)) u.task = null; }
    else { u.op.idle(dt); u.op.root.position.z = .82; }
  }
}

/* depois de montar: posições de referência e aquecimento da operação */
function afterBuild() {
  for (const ln of LINES) for (const isl of ln.S.islands) for (const w of isl.pickers) w.wx = ln.grp.worldToLocal(isl.grp.localToWorld(w.home.clone())).x;
  const warm = 150, h = 1 / 20;
  for (let t = 0; t < warm; t += h) update(h);
  S.t0 = S.t; S.induced0 = S.induced; S.hist = [[S.t, S.induced]];
  // início do turno: zera os acumulados por esteira e por bancada depois do aquecimento
  for (const ln of LINES) {
    const s = ln.S; s.t0 = s.t; s.out0 = s.picked + s.kept; s.kept0 = s.kept;
    for (const isl of s.islands) isl.count0 = isl.count;
    s.hist2 = [[s.t, s.picked + s.kept, s.kept, s.islands.map(i => i.count), s.induced]];
  }
}
