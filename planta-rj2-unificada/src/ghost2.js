const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
  await pg.goto('http://localhost:8801/test.html?lite');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 400000 });
  await pg.evaluate(() => { const m = window.__maquete, it = window.__srDbg().inds[5]; const c = it.b; m.controls.target.set(c.x, c.y, c.z); m.camera.position.set(c.x + 3, c.y + 1.1, c.z + 1.5); m.controls.update(); });
  await pg.waitForTimeout(1500);
  console.log(JSON.stringify(await pg.evaluate(() => {
    const m = window.__maquete, cam = m.camera.position, res = [];
    m.scene.traverseVisible(o => {
      if (!o.isMesh) return; const p = new m.camera.position.constructor(); o.getWorldPosition(p);
      if (p.distanceTo(cam) < 9 && (o.isSkinnedMesh || /human|pessoa/i.test(o.name + (o.material && o.material.name)))) res.push([o.type, o.name, o.material && o.material.name, o.material && o.material.color && o.material.color.getHexString(), +p.distanceTo(cam).toFixed(1)]);
    });
    return res.slice(0, 30);
  })));
  await b.close();
})();
