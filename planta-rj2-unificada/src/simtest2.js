const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n').slice(1,3).join(' ')));
  await pg.goto('http://localhost:8765/test.html');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 200000 });
  await pg.evaluate(() => { const m = window.__maquete; m.setQuality('leve'); });
  for (let block = 0; block < 4; block++) {
    const r = await pg.evaluate(() => {
      const m = window.__maquete, S = m.S, PL = m.PLANT;
      const i0 = S.induced, t0 = S.t;
      for (let i = 0; i < 300 * 10; i++) m.update(1 / 10);
      return { t: Math.round(S.t), rate: Math.round((S.induced - i0) / (S.t - t0) * 3600), keptPct: (100 * S.kept / (S.kept + S.picked)).toFixed(1), swaps: S.swaps, cage: S.cageSwaps, shipped: S.shipped,
        rec: PL.received, ret: PL.returned, asm: PL.assembled, scS: PL.scSupplied, cgS: PL.cgSupplied, avF: PL.avFetched, avT: PL.avTreated,
        stuck: S.workers.filter(w => w.task && w.task.stuck).length };
    });
    console.log(JSON.stringify(r));
  }
  console.log(errs.slice(0, 6).join('\n'));
  await b.close();
})();
