'use strict';
const $ = s => document.querySelector(s);
const PI = Math.PI, TAU = PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = n => Math.floor(Math.random() * n);
const pick = arr => arr[randInt(arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = t => clamp(t, 0, 1);
const ease = t => { t = clamp01(t); return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => { const d = ((b - a + PI) % TAU + TAU) % TAU - PI; return a + d * t; };
const fmt = n => Math.round(n).toLocaleString('pt-BR');
const fmtM = (n, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = hex => new THREE.Color(hex).convertSRGBToLinear();   // cores sRGB → lineares

/* ------------------------------------------------------------------ */
/* Premissas (tudo que a aba Premissas edita)                           */
/* ------------------------------------------------------------------ */
const DEFAULTS = {
  capacidade: 3000, ineficiencia: 15, goleiroPct: 10, velEsteira: 0.9,
  inducaoComp: 8, larguraEsteira: 1.65, alturaEsteira: 0.82, ilhasPorLado: 5,
  linhas: 3, corredorLinhas: 2.5, caminhoSeguro: 1.4,
  recebimento: 4, abastGaiolas: 4, abastScuttles: 12, carregadoresSaida: 6, robosStretch: 1, tempoStretch: 30, conferentes: 0, lideres: 2,
  stretchManual: 2, operadorRobo: 1, tempoMontagem: 20, tempoStretchManual: 80, avariaPct: 5, tratativa: 2, tempoAvaria: 25,
  folgaIlha: 0.1, distEsteiraFlow: 0.9,
  flowLarg: 2.5, flowComp: 3.3, flowAlt: 0.85, flowCap: 8,
  corredorFlow: 1.2, corredorPaleteira: 3.0, scuttlesPorFila: 3,
  golFlowComp: 1.8, gaiolasGoleiro: 4,
  scuttleAlt: 2.0, scuttleCap: 46, ocupScuttle: 90, perdaEncaixe: 1.5, scuttleTroca: 85, gaiolaAlt: 1.7, gaiolaCap: 45,
  inducaoPorLado: 4, inducaoPonta: 0, pescadoresPorIlha: 1, separadoresPorIlha: 1,
  paleteirosPorLado: 3, setupPorLado: 3, goleiros: 2, carregadoresPorLado: 0,
  velPessoa: 1.3, velPaleteira: 1.1,
  phdInducao: 350, phdPescador: 600, phdSeparador: 300, phdGoleiro: 350,
  // sorter RJ2 ASM3 (premissas da operação)
  carrinhosNivel: 946, niveisSorter: 3, voltaSorter: 180, inducaoSorterPh: 1000, pacotesSaca: 45, quedasPorColab: 10,
  sacasGaiola: 10, permanenciaBuffer: 120, permanenciaRua: 300,
};
const SCHEMA = [
  { group: 'Planta', fields: [
    ['linhas', 'Esteiras (linhas)', 'un', 1, 3, 1],
    ['corredorLinhas', 'Corredor entre linhas', 'm', 1, 8, .1],
    ['caminhoSeguro', 'Largura do caminho seguro (pedestres)', 'm', .8, 1.4, .05],
  ] },
  { group: 'Volume e performance', fields: [
    ['capacidade', 'Capacidade nominal por esteira', 'pct/h', 300, 9000, 100],
    ['ineficiencia', 'Margem de ineficiência', '%', 0, 60, 1],
    ['goleiroPct', 'Volume que vai para o goleiro', '%', 0, 50, 1],
    ['velEsteira', 'Velocidade da esteira', 'm/s', .2, 2.5, .05],
  ] },
  { group: 'Produtividade por pessoa (PHD)', fields: [
    ['phdInducao', 'PHD da indução', 'pct/h', 50, 2000, 10],
    ['phdPescador', 'PHD do pescador', 'pct/h', 50, 3000, 10],
    ['phdSeparador', 'PHD do separador', 'pct/h', 50, 2000, 10],
    ['phdGoleiro', 'PHD do goleiro', 'pct/h', 50, 2000, 10],
  ] },
  { group: 'Esteira e ilhas', fields: [
    ['inducaoComp', 'Comprimento da indução', 'm', 3, 20, .5],
    ['larguraEsteira', 'Largura da esteira', 'm', .6, 2.5, .05],
    ['alturaEsteira', 'Altura da esteira', 'm', .5, 1.2, .01],
    ['ilhasPorLado', 'Ilhas por lado', 'un', 1, 10, 1],
    ['folgaIlha', 'Distância esteira → ilha', 'm', 0, 1.5, .05],
    ['distEsteiraFlow', 'Área do pescador (até o flow rack)', 'm', .6, 2, .05],
    ['flowLarg', 'Largura do flow rack da ilha', 'm', 1, 4, .1],
    ['flowComp', 'Comprimento do flow rack da ilha', 'm', 1.5, 6, .1],
    ['flowAlt', 'Altura do flow rack', 'm', .6, 1.2, .01],
    ['flowCap', 'Capacidade do flow rack', 'volumes', 2, 20, 1],
    ['corredorFlow', 'Corredor flow rack ↔ scuttle', 'm', .8, 3, .05],
    ['corredorPaleteira', 'Corredor entre ilhas (paleteira)', 'm', 2, 5, .1],
    ['scuttlesPorFila', 'Scuttles por lado da ilha', 'un', 1, 5, 1],
    ['golFlowComp', 'Flow rack do goleiro (comprimento)', 'm', .8, 4, .1],
    ['gaiolasGoleiro', 'Gaiolas no goleiro', 'un', 2, 6, 2],
  ] },
  { group: 'Unitizadores', fields: [
    ['scuttleAlt', 'Altura da scuttle', 'm', 1, 2.5, .05],
    ['scuttleCap', 'Capacidade média da scuttle', 'volumes', 10, 150, 1],
    ['ocupScuttle', 'Ocupação útil da cubagem', '%', 40, 100, 1],
    ['perdaEncaixe', 'Perda por encaixe do volume', '%', 0, 30, .1],
    ['scuttleTroca', 'Chamar troca da scuttle com', '% cheia', 50, 100, 1],
    ['gaiolaAlt', 'Altura da gaiola', 'm', 1.2, 2.2, .05],
    ['gaiolaCap', 'Capacidade da gaiola', 'volumes', 10, 150, 1],
  ] },
  { group: 'Pessoas por atividade', fields: [
    ['inducaoPorLado', 'Indução por lado', 'pessoas', 0, 8, 1],
    ['inducaoPonta', 'Indução na ponta', 'pessoas', 0, 1, 1],
    ['pescadoresPorIlha', 'Pescadores por ilha', 'pessoas', 1, 2, 1],
    ['separadoresPorIlha', 'Separadores por ilha', 'pessoas', 1, 2, 1],
    ['paleteirosPorLado', 'Paleteiros (troca de scuttle) por lado', 'pessoas', 0, 6, 1],
    ['setupPorLado', 'Setup de gaiolas por lado', 'pessoas', 0, 6, 1],
    ['goleiros', 'Goleiros', 'pessoas', 1, 2, 1],
  ] },
  { group: 'Equipe da planta (todas as linhas)', fields: [
    ['recebimento', 'Recebimento (entrada de gaiolas)', 'pessoas', 0, 10, 1],
    ['abastGaiolas', 'Abastecimento de gaiolas nas linhas', 'pessoas', 0, 12, 1],
    ['abastScuttles', 'Abastecimento de scuttles vazias (paleteira)', 'pessoas', 0, 16, 1],
    ['carregadoresSaida', 'Saída: scuttle cheia → stretch → doca', 'pessoas', 0, 16, 1],
    ['stretchManual', 'Montagem e stretch manual de scuttles', 'pessoas', 0, 4, 1],
    ['operadorRobo', 'Operador do robô de stretch (monta a caixa)', 'pessoas', 0, 2, 1],
    ['tratativa', 'Tratativa de avarias', 'pessoas', 0, 6, 1],
    ['lideres', 'Liderança', 'pessoas', 0, 4, 1],
  ] },
  { group: 'Montagem de scuttles (stretch)', fields: [
    ['tempoStretch', 'Robô: tempo de stretch por scuttle', 's', 10, 300, 5],
    ['tempoMontagem', 'Montagem da caixa no pallet', 's', 5, 120, 5],
    ['tempoStretchManual', 'Stretch manual por scuttle', 's', 20, 300, 5],
  ] },
  { group: 'Avarias', fields: [
    ['avariaPct', 'Avarias no volume do goleiro', '%', 0, 60, 1],
    ['tempoAvaria', 'Tratativa por volume avariado', 's', 5, 180, 5],
  ] },
  { group: 'Sorter (ASM)', fields: [
    ['carrinhosNivel', 'Carrinhos por nível', 'un', 100, 2000, 1],
    ['niveisSorter', 'Níveis do sorter', 'un', 1, 3, 1],
    ['voltaSorter', 'Tempo de uma volta completa', 's', 60, 600, 5],
    ['inducaoSorterPh', 'Indução por mesa', 'pct/h', 200, 2400, 50],
    ['pacotesSaca', 'Pacotes por saca (média)', 'pct', 10, 120, 1],
    ['quedasPorColab', 'Quedas por colaborador', 'quedas', 2, 30, 1],
    ['sacasGaiola', 'Sacas por gaiola', 'sacas', 2, 30, 1],
    ['permanenciaBuffer', 'Gaiola no buffer de endereçamento', 's', 10, 1800, 10],
    ['permanenciaRua', 'Gaiola na rua até o carregamento', 's', 30, 3600, 30],
  ] },
  { group: 'Ritmo das pessoas', fields: [
    ['velPessoa', 'Velocidade de caminhada', 'm/s', .6, 2, .05],
    ['velPaleteira', 'Velocidade com paleteira/gaiola', 'm/s', .5, 2, .05],
  ] },
];
const STORE_KEY = 'planta-rj2-premissas-v1';
function loadParams() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && typeof s === 'object') return sanitize({ ...DEFAULTS, ...s }); } catch (e) {}
  return { ...DEFAULTS };
}
function saveParams(p) { try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) {} }
function sanitize(p) {
  const out = { ...DEFAULTS };
  for (const g of SCHEMA) for (const [k, , , mn, mx, st] of g.fields) {
    let v = Number(p[k]); if (!isFinite(v)) v = DEFAULTS[k];
    v = clamp(v, mn, mx); if (st >= 1) v = Math.round(v / st) * st;
    out[k] = v;
  }
  return out;
}
let P = loadParams();

/* cubagem média de cada volume que fecha a capacidade da scuttle (1,20 × 1,00 × altura) */
const pkgTargetM3 = p => 1.2 * 1.0 * p.scuttleAlt * (p.ocupScuttle / 100) / (p.scuttleCap * (1 + p.perdaEncaixe / 100));

/* layout derivado das premissas */
const SORTER_MODE = true;   // planta das esteiras dentro do galpão do sorter (RJ2 ASM3)
function computeLayout(p) {
  const L = {};
  L.bw = p.larguraEsteira; L.bt = p.alturaEsteira; L.ind = p.inducaoComp;
  L.rackW = p.flowLarg; L.rackL = Math.max(p.flowComp, p.scuttlesPorFila * 1.1 - .1); L.rackH = p.flowAlt;
  L.rack0 = p.distEsteiraFlow; L.rack1 = L.rack0 + L.rackL;
  L.scX = L.rackW / 2 + p.corredorFlow + .6;          // centro da scuttle (eixo x local da ilha)
  L.half = L.scX + .6;                                // meia largura da ilha
  L.gap = p.corredorPaleteira;
  L.pitch = 2 * L.half + L.gap;
  L.nIsl = p.ilhasPorLado;
  L.len = L.ind + L.gap + L.nIsl * L.pitch;
  L.X0 = -L.len / 2; L.X1 = L.len / 2; L.XP = L.X0 + L.ind;
  L.xc = k => L.XP + L.gap + L.half + k * L.pitch;
  L.zIsl = L.bw / 2 + p.folgaIlha;                     // origem local das ilhas
  L.islDepth = L.rack1 + 1.0;                           // até a área do separador
  L.zEdge = L.zIsl + L.islDepth;                        // borda externa das ilhas
  // planta unificada com o sorter: modo compacto (cabe ao lado do sorter, entre as docas e a parede leste)
  const CMP = L.cmp = SORTER_MODE;
  L.zAisle = L.zEdge + (CMP ? 1.5 : 1.9);              // eixo do corredor principal
  L.zCons = CMP ? L.zAisle + 1.9 : L.zEdge + 4.6;       // fila de scuttles vazias (centro da scuttle)
  L.consOff = CMP ? 13 : 0;                             // compacto: filas defasadas em x (lado A à frente, lado B atrás)
  L.zApron = L.zCons + (CMP ? .75 : 1.6);
  L.zWall = Math.ceil(L.zCons + 2.6);                   // borda da maquete
  L.golL = p.golFlowComp;
  L.golX = L.X1 + .05 + L.golL / 2;                     // centro do flow rack do goleiro
  L.xWest = Math.floor(L.X0 - (CMP ? 5.6 : 8));         // borda oeste (buffers de gaiolas)
  L.xEast = Math.ceil(L.golX + (CMP ? 7 : 10));         // borda leste (buffer de scuttles cheias)
  L.xCor = L.X0 - 2.2;                                  // corredor oeste: cruza a linha antes da esteira
  L.cageBufX = L.X0 - (CMP ? 3.7 : 5.0);                // buffers de gaiolas (cheias ao sul, vazias ao norte)
  L.midIsl = (L.XP + L.X1) / 2;                         // centro das ilhas (buffer de scuttles vazias)
  L.eastBufX = L.golX + (CMP ? 4.2 : 6.2);              // buffer de scuttles cheias, depois do goleiro
  /* planta: linhas lado a lado (eixo z), zonas de entrada a oeste e de saída a leste */
  L.nLines = p.linhas;
  // compacto: as filas de scuttles vazias de linhas vizinhas ficam defasadas, então o passo só precisa
  // deixar livre o corredor de paleteira da linha ao lado
  L.LP = CMP ? L.zCons + .6 + L.zAisle + .5 : 2 * L.zApron + p.corredorLinhas;
  L.zLines = Array.from({ length: L.nLines }, (_, i) => (i - (L.nLines - 1) / 2) * L.LP);
  L.zN = L.zLines[0] - L.zApron; L.zS = L.zLines[L.nLines - 1] + L.zApron;
  L.xW = L.xWest - 1.8;                                 // corredor oeste (abastecimento das linhas)
  L.bufN = CMP ? 5 : 8;                                 // posições por fileira nos buffers da planta
  L.lanePitch = CMP ? 4.4 : 5;
  L.pbx1 = L.xW - (CMP ? 1.3 : 1.6); L.pbx0 = L.pbx1 - (L.bufN * 1.45 + .4);   // buffers de gaiolas da planta
  L.xR = L.pbx0 - 1.8;                                  // corredor da entrada (recebimento)
  L.bx0 = L.xR - (CMP ? 3.0 : 4.2);                     // parede oeste (docas de entrada)
  L.xE = L.xEast + (CMP ? 1.2 : 1.6);                   // corredor leste (saída)
  L.stX = L.xE + (CMP ? 1.5 : 5.0);                     // estacionamento dos carregadores de saída
  L.bx1 = L.stX + (CMP ? 4.6 : 7.5);                    // parede leste (docas de saída)
  L.cs = p.caminhoSeguro;                               // caminho seguro de pedestres
  L.zCS = L.zS + .4 + L.cs / 2;                         // eixo do caminho seguro
  L.zRoom0 = L.zS + .4 + L.cs + .5;                     // faixa sul: conferência, liderança, pallets de scuttles
  L.bz1 = CMP ? L.zRoom0 : L.zRoom0 + 8.5;              // compacto: liderança e avarias vão para dentro da planta
  L.bz0 = L.zN - (CMP ? 1.2 : 7.5);                     // faixa norte: banheiros (fora do compacto)
  return L;
}

/* ------------------------------------------------------------------ */
/* Renderer, cena, câmera, controles                                   */
/* ------------------------------------------------------------------ */
const stage = $('#stage');
// WebGPU (com retorno automático para WebGL2): habilita o pós-processamento em nós (SSGI, TRAA, motion blur)
const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
stage.appendChild(renderer.domElement);
const MAX_ANISO = 8;

const scene = new THREE.Scene();
const BG = C(0xdfe2e3);
scene.background = BG;
scene.fog = new THREE.Fog(BG, SORTER_MODE ? 320 : 170, SORTER_MODE ? 900 : 420);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, SORTER_MODE ? 1400 : 700);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = PI * 0.495; controls.minDistance = 1.5; controls.maxDistance = SORTER_MODE ? 520 : 260;

const hemi = new THREE.HemisphereLight(C(0xf2f5f8), C(0x8d8a84), 0.45 * PI);
scene.add(hemi);
const sun = new THREE.DirectionalLight(C(0xfff1de), 1.75 * PI);
sun.castShadow = true; sun.shadow.autoUpdate = false;   // sombras recalculadas a ~15 Hz (cena majoritariamente estática)
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.5; sun.shadow.blurSamples = 12;
scene.add(sun, sun.target);
const fillL = new THREE.DirectionalLight(C(0xdde7f4), 0.25 * PI);
fillL.position.set(40, 25, -30); scene.add(fillL);

/* ------------------------------------------------------------------ */
/* Texturas procedurais                                                */
/* ------------------------------------------------------------------ */
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
function speckle(g, w, h, n, colors, rMax = 1.4, aMax = .35) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = Math.random() * aMax; g.fillStyle = pick(colors);
    const r = Math.random() * rMax; g.fillRect(Math.random() * w, Math.random() * h, r + .4, r + .4);
  }
  g.globalAlpha = 1;
}
function blotches(g, w, h, n, dark, light, rr = [60, 220]) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rand(rr[0], rr[1]);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, Math.random() < .5 ? dark : light); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const TEX = {};
TEX.concrete = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#c9cbca'; g.fillRect(0, 0, w, h);
  blotches(g, w, h, 90, 'rgba(140,140,136,.05)', 'rgba(250,250,247,.06)');
  speckle(g, w, h, 30000, ['#9a9b97', '#eeeeea', '#b4b5b1'], 1.5, .3);
  for (let i = 0; i < 14; i++) {      // marcas de rodas e uso
    g.strokeStyle = `rgba(90,90,88,${rand(.03, .07)})`; g.lineWidth = rand(6, 18);
    g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rand(-80, 80), w * .7, y + rand(-80, 80), w, y + rand(-40, 40)); g.stroke();
  }
  g.strokeStyle = 'rgba(110,110,106,.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, h - 1); g.lineTo(w, h - 1); g.moveTo(w - 1, 0); g.lineTo(w - 1, h); g.stroke();
}, { repeat: [1, 1] });
TEX.kraft = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#c19463'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) { g.fillStyle = `rgba(90,60,25,${.04 + Math.random() * .04})`; g.fillRect(x, 0, 1.5, h); }
  speckle(g, w, h, 5000, ['#8c6a40', '#e3c08f', '#a77d4c'], 1.3, .4);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(80,50,20,.28)'); gr.addColorStop(.07, 'rgba(0,0,0,0)'); gr.addColorStop(.93, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(80,50,20,.28)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(60,40,15,.2)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  g.fillStyle = 'rgba(31,58,95,.75)'; g.font = 'bold 34px Arial'; g.textAlign = 'center';
  g.save(); g.translate(w / 2, h * .74); g.fillText('▲ ▲', 0, 0); g.font = 'bold 20px Arial'; g.fillText('ESTE LADO PARA CIMA', 0, 30); g.restore();
});
TEX.kraftN = canvasTex(256, 64, (g, w, h) => {      // relevo do papelão ondulado (mapa de normais)
  for (let x = 0; x < w; x++) { const v = Math.round(128 + 70 * Math.sin(x / 4 * PI)); g.fillStyle = `rgb(${v},128,255)`; g.fillRect(x, 0, 1, h); }
}, { srgb: false, repeat: [3, 1] });
TEX.concreteR = canvasTex(512, 512, (g, w, h) => {  // variação de brilho do concreto polido
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
  blotches(g, w, h, 60, 'rgba(60,60,60,.25)', 'rgba(200,200,200,.25)', [30, 140]);
  speckle(g, w, h, 8000, ['#555', '#bbb'], 1.4, .4);
}, { srgb: false });
TEX.wood = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#c6a06a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(110,75,35,${rand(.08, .22)})`; g.lineWidth = rand(.5, 1.6);
    g.beginPath(); const y = Math.random() * h; g.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * .05 + i) * 2); g.stroke();
  }
  speckle(g, w, h, 800, ['#7f5a2a', '#e2c38d'], 1.2, .4);
});
TEX.belt = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#25282b'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 6000, ['#3a3e41', '#17191a', '#2f3335'], 1.2, .5);
  for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x, 0, 1, h); }
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(w - 3, 0, 3, h);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(w - 5, 0, 2, h);
});
TEX.wire = canvasTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = '#c3c8cc'; g.lineWidth = 2.4;
  for (let i = 0; i <= 16; i++) { const p = i * w / 16; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  g.lineWidth = 7; g.strokeRect(2, 2, w - 4, h - 4);
});
function pkgTex(base, tape, band) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, ['#8c6a40', '#e3c08f', '#ffffff'], 1.2, .25);
    if (band) { g.fillStyle = band; g.fillRect(0, h * .08, w, h * .1); }
    g.fillStyle = tape; g.fillRect(w * .42, 0, w * .16, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(w * .42, 0, 3, h);
    g.fillStyle = '#f7f7f3'; g.fillRect(w * .08, h * .6, w * .3, h * .3);
    g.fillStyle = '#1b1d20';
    for (let i = 0; i < 20; i++) g.fillRect(w * .1 + i * 3.4, h * .76, i % 3 ? 1.5 : 2.6, h * .1);
    g.fillRect(w * .1, h * .63, w * .2, 3); g.fillRect(w * .1, h * .68, w * .13, 3);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(0,0,0,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
TEX.pkgKraft = pkgTex('#c6975f', 'rgba(214,190,140,.7)');
TEX.pkgKraft2 = pkgTex('#b98a55', 'rgba(232,100,27,.55)');
TEX.pkgWhite = pkgTex('#eceeef', 'rgba(200,205,210,.6)', 'rgba(31,58,95,.85)');
TEX.bag = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#dfe2e5'; g.fillRect(0, 0, w, h);
  blotches(g, w, h, 20, 'rgba(120,125,130,.18)', 'rgba(255,255,255,.4)', [20, 70]);
  g.fillStyle = '#ffffff'; g.fillRect(w * .3, h * .35, w * .4, h * .3);
  g.fillStyle = '#1b1d20'; for (let i = 0; i < 16; i++) g.fillRect(w * .33 + i * 5, h * .5, i % 3 ? 2 : 3.5, h * .1);
});
TEX.fill = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8e6d48'; g.fillRect(0, 0, w, h);
  const cols = ['#c99a62', '#d8b07a', '#eef0f1', '#c7ccd1', '#b78553', '#e7e9ea', '#b98a55'];
  for (let i = 0; i < 110; i++) {
    g.fillStyle = pick(cols); const pw = rand(26, 70), ph = rand(16, 44);
    const x = Math.random() * w - 10, y = Math.random() * h - 10; g.fillRect(x, y, pw, ph);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1; g.strokeRect(x, y, pw, ph);
  }
});
TEX.grid = canvasTex(1000, 1000, (g, w, h) => {      // 5 m × 5 m: linha a cada 1 m, mais forte a cada 5 m
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,130,140,.16)';
  for (let i = 1; i < 5; i++) { g.fillRect(i * 200 - 1.5, 0, 3, h); g.fillRect(0, i * 200 - 1.5, w, 3); }
  g.fillStyle = 'rgba(110,120,132,.3)';
  g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
});
TEX.hatch = canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(226,170,0,.6)'; g.lineWidth = 14;
  for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, h); g.lineTo(i * 64 + h, 0); g.stroke(); }
});
TEX.wall = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#e9ebec'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,.07)'); gr.addColorStop(.5, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.05)'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
  speckle(g, w, h, 1200, ['#c9cccf', '#ffffff'], 1, .25);
});
TEX.door = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#c9cdd2'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y + 2, w, 1); }
});
TEX.asphalt = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#5d6064'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 30000, ['#46494c', '#7a7d80', '#38393b'], 1.6, .5);
  blotches(g, w, h, 30, 'rgba(30,30,30,.15)', 'rgba(120,120,120,.1)', [30, 120]);
});
TEX.trailer = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#f2f3f4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f3a5f'; g.fillRect(0, h * .72, w, h * .14);
  g.fillStyle = '#e8641b'; g.fillRect(0, h * .86, w, h * .05);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 2, h); }
});

/* ------------------------------------------------------------------ */
/* Materiais                                                           */
/* ------------------------------------------------------------------ */
const std = (o) => {
  const m = new THREE.MeshStandardMaterial(o);
  if (o.color !== undefined && !(o.color instanceof THREE.Color)) m.color = C(o.color);
  if (o.emissive !== undefined && !(o.emissive instanceof THREE.Color)) m.emissive = C(o.emissive);
  if (o.envMapIntensity === undefined) m.envMapIntensity = .55;
  return m;
};
const PO = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
const MAT = {
  rackBlack: std({ color: 0x1d1f22, roughness: .45, metalness: .5 }),
  rackGray:  std({ color: 0x8d9398, roughness: .42, metalness: .55 }),
  rackDark:  std({ color: 0x4e555b, roughness: .5, metalness: .5 }),
  roller:    std({ color: 0xbfc4c8, roughness: .26, metalness: .9 }),
  rollerDark:std({ color: 0x55595d, roughness: .35, metalness: .8 }),
  alu:       std({ color: 0xb8bdc2, roughness: .3, metalness: .8 }),
  steelDark: std({ color: 0x40464c, roughness: .55, metalness: .5 }),
  navy:      std({ color: 0x1f3a5f, roughness: .5, metalness: .3 }),
  orange:    std({ color: 0xe8641b, roughness: .45, metalness: .25 }),
  wood:      std({ color: 0xffffff, map: TEX.wood, roughness: .85, envMapIntensity: .3 }),
  kraft:     std({ color: 0xffffff, map: TEX.kraft, normalMap: TEX.kraftN, normalScale: new THREE.Vector2(.45, .45), roughness: .9, envMapIntensity: .3 }),
  kraftIn:   std({ color: 0x9a7448, roughness: .95, envMapIntensity: .2 }),
  wire:      std({ color: 0xffffff, map: TEX.wire, roughness: .35, metalness: .75, alphaTest: .45, side: THREE.DoubleSide }),
  cageFrame: std({ color: 0xbfc5ca, roughness: .3, metalness: .85 }),
  cageBase:  std({ color: 0x1f3a5f, roughness: .55, metalness: .3 }),
  rubber:    std({ color: 0x1a1b1d, roughness: .9 }),
  mat:       std({ color: 0x26292c, roughness: .95, envMapIntensity: .2 }),
  yellow:    std({ color: 0xe6b000, roughness: .6, ...PO }),
  green:     std({ color: 0x2e8b57, roughness: .6, ...PO }),
  white:     std({ color: 0xf1f1ee, roughness: .6, ...PO }),
  orangeP:   std({ color: 0xe8641b, roughness: .6, ...PO }),
  navyP:     std({ color: 0x1f3a5f, roughness: .6, ...PO }),
  hatch:     std({ color: 0xffffff, map: TEX.hatch, transparent: true, depthWrite: false, roughness: .7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  estop:     std({ color: 0xf2c200, roughness: .5 }),
  red:       std({ color: 0xc8231c, roughness: .4 }),
  floor:     std({ color: 0xc9cdd0, map: TEX.concrete, roughnessMap: TEX.concreteR, roughness: .75, metalness: .0, envMapIntensity: .55 }),
  plinth:    std({ color: 0xeceeee, roughness: .9 }),
  table:     std({ color: 0xc9cdce, roughness: 1, envMapIntensity: .2 }),
  wallP:     std({ color: 0xffffff, map: TEX.wall, roughness: .7, metalness: .1 }),
  cut:       std({ color: 0x2a3038, roughness: .9 }),
  door:      std({ color: 0xffffff, map: TEX.door, roughness: .5, metalness: .4 }),
  doorDark:  std({ color: 0x15181c, roughness: .9 }),
  asphalt:   std({ color: 0xffffff, map: TEX.asphalt, roughness: .95, envMapIntensity: .15 }),
  trailer:   std({ color: 0xffffff, map: TEX.trailer, roughness: .45, metalness: .2 }),
  cab:       std({ color: 0xf4f5f6, roughness: .35, metalness: .4 }),
  glass:     std({ color: 0x24303c, roughness: .1, metalness: .6 }),
  tire:      std({ color: 0x151617, roughness: .85 }),
  lamp:      new THREE.MeshBasicMaterial({ color: C(0xfffbf0) }),
  lampBody:  std({ color: 0x9aa1a7, roughness: .4, metalness: .7 }),
  rackBlue:  std({ color: 0x1f3a5f, roughness: .5, metalness: .4 }),
  rackOrange:std({ color: 0xe8641b, roughness: .45, metalness: .35 }),
  dim:       std({ color: 0x232a33, roughness: .8 }),
  pkgKraft:  std({ color: 0xffffff, map: TEX.pkgKraft, roughness: .85, envMapIntensity: .3 }),
  pkgKraft2: std({ color: 0xffffff, map: TEX.pkgKraft2, roughness: .85, envMapIntensity: .3 }),
  pkgWhite:  std({ color: 0xffffff, map: TEX.pkgWhite, roughness: .7, envMapIntensity: .35 }),
  bag:       std({ color: 0xffffff, map: TEX.bag, roughness: .45, envMapIntensity: .5 }),
  bagDark:   std({ color: 0x5d6670, roughness: .45, envMapIntensity: .5 }),
  fill:      std({ color: 0xffffff, map: TEX.fill, roughness: .9, envMapIntensity: .25 }),
  hit:       new THREE.MeshBasicMaterial({ visible: false }),
  greenDark: std({ color: 0x0b4d22, roughness: .7 }),
  film:      new THREE.MeshStandardMaterial({ color: 0xf4f8fa, transparent: true, opacity: .16, roughness: .06, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
  filmRoll:  new THREE.MeshStandardMaterial({ color: 0xdfe9ee, transparent: true, opacity: .8, roughness: .2, envMapIntensity: 1 }),
  robotLed:  new THREE.MeshStandardMaterial({ color: 0x1d6fd8, emissive: 0x1d6fd8, emissiveIntensity: .8 }),
  robotLedOn: new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 1.2 }),
  robotLedDone: new THREE.MeshStandardMaterial({ color: 0x2e9a5c, emissive: 0x2e9a5c, emissiveIntensity: 1.1 }),
  truss:     std({ color: 0xa9afb4, roughness: .45, metalness: .6 }),
  column:    std({ color: 0x1f3a5f, roughness: .5, metalness: .3 }),
  glassBand: std({ color: 0x9fb3c6, roughness: .15, metalness: .5, transparent: true, opacity: .55 }),
};
// filme stretch transparente: no buffer de cor difusa escreve o tom do papelão que está por baixo
// (senão o SSGI trata o filme como superfície branca e sólida e a scuttle fica branca)
MAT.film.mrtNode = TSL.mrt({ diffuseColor: TSL.vec4(TSL.color(0xc19463), 1) });
const NO_CAST = new Set(['wire', 'yellow', 'green', 'greenDark', 'white', 'orangeP', 'navyP', 'hatch', 'floor', 'mat', 'lamp', 'lampBody', 'truss', 'asphalt', 'glassBand']);
const ROOF_KEYS = new Set(['truss', 'lamp', 'lampBody']);   // cobertura: some quando a câmera passa do telhado
