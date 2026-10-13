const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  if (process.env.RP) await pg.addInitScript(o => { window.__rp = o; }, JSON.parse(process.env.RP));
  await pg.goto((process.env.URL || 'http://localhost:8765/test.html'));
  const t0 = Date.now();
  try { await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 150000 }); }
  catch (e) { console.log('TIMEOUT'); console.log(errs.slice(0, 12).join('\n')); await pg.screenshot({ path: 's_fail.png' }); process.exit(1); }
  console.log('ready in', Date.now() - t0, 'ms');
  const q = process.argv[3] || 'alta';
  await pg.evaluate(q => window.__maquete.setQuality(q), q);
  const hide = process.argv[4] === 'hud' ? '' : '.sheet,.panel,.hint{display:none!important}';
  if (hide) await pg.addStyleTag({ content: hide });
  for (const v of (process.argv[2] || 'aerea').split(',')) {
    await pg.evaluate(v => window.__maquete.goView(v, true), v);
    await pg.waitForTimeout(+(process.env.WAIT || 2500));
    await pg.screenshot({ path: (process.env.PFX || 's_') + v + '.png', timeout: 900000 });
  }
  console.log(JSON.stringify(await pg.evaluate(() => { const m = window.__maquete, S = m.S; return { t: S.t|0, induced: S.induced, picked: S.picked, sep: S.sep, kept: S.kept, swaps: S.swaps, cage: S.cageSwaps, shipped: S.shipped, workers: S.workers.length, calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles }; })));
  console.log(errs.slice(0, 12).join('\n'));
  await b.close();
})();
