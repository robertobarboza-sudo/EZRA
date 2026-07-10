function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
