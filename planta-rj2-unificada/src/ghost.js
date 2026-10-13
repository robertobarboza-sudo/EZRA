const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
  await pg.goto('http://localhost:8801/test.html?lite');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 400000 });
  console.log(JSON.stringify(await pg.evaluate(() => {
    const S = window.__srDbg(); const all = [...S.inds.map(i => i.w), ...S.ops.map(o => o.w), ...S.teles.map(t => t.w), ...S.fingers.map(f => f.w)];
    return { total: all.length, semMH: all.filter(w => !w.mh).length, carts: window.__maquete.scene.getObjectByName('carrinhos')?.children.length,
      cartsParent: window.__maquete.scene.getObjectByName('carrinhos')?.parent?.name };
  })));
  await b.close();
})();
