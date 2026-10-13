const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
  await pg.goto('http://localhost:8801/test.html?lite');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 400000 });
  await pg.addStyleTag({ content: '.sheet,.panel,.hint,#panel{display:none!important}' });
  await pg.evaluate(() => { const m = window.__maquete; m.setQuality('leve'); const it = window.__srDbg().inds[5]; const c = it.b; m.controls.target.set(c.x, c.y, c.z); m.camera.position.set(c.x + 3.2 * 0 - (-1.5), c.y + 1.1, c.z + 3.2); m.controls.update(); });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: 'z_g.png', timeout: 600000 });
  const r = await pg.evaluate(() => [window.__srPick(395/900, 150/560), window.__srPick(400/900, 200/560), window.__srPick(380/900, 110/560)]); console.log(JSON.stringify(r)); const r0 = await pg.evaluate(() => {
    const m = window.__maquete, T = m.camera.constructor; const ray = new (Object.getPrototypeOf(m.scene).constructor === Object ? Object : window.__THREE_RAY || Object)();
    return null;
  });
  await b.close();
})();
