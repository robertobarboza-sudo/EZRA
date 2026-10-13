const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
  pg.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  const t0 = Date.now();
  await pg.goto(process.env.URL || 'http://localhost:8801/test.html?lite');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 400000 });
  console.log('pronto em', Date.now() - t0, 'ms');
  await pg.evaluate(() => window.__maquete.setQuality('leve'));
  const st = await pg.evaluate(n => { const m = window.__maquete; for (let i = 0; i < n; i++) m.update(1 / 10); return window.__sr && window.__sr(); }, +(process.env.N || 600));
  console.log(JSON.stringify(st));
  for (const v of (process.argv[2] || '').split(',').filter(Boolean)) {
    await pg.evaluate(v => window.__maquete.goView(v, true), v); await pg.waitForTimeout(1500);
    await pg.screenshot({ path: 'u_' + v + '.png', timeout: 900000 }); console.log('captura', v);
  }
  console.log(errs.filter(e => !/GL Driver|WebGPU/.test(e)).slice(0, 10).join('\n'));
  await b.close();
})();
