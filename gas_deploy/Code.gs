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

    // Gate de acesso feito no servidor: qualquer conta @shopee.com entra.
    // Não depende do JS do cliente para decidir quem acessa.
    var domainOk = /@shopee\.com$/i.test(activeEmail);
    if (!domainOk) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:Inter,Arial,sans-serif;background:#1a1d2e;color:#e8eaf0;' +
        'min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px">' +
        '<div style="max-width:420px">' +
        '<h2 style="margin-bottom:12px">Acesso restrito</h2>' +
        '<p style="color:#9497b0;font-size:13px;line-height:1.6">' +
        'Este sistema é restrito a contas @shopee.com.<br><br>' +
        (activeEmail ? 'Conta identificada: ' + escapeHtml_(activeEmail) + '<br><br>' : '') +
        'Procure o desenvolvedor para cadastrar ou ajustar acesso<br>' +
        'SeaTalk: roberto.barboza@shopee.com</p></div></div>'
      ).setTitle('Acesso restrito — J.A.R.V.I.S.');
    }

    var template = HtmlService.createTemplateFromFile('Index');

    // Exemplo de dado passado do servidor para o template no carregamento inicial.
    // Fica disponível em Index.html como: <?= appVersion ?>
    template.appVersion = '1.0.0';
    template.deployedAt = new Date().toISOString();
    template.currentUserEmail = activeEmail;

    return template.evaluate()
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
 * include — usada dentro dos templates HTML para injetar outros arquivos .html.
 * Uso em Index.html:  <?!= include('CSS'); ?>   <?!= include('JS'); ?>
 * O "!" (vs "=") é obrigatório: ele diz ao HtmlService para NÃO escapar o conteúdo,
 * já que estamos inserindo HTML/CSS/JS puro, não texto.
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
