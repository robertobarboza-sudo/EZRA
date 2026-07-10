function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body>' +
    '<div id="badge" style="font-family:sans-serif;font-size:24px;padding:20px;background:#ef4444;color:#fff">JS: NAO CARREGADO</div>' +
    '<script>document.getElementById("badge").textContent="JS: OK"; document.getElementById("badge").style.background="#10b981";<\/script>' +
    '</body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
