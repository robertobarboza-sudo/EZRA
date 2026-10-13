const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await pg.goto('http://localhost:8765/test.html');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 150000 });
  const mins = +(process.argv[2] || 20);
  console.log(await pg.evaluate(mins => {
    const M = window.__maquete, A = M.S, PL = M.PLANT, LN = M.LINES;
    const snap = () => ({ t: A.t, ind: A.induced, kept: A.kept, picked: A.picked, ship: PL.shipped, rec: PL.received, ret: PL.returned, cg: PL.cgSupplied, sc: PL.scSupplied, wr: PL.assembled, sw: A.swaps, avF: PL.avFetched, avT: PL.avTreated, av: A.avarias });
    const a = snap(); const rep = [];
    let waitInd = 0, n = 0, sepWait = 0;
    for (let i = 0; i < mins * 60 * 20; i++) {
      M.update(.05);
      if (i % 20 === 0) { n++; for (const ln of LN) { waitInd += ln.S.inductors.filter(w => w.state === 'aguardando gaiola').length; sepWait += ln.S.islands.reduce((q, isl) => q + isl.seps.filter(w => w.state === 'aguardando scuttle').length, 0); } }
      if (i % (5 * 60 * 20) === 0 && i) {
        rep.push(LN.map(ln => `${ln.S.short}: cheiasInd ${ln.S.cageFull.filter(f => f.cage).length} vaziasInd ${ln.S.cageEmpty.filter(f => f.cage).length} scVaz ${[...ln.S.emptyBuf[1], ...ln.S.emptyBuf[-1]].filter(k => k.sc).length} scCheias ${ln.S.fullBuf.filter(k => k.sc).length}`).join(' | ') +
          ` || planta cheias ${PL.pFull.filter(x => x.cage).length} vazias ${PL.pEmpty.filter(x => x.cage).length} bufferSc ${PL.stock.filter(x => x.sc).length} montagem ${PL.st.map(s => s.state[0]).join('')} saida ${PL.outS.filter(x => x.sc).length} avLinhas ${LN.map(l => l.S.avSlot.cage ? l.S.avSlot.cage.fill : '-').join('/')} avArea ${PL.avArea.map(a => a.cage ? a.cage.fill : '-').join('/')}`);
      }
    }
    const z = snap(), h = (z.t - a.t) / 3600, r = k => Math.round((z[k] - a[k]) / h);
    const nInd = LN.reduce((q, l) => q + l.S.inductors.length, 0), nSep = LN.reduce((q, l) => q + l.S.islands.length, 0);
    return JSON.stringify({ pctH_total: r('ind'), gol: ((z.kept - a.kept) / ((z.kept - a.kept) + (z.picked - a.picked)) * 100).toFixed(1), trocasScuttle_h: r('sw'), recebidas_h: r('rec'), devolvidas_h: r('ret'), abastGaiolas_h: r('cg'), abastScuttles_h: r('sc'), montadas_h: r('wr'), avariasSeparadas_h: r('av'), avariasBuscadas_h: r('avF'), avariasTratadas_h: r('avT'), expedidas_h: r('ship'),
      esperaInducao: (100 * waitInd / (n * nInd)).toFixed(1) + '%', sepAguardandoScuttle: (100 * sepWait / (n * nSep)).toFixed(1) + '%' }, null, 1) + '\n' + rep.join('\n');
  }, mins));
  console.log(errs.slice(0, 5).join('\n'));
  await b.close();
})();
