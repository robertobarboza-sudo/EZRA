const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
  await pg.goto(process.env.URL || 'http://localhost:8801/test.html?lite');
  await pg.waitForFunction(() => window.__maquete && document.getElementById('loading').hidden, null, { timeout: 400000 });
  await pg.addStyleTag({ content: '.sheet,.panel,.hint,#panel{display:none!important}' });
  await pg.evaluate(() => { const m = window.__maquete; m.setQuality('leve'); for (let i = 0; i < 300; i++) m.update(1 / 10); document.getElementById('play')?.click(); });
  const shots = await pg.evaluate(() => {
    const S = window.__srDbg(), out = [];
    const pl = S.plates.find(p => p.len > 4); if (pl) out.push(['esteira', pl.c.toArray(), pl.a.toArray()]);
    const tp = S.P.find(q => q.on && q.mode === 'tele'); if (tp) out.push(['tele', tp.pos.toArray(), tp.t.dir.toArray()]);
    const it = S.inds[5]; if (it) out.push(['mesa', it.w.home.toArray(), it.dir.toArray()]);
    const p = S.P.find(q => q.on && q.mode === 'cart'); if (p) out.push(['carrinho', p.pos.toArray(), [1, 0, 0]]);
    return out;
  });
  for (const [name, c, d] of shots) {
    await pg.evaluate(([c, d]) => { const m = window.__maquete; m.controls.target.set(c[0], c[1], c[2]); m.camera.position.set(c[0] - d[2] * 3.2 - d[0] * 1.5, c[1] + 1.1, c[2] + d[0] * 3.2 - d[2] * 1.5); m.controls.update(); }, [c, d]);
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: 'z_' + name + '.png', timeout: 600000 }); console.log(name, c.map(v => v.toFixed(2)).join(' '));
  }
  await b.close();
})();
