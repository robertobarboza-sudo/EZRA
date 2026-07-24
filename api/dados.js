/**
 * PULSO — proxy de dados: Google Sheets (Service Account) → front-end.
 *
 * O front chama /api/dados?tabs=clusterizacao. Esta function autentica como
 * a Service Account (GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY, nunca
 * expostas ao navegador) e lê a aba correspondente via Sheets API v4.
 */
const { fetchTabByGid } = require('./_google');

// section (usado pelo front) → planilha + gid da aba
const CONFIG = {
  clusterizacao: {
    spreadsheetId: '1sn2V55qslwcjrbnCklVzxjoPrerO_Ba7XAfRKQ-XV_0',
    gid: '1819579584', // aba "Outbound Ontime"
  },
};

module.exports = async (req, res) => {
  const pedidas = typeof req.query.tabs === 'string'
    ? req.query.tabs.split(',').map(t => t.trim()).filter(Boolean)
    : Object.keys(CONFIG);

  const dados = {};
  const erros = {};

  await Promise.all(pedidas.map(async (secao) => {
    const cfg = CONFIG[secao];
    if (!cfg) return;
    try {
      const { rows } = await fetchTabByGid(cfg.spreadsheetId, cfg.gid);
      dados[secao] = rows;
    } catch (err) {
      erros[secao] = err.message;
    }
  }));

  const errKeys = Object.keys(erros);
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1500');
  res.status(200).json({
    ok: errKeys.length === 0,
    atualizadoEm: new Date().toISOString(),
    dados,
    ...(errKeys.length ? { erro: erros[errKeys[0]], erros } : {}),
  });
};
