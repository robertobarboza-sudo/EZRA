/**
 * PULSO — proxy de dados: planilha (Apps Script) → front-end.
 *
 * O front chama /api/dados?tabs=backlog. Esta function repassa a chamada
 * ao Web App do Apps Script (URL guardada na env var GAS_URL, nunca exposta
 * ao navegador) e devolve o JSON com cache de CDN de 5 minutos.
 */
module.exports = async (req, res) => {
  const base = process.env.GAS_URL;
  if (!base) {
    res.status(503).json({ ok: false, erro: 'GAS_URL não configurada no projeto Vercel' });
    return;
  }

  const tabs = typeof req.query.tabs === 'string' ? req.query.tabs : '';
  const url = base + (tabs ? '?tabs=' + encodeURIComponent(tabs) : '');

  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
    res.status(200).json(body);
  } catch (err) {
    res.status(502).json({ ok: false, erro: 'Falha ao consultar a planilha: ' + err.message });
  }
};
