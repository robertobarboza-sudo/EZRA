/**
 * TEMPORÁRIO — lista as abas (título + gid) de uma planilha nova, pra
 * descobrir a estrutura real antes de configurar o CONFIG de /api/dados.
 * Restrito a IDs conhecidos (nunca aceita spreadsheetId arbitrário via
 * query, pra não virar um scanner de qualquer planilha da Service Account).
 * Remover depois do onboarding.
 */
const { listTabs } = require('./_google');

const PERMITIDAS = new Set([
  '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4',
]);

module.exports = async (req, res) => {
  const id = req.query.id;
  if (!id || !PERMITIDAS.has(id)) {
    res.status(400).json({ ok: false, erro: 'spreadsheetId não permitido' });
    return;
  }
  try {
    const sheets = await listTabs(id);
    res.status(200).json({ ok: true, sheets });
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
  }
};
