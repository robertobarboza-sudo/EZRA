/**
 * Lista as abas (título + gid) de uma planilha, e por aba: colunas +
 * amostra de linhas. Nasceu como ferramenta temporária de onboarding, mas
 * hoje também alimenta o Grafo de Dados (Mapa de Dados > Grafo de Dados)
 * — o `?id=...&gid=...` (sem outros parâmetros) é usado ao vivo pra
 * mostrar colunas + 1 linha de amostra ao clicar num nó. Restrito a IDs
 * conhecidos (nunca aceita spreadsheetId arbitrário via query, pra não
 * virar um scanner de qualquer planilha da Service Account).
 */
const { listTabs, fetchTabByGid, fetchTabRawValues } = require('./_google');

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
    if (req.query.gid !== undefined && req.query.uniq !== undefined) {
      const { rows } = await fetchTabByGid(id, req.query.gid);
      const col = req.query.uniq;
      const counts = {};
      rows.forEach(r => { const v = r[col] ?? ''; counts[v] = (counts[v]||0) + 1; });
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      res.status(200).json({ ok: true, column: col, distinctCount: sorted.length, values: sorted });
      return;
    }
    if (req.query.gid !== undefined && req.query.size !== undefined) {
      const { title, rows } = await fetchTabByGid(id, req.query.gid);
      const json = JSON.stringify(rows);
      res.status(200).json({
        ok: true, title, totalRows: rows.length,
        jsonBytes: Buffer.byteLength(json),
        jsonBytesGzipEstimate: require('zlib').gzipSync(json).length,
      });
      return;
    }
    if (req.query.gid !== undefined && req.query.raw !== undefined) {
      const { title, values } = await fetchTabRawValues(id, req.query.gid);
      res.status(200).json({ ok: true, title, totalRows: values.length, sample: values.slice(0, 15) });
      return;
    }
    // filterCol=coluna&filterVal=valor -> até 30 linhas (objeto) que batem, pra
    // investigar padrões sem baixar a aba inteira.
    if (req.query.gid !== undefined && req.query.filterCol !== undefined) {
      const { rows } = await fetchTabByGid(id, req.query.gid);
      const col = req.query.filterCol, val = req.query.filterVal;
      const filtradas = rows.filter(r => String(r[col] ?? '') === String(val ?? ''));
      res.status(200).json({ ok: true, column: col, value: val, matchCount: filtradas.length, sample: filtradas.slice(0, 30) });
      return;
    }
    if (req.query.gid !== undefined) {
      const { title, rows } = await fetchTabByGid(id, req.query.gid);
      res.status(200).json({
        ok: true,
        title,
        totalRows: rows.length,
        columns: rows[0] ? Object.keys(rows[0]) : [],
        sample: rows.slice(0, 5),
      });
      return;
    }
    const sheets = await listTabs(id);
    res.status(200).json({ ok: true, sheets });
  } catch (err) {
    res.status(502).json({ ok: false, erro: err.message });
  }
};
