/**
 * Backend.gs
 * Funções públicas chamáveis do cliente via google.script.run.
 * Cada função pública é fina: valida entrada, delega para uma função privada
 * (sufixo "_") e devolve sempre o mesmo formato { ok, data } / { ok:false, error }.
 *
 * IMPORTANTE — qualquer função SEM "_" no nome, neste projeto inteiro,
 * é chamável publicamente pelo navegador do usuário logado no Web App.
 * Nunca coloque segredos, chaves de API ou lógica sensível fora de funções "_".
 */

/** Cache de 5 minutos para evitar reprocessar a mesma consulta repetidamente. */
var CACHE_TTL_SECONDS = 300;

/**
 * getServerInfo — exemplo mínimo de chamada google.script.run (sem parâmetros).
 * Ver uso em JS.html: callGAS('getServerInfo')
 */
function getServerInfo() {
  return safeExec_(function () {
    return {
      version: '1.0.0',
      serverTime: new Date().toISOString(),
      user: Session.getActiveUser().getEmail() || 'anônimo'
    };
  });
}

/**
 * getSprData — exemplo de chamada COM parâmetros vindos do cliente.
 * @param {{canal?:string, turno?:string, dias?:number}} filters
 *
 * Uso em JS.html:
 *   callGAS('getSprData', { canal: 'XPT', turno: 'T1', dias: 35 })
 *     .then(rows => ...)
 *     .catch(err => ...)
 */
function getSprData(filters) {
  return safeExec_(function () {
    filters = filters || {};
    var dias = clamp_(filters.dias || 35, 1, 90);
    var cacheKey = 'spr_' + (filters.canal || 'all') + '_' + (filters.turno || 'all') + '_' + dias;

    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var rows = getSprData_(filters.canal, filters.turno, dias);
    cache.put(cacheKey, JSON.stringify(rows), CACHE_TTL_SECONDS);
    return rows;
  });
}

/**
 * getSprData_ (privada) — hoje devolve dados de exemplo; troque pelo conector real
 * (BigQuery, Sheets etc.) mantendo a mesma assinatura de retorno.
 *
 * Para plugar a query real (brbi_opslgc.da_log_linehaul_trip_base_v3):
 *  1) Extensões > Serviços do Apps Script > ative "BigQuery API".
 *  2) Ative a BigQuery API também no Google Cloud Project vinculado.
 *  3) Substitua o corpo abaixo por algo como:
 *       var request = { query: SQL_STRING, useLegacySql: false };
 *       var queryResults = BigQuery.Jobs.query(request, PROJECT_ID);
 *       return parseBigQueryRows_(queryResults);
 */
function getSprData_(canal, turno, dias) {
  var rows = MOCK_SPR_ROWS_;
  if (canal) rows = rows.filter(function (r) { return r.canal === canal; });
  if (turno) rows = rows.filter(function (r) { return r.turno_cpt === turno; });
  return rows;
}

/**
 * saveOccurrence — exemplo de escrita (POST-like). Valida payload antes de gravar.
 * Uso em JS.html:
 *   callGAS('saveOccurrence', { desc:'...', resp:'...', prazo:'...' })
 */
function saveOccurrence(payload) {
  return safeExec_(function () {
    requireFields_(payload, ['desc', 'resp', 'prazo']);
    // Nesta demo apenas devolve um ID gerado. Em produção, grave em Sheets/BigQuery aqui.
    return {
      id: '#OC-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      desc: payload.desc,
      resp: payload.resp,
      prazo: payload.prazo,
      createdAt: new Date().toISOString()
    };
  });
}

/** Amostra estática usada por getSprData_ até a fonte real ser plugada. */
var MOCK_SPR_ROWS_ = [
  { trip_number: 'LT100001BR01', sta_origin_date: '2026-07-08', turno_cpt: 'T1', hora_cpt: 6,  canal: 'SOC', status_cpt: 'ON TIME', sum_orders: 640 },
  { trip_number: 'LT100002BR02', sta_origin_date: '2026-07-08', turno_cpt: 'T2', hora_cpt: 15, canal: 'HUB', status_cpt: 'DELAY',   sum_orders: 480 },
  { trip_number: 'LT100003BR03', sta_origin_date: '2026-07-08', turno_cpt: 'T3', hora_cpt: 23, canal: 'XPT', status_cpt: 'EARLY',   sum_orders: 310 }
];
