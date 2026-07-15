/**
 * PULSO — API de dados via Google Sheets
 *
 * Web App que publica as abas liberadas da planilha como JSON.
 * Implantação: Executar como "Eu" · Acesso: "Qualquer pessoa"
 *
 * Uso: GET <url-do-webapp>?tabs=backlog
 * Resposta: { ok, atualizadoEm, dados: { backlog: [ {coluna: valor, ...}, ... ] } }
 *
 * Contrato da aba "backlog" (1ª linha = cabeçalho, sem distinção de maiúsculas):
 *   tipo   — received | packed | eha
 *   perfil — p | m | g | bk
 *   total  — número (backlog atual)
 *   meta   — número
 *   h1..h24 — opcionais: série horária na ordem do gráfico (h1 = 06:00 ... h24 = 05:00)
 */

var ABAS_LIBERADAS = ['backlog'];

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pedidas = (e && e.parameter && e.parameter.tabs)
    ? String(e.parameter.tabs).split(',').map(function (t) { return t.trim(); })
    : ABAS_LIBERADAS;

  var dados = {};
  pedidas
    .filter(function (t) { return ABAS_LIBERADAS.indexOf(t) !== -1; })
    .forEach(function (nome) {
      var sh = ss.getSheetByName(nome);
      if (!sh) return;
      var linhas = sh.getDataRange().getValues();
      if (linhas.length < 2) { dados[nome] = []; return; }
      var cab = linhas.shift().map(function (h) { return String(h).trim().toLowerCase(); });
      dados[nome] = linhas
        .filter(function (l) { return l.some(function (c) { return c !== '' && c !== null; }); })
        .map(function (l) {
          var o = {};
          cab.forEach(function (h, i) { if (h) o[h] = l[i]; });
          return o;
        });
    });

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      atualizadoEm: new Date().toISOString(),
      dados: dados
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
