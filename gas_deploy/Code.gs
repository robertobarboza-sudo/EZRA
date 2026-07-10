/**
 * Code.gs
 * Ponto de entrada do Web App (JARVIS RJ2 Dashboard).
 * Responsável apenas por servir o HTML — nenhuma lógica de negócio aqui.
 */

/**
 * doGet — chamado automaticamente pelo Google quando alguém acessa a URL do Web App.
 * @param {Object} e - objeto de evento com query params (e.parameter.xxx), se houver.
 * @returns {HtmlOutput}
 */
function doGet(e) {
  try {
    // E-mail do usuário logado no Google (mesmo domínio do deploy).
    var activeEmail = '';
    try { activeEmail = Session.getActiveUser().getEmail() || ''; } catch (e) {}
    if (!activeEmail) {
      try { activeEmail = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
    }

    // Sem template do Apps Script (evaluate()/scriptlets): em testes, o <script>
    // de uma página grande servida via template perdia a permissão de execução
    // no sandbox do Google. Substituição de texto simples evita esse problema.
    var html = HtmlService.createHtmlOutputFromFile('Index').getContent();
    html = html.replace('__CURRENT_USER_EMAIL_PLACEHOLDER__', JSON.stringify(activeEmail));

    return HtmlService.createHtmlOutput(html)
      .setTitle('J.A.R.V.I.S. — COP RJ2 2026')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      // IFRAME é o único modo suportado atualmente pelo HtmlService para Web Apps
      // e é o que permite carregar CDNs externos (Chart.js, Font Awesome, Google Fonts)
      // dentro do iframe sandboxed do Apps Script.
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    // Se o próprio doGet falhar, devolve uma página de erro simples em vez de um 500 cru.
    return HtmlService.createHtmlOutput(
      '<h3>Erro ao carregar o dashboard</h3><p>' + escapeHtml_(err.message) + '</p>'
    );
  }
}

/**
 * escapeHtml_ — util interna (sufixo "_" = função privada, não aparece para o cliente
 * nem pode ser chamada via google.script.run). Evita injeção ao mostrar mensagens de erro.
 */
function escapeHtml_(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
