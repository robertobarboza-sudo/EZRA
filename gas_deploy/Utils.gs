/**
 * Utils.gs
 * Funções utilitárias internas: wrapper de erros, validação de parâmetros,
 * formato padrão de resposta para o front-end (google.script.run).
 *
 * Convenção: toda função terminada em "_" é PRIVADA — o Apps Script nunca expõe
 * funções com "_" no nome para chamadas externas via google.script.run.
 * Use isso para qualquer lógica sensível/interna (chaves, cálculo, parsing).
 */

/**
 * safeExec_ — envolve qualquer função de backend para padronizar sucesso/erro.
 * Uso:
 *   function getSprData(filters) {
 *     return safeExec_(function () { return getSprData_(filters); });
 *   }
 * @param {Function} fn - função sem argumentos (use closure para passar parâmetros)
 * @returns {{ok:boolean, data?:*, error?:string}}
 */
function safeExec_(fn) {
  try {
    var result = fn();
    return { ok: true, data: result };
  } catch (err) {
    // Log no editor do Apps Script (Execuções) — não vaza para o cliente.
    console.error('[safeExec_] ' + (err && err.stack ? err.stack : err));
    return { ok: false, error: err && err.message ? err.message : 'Erro desconhecido no servidor.' };
  }
}

/**
 * requireFields_ — validação simples de payloads vindos do cliente.
 * Lança erro (capturado por safeExec_) se algum campo obrigatório faltar.
 * @param {Object} obj
 * @param {string[]} fields
 */
function requireFields_(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Payload inválido: esperado um objeto.');
  }
  var missing = fields.filter(function (f) {
    return obj[f] === undefined || obj[f] === null || obj[f] === '';
  });
  if (missing.length) {
    throw new Error('Campos obrigatórios ausentes: ' + missing.join(', '));
  }
}

/**
 * clamp_ — sanitiza números vindos do front (ex.: paginação, limites de linhas).
 */
function clamp_(value, min, max) {
  var n = Number(value);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
