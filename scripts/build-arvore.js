/**
 * Gera arvore.html — a página DEDICADA da Árvore de KPI's.
 *
 * A Árvore saiu de dentro do JARVIS e virou página própria (pedido do Roberto
 * em 2026-08-13): a tabela precisa da largura inteira da tela, e dividir
 * espaço com o menu/header do portal atrapalhava. Dentro do JARVIS sobrou só
 * o item de menu, que aponta pra cá.
 *
 * Por que um script em vez de um arquivo escrito à mão: o tema (tokens,
 * cards, modal, multiselect, tabelas…) mora inline no <style> do index.html.
 * Copiar isso na mão significaria duas cópias divergindo a cada ajuste de
 * visual. Aqui o tema é sempre RE-EXTRAÍDO do index, e só o que é exclusivo
 * da Árvore fica em assets/arvore.{css,js}.
 *
 * Rodar depois de mexer no tema do index.html ou nos assets da Árvore:
 *   node scripts/build-arvore.js
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const idxHtml = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// Tema + componentes compartilhados: primeiro <style> do index.
const tema = (idxHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!tema) throw new Error('bloco <style> do index.html não encontrado');

// Helpers que o código da Árvore usa e que moram no index — extraídos daqui
// pra não manter duas versões.
function extrairFuncao(nome) {
  const marca = 'function ' + nome + '(';
  const i = idxHtml.indexOf(marca);
  if (i < 0) throw new Error('helper não encontrado no index.html: ' + nome);
  let j = idxHtml.indexOf('{', i);
  let nivel = 0;
  for (; j < idxHtml.length; j++) {
    if (idxHtml[j] === '{') nivel++;
    else if (idxHtml[j] === '}') { nivel--; if (nivel === 0) { j++; break; } }
  }
  return idxHtml.slice(i, j);
}
const helpers = ['pulsoEscHtml', 'buildKPIs'].map(extrairFuncao).join('\n\n');

const pagina = `<!DOCTYPE html>
<!-- GERADO por scripts/build-arvore.js — não editar à mão.
     Mexa em assets/arvore.css / assets/arvore.js (ou no tema do index.html)
     e rode: node scripts/build-arvore.js -->
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Árvore de KPI's — COP RJ2</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%23ee4d2d'/%3E%3Cpath d='M12 5v14M12 5c-2.5 0-4 1.6-4 3.5S9.5 12 12 12s4 1.6 4 3.5S14.5 19 12 19' stroke='white' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <!-- Tema do JARVIS, re-extraído do index.html na geração desta página -->
  <style>
${tema}
  </style>

  <!-- Só o que é exclusivo da Árvore -->
  <link rel="stylesheet" href="/assets/arvore.css"/>

  <style>
    /* ── Casca da página dedicada ─────────────────────────────── */
    body{ display:block; overflow:auto; }
    .arvp-shell{ display:flex; min-height:100vh; }
    .arvp-side{
      width:210px; flex:none; position:fixed; top:0; left:0; bottom:0; z-index:100;
      background:var(--surface); border-right:1px solid var(--border);
      backdrop-filter:blur(20px); display:flex; flex-direction:column; padding:14px 10px;
    }
    .arvp-back{
      display:flex; align-items:center; gap:9px; padding:9px 11px; border-radius:var(--radius);
      color:var(--text-sub); font-size:12.5px; font-weight:700; cursor:pointer;
      border:1px solid var(--border); background:var(--surface-2); margin-bottom:16px;
      transition:all var(--transition); text-decoration:none;
    }
    .arvp-back:hover{ border-color:var(--orange); color:var(--orange); }
    .arvp-brand{ display:flex; align-items:center; gap:10px; padding:0 6px 14px; border-bottom:1px solid var(--border); margin-bottom:12px; }
    .arvp-brand-mark{
      width:32px; height:32px; border-radius:var(--radius); flex:none;
      background:linear-gradient(135deg,#ff7a45,#ee4d2d); box-shadow:0 8px 22px rgba(238,77,45,.3);
      display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px;
    }
    .arvp-brand-txt b{ display:block; font-size:13px; font-weight:800; color:var(--text); line-height:1.2; }
    .arvp-brand-txt span{ font-size:10px; color:var(--text-muted); }
    .arvp-navlabel{ font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); padding:6px 8px 4px; }
    .arvp-navitem{
      display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:var(--radius);
      color:var(--text-sub); font-size:12.5px; font-weight:600; cursor:pointer; margin-bottom:2px;
      transition:background var(--transition), color var(--transition); position:relative;
    }
    .arvp-navitem:hover{ background:var(--surface-2); color:var(--text); }
    .arvp-navitem.active{ background:linear-gradient(90deg, rgba(238,77,45,.17), rgba(238,77,45,.03)); color:var(--orange-ll); }
    .arvp-navitem.active::before{ content:''; position:absolute; left:0; top:20%; bottom:20%; width:3px; border-radius:0 3px 3px 0; background:var(--orange); }
    .arvp-navitem i{ width:16px; text-align:center; font-size:13px; }
    .arvp-side-foot{ margin-top:auto; border-top:1px solid var(--border); padding-top:10px; }
    .arvp-main{ flex:1; margin-left:210px; padding:22px 26px; min-width:0; }
    .arvp-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
    .arvp-title{ font-size:22px; font-weight:800; color:var(--text); letter-spacing:-.02em; }
    .arvp-sub{ font-size:12.5px; color:var(--text-muted); margin-top:2px; }
    @media(max-width:900px){
      .arvp-shell{ flex-direction:column; }
      .arvp-side{ position:static; width:auto; flex-direction:row; align-items:center; gap:8px; flex-wrap:wrap; bottom:auto; }
      .arvp-main{ margin-left:0; padding:16px; }
      .arvp-brand, .arvp-navlabel, .arvp-side-foot{ display:none; }
      .arvp-back{ margin-bottom:0; }
    }
  </style>
</head>
<body>
<div class="arvp-shell">
  <aside class="arvp-side">
    <a class="arvp-back" href="/"><i class="fas fa-arrow-left"></i> Voltar ao JARVIS</a>
    <div class="arvp-brand">
      <div class="arvp-brand-mark"><i class="fas fa-diagram-project"></i></div>
      <div class="arvp-brand-txt"><b>Árvore de KPI's</b><span>COP RJ2</span></div>
    </div>
    <div class="arvp-navlabel">Painéis</div>
    <div class="arvp-navitem active" data-sub="arvore" onclick="arvSwitchSubpage('arvore',this)"><i class="fas fa-table-list"></i> Árvore de KPI's</div>
    <div class="arvp-navitem" data-sub="visao" onclick="arvSwitchSubpage('visao',this)"><i class="fas fa-chart-simple"></i> Visão Geral</div>
    <div class="arvp-navitem" data-sub="historico" onclick="arvSwitchSubpage('historico',this)"><i class="fas fa-arrow-trend-up"></i> Histórico</div>
    <div class="arvp-side-foot">
      <div class="arvp-navitem" onclick="arvToggleTheme()"><i class="fas fa-moon" id="arvp-theme-icon"></i> <span id="arvp-theme-label">Tema Escuro</span></div>
    </div>
  </aside>

  <main class="arvp-main">
    <div class="arvp-head">
      <div>
        <div class="arvp-title">Árvore de KPI's <span class="ds-badge ok" id="ds-badge-arvore" style="margin-left:8px;vertical-align:middle"></span></div>
        <div class="arvp-sub" id="arv-page-subtitle">Control Tower · Operação diária</div>
      </div>
      <button class="dl-btn dl-btn-csv" onclick="arvLoad(true)"><i class="fas fa-rotate-right"></i> Atualizar</button>
    </div>

    <div id="arv-root-arvore"></div>
    <div id="arv-root-visao" style="display:none"></div>
    <div id="arv-root-historico" style="display:none"></div>
  </main>
</div>

<div class="modal-overlay" id="arv-detail-overlay" onclick="if(event.target===this) arvCloseDetail()">
  <div class="modal" style="max-width:560px">
    <div class="modal-header">
      <span class="modal-title" id="arv-detail-title"><i class="fas fa-diagram-project" style="color:var(--orange);margin-right:8px"></i>Detalhe do KPI</span>
      <button class="modal-close" onclick="arvCloseDetail()"><i class="fas fa-xmark"></i></button>
    </div>
    <div id="arv-detail-body"></div>
  </div>
</div>

<script>
/* Tema compartilha a mesma chave do JARVIS (jarvis-theme) — trocar aqui
   reflete lá e vice-versa. Aplicado antes do render pra não piscar. */
(function(){
  try{
    const salvo = localStorage.getItem('jarvis-theme');
    if(salvo) document.documentElement.setAttribute('data-theme', salvo);
  }catch(e){}
})();
function arvToggleTheme(){
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  const proximo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', proximo);
  try{ localStorage.setItem('jarvis-theme', proximo); }catch(e){}
  arvSyncThemeLabel();
}
function arvSyncThemeLabel(){
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  const lbl = document.getElementById('arvp-theme-label');
  const ico = document.getElementById('arvp-theme-icon');
  if(lbl) lbl.textContent = atual === 'dark' ? 'Tema Claro' : 'Tema Escuro';
  if(ico) ico.className = atual === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/* Versão enxuta do setBadge do JARVIS (aqui só existe um badge). */
function setBadge(secao, estado, texto){
  const el = document.getElementById('ds-badge-arvore');
  if(!el) return;
  el.className = 'ds-badge ' + (estado === 'ok' ? 'ok' : estado === 'erro' ? 'err' : 'loading');
  el.textContent = estado === 'loading' ? 'carregando…' : (texto || '');
}

/* Helpers extraídos do index.html na geração (ver scripts/build-arvore.js). */
${helpers}
</script>

<script src="/assets/arvore.js"></script>

<script>
/* Aqui quem troca de subpágina é o menu da esquerda — mantém o item certo
   destacado mesmo quando a troca vem de outro ponto (ex: clique num KPI). */
const arvSwitchSubpageBase = arvSwitchSubpage;
arvSwitchSubpage = function(chave, el){
  arvSwitchSubpageBase(chave, el);
  document.querySelectorAll('.arvp-navitem[data-sub]').forEach(n =>
    n.classList.toggle('active', n.dataset.sub === chave));
};

arvSyncThemeLabel();
arvLoad();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(RAIZ, 'arvore.html'), pagina, 'utf8');
console.log('arvore.html gerado — ' + pagina.length + ' chars');
