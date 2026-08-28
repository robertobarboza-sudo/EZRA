/**
 * Lista as abas (título + gid) de uma planilha, e por aba: colunas +
 * amostra de linhas. Nasceu como ferramenta temporária de onboarding, mas
 * hoje também alimenta o Grafo de Dados (Mapa de Dados > Grafo de Dados)
 * — o `?id=...&gid=...` (sem outros parâmetros) é usado ao vivo pra
 * mostrar colunas + 1 linha de amostra ao clicar num nó. Restrito a IDs
 * conhecidos (nunca aceita spreadsheetId arbitrário via query, pra não
 * virar um scanner de qualquer planilha da Service Account).
 */
const { listTabs, fetchTabByGid, fetchTabRawValues, fetchTabFormatting, renameTab, deleteTab } = require('./_google');

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
    // Rename de aba sob demanda (reorganização de nomes da planilha, pedido
    // do Roberto em 2026-08-17) — POST só, pra não disparar num GET
    // acidental. Uma aba de cada vez, ?gid=X&rename=NOVO_NOME.
    if (req.query.gid !== undefined && req.query.rename !== undefined) {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, erro: 'Use POST' });
        return;
      }
      const resultado = await renameTab(id, req.query.gid, req.query.rename);
      res.status(200).json({ ok: true, resultado });
      return;
    }
    // Exclusão de aba sob demanda (limpeza de aba órfã depois de uma
    // consolidação, pedido do Roberto em 2026-08-28) — POST só, uma aba de
    // cada vez, exige repetir o gid em ?confirmGid= igual ao ?gid= pra
    // reduzir chance de excluir a aba errada por engano.
    if (req.query.gid !== undefined && req.query.delete !== undefined) {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, erro: 'Use POST' });
        return;
      }
      if (req.query.confirmGid !== req.query.gid) {
        res.status(400).json({ ok: false, erro: 'confirmGid precisa repetir o mesmo valor de gid' });
        return;
      }
      const resultado = await deleteTab(id, req.query.gid);
      res.status(200).json({ ok: true, resultado });
      return;
    }
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
    if (req.query.gid !== undefined && req.query.format !== undefined) {
      const { title, rows } = await fetchTabFormatting(id, req.query.gid);
      res.status(200).json({ ok: true, title, rows: rows.slice(0, 30) });
      return;
    }
    if (req.query.gid !== undefined && req.query.raw !== undefined) {
      const { title, values } = await fetchTabRawValues(id, req.query.gid);
      const from = Math.max(0, parseInt(req.query.rawFrom, 10) || 0);
      const count = Math.min(5000, Math.max(1, parseInt(req.query.rawCount, 10) || 15));
      res.status(200).json({ ok: true, title, totalRows: values.length, sample: values.slice(from, from + count) });
      return;
    }
    // freshCol=coluna -> maior timestamp válido encontrado na coluna, entre
    // todas as linhas (não só a amostra) — usado pelo Grafo de Dados
    // (Mapa de Dados) pra saber quando cada aba recebeu dado pela última
    // vez. A coluna tem que ser um timestamp real ("YYYY-MM-DD HH:MM:SS"
    // ou "YYYY-MM-DD"); linhas em branco/ilegíveis são ignoradas.
    if (req.query.gid !== undefined && req.query.freshCol !== undefined) {
      const { rows } = await fetchTabByGid(id, req.query.gid);
      const col = req.query.freshCol;
      let maxDate = null, maxValue = null;
      rows.forEach(r => {
        const raw = r[col];
        if (!raw) return;
        const d = new Date(String(raw).replace(' ', 'T'));
        if (!isNaN(d) && (!maxDate || d > maxDate)) { maxDate = d; maxValue = raw; }
      });
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      res.status(200).json({ ok: true, totalRows: rows.length, column: col, maxValue, maxIso: maxDate ? maxDate.toISOString() : null });
      return;
    }
    // Varredura da aba inteira procurando "vírgula-como-milhar" numa coluna
    // (padrão "123,456" — vírgula seguida de exatamente 3 dígitos, o
    // clássico separador de milhar em inglês que o parser pt-BR do PULSO lê
    // errado como decimal). Regex fixa no servidor (não aceita padrão livre
    // via query, pra não virar vetor de ReDoS) — usado pra levantar a lista
    // completa de células suspeitas da árvore_pulso, pedido do Roberto em
    // 2026-08-18.
    if (req.query.gid !== undefined && req.query.virgulaMilhar !== undefined) {
      const col = req.query.col || 'valor';
      const { rows } = await fetchTabByGid(id, req.query.gid);
      const PADRAO = /^-?\d{1,3},\d{3}$/;
      const suspeitas = rows.filter(r => PADRAO.test(String(r[col] || '').trim()));
      res.status(200).json({ ok: true, coluna: col, totalRows: rows.length, suspeitas: suspeitas.length, sample: suspeitas });
      return;
    }
    // filterCol=coluna&filterVal=valor -> até 30 linhas (objeto, ou mais via
    // filterLimit até 200) que batem, pra investigar padrões sem baixar a
    // aba inteira.
    if (req.query.gid !== undefined && req.query.filterCol !== undefined) {
      const { rows } = await fetchTabByGid(id, req.query.gid);
      const col = req.query.filterCol, val = req.query.filterVal;
      const limit = Math.min(200, Math.max(1, parseInt(req.query.filterLimit, 10) || 30));
      const filtradas = rows.filter(r => String(r[col] ?? '') === String(val ?? ''));
      res.status(200).json({ ok: true, column: col, value: val, matchCount: filtradas.length, sample: filtradas.slice(0, limit) });
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
