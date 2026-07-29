# Motor de dashboard padrão (PULSO Dashboard Engine)

Pacote de UI reutilizável construído pra SPR e generalizado pra qualquer
página nova alimentada por planilha: barra de filtros (período + calendário,
agrupadores tipo Turno/Canal, dropdowns com busca e "Todos"/"Limpar"),
KPIs com comparação de período, tabela detalhada ordenável, e o botão
**Pipboy** com insights automáticos.

Está todo em `index.html`, no bloco `PULSO DASHBOARD ENGINE` (funções
`pulso*`). Uma página nova (Leftover, Outbound, ...) não recria nada disso —
só registra um **config** e ganha a UI inteira pronta.

Duas páginas em produção usando o motor: **SPR** (`api/spr.js`) e
**Leftover** (`api/leftover.js`) — use o config do Leftover como segunda
referência além do da SPR, principalmente pra ver como tratar filtros
categóricos com muitos valores (`hub`, `causa2`) vs. campos de texto livre
(`observacao`, via `searchFields`, não vira dropdown).

## Duas páginas sob um único item de menu

SPR e Leftover dividem o mesmo item de navegação ("SPR / Leftover") — não
são duas seções separadas. Um seletor de abas no topo da seção
(`pulso-subpage-tabs`) troca qual delas está visível, via
`pulsoSwitchSubpage(key, el)`, sem passar por `navigateTo`/`renderSection`.

Pra isso funcionar, cada sub-página tem seu próprio `<div id="pulso-root-<key>">`
e seu próprio badge `<span id="ds-badge-<key>">` dentro do MESMO
`section-header` — `pulsoSwitchSubpage` alterna a visibilidade dos dois e
atualiza o título/subtítulo. Os botões de Pipboy/Atualizar do header chamam
`pulsoOpenPipboy(PULSO_ACTIVE_SUBPAGE)`/`pulsoLoad(PULSO_ACTIVE_SUBPAGE)` em
vez de uma key fixa, pra sempre agir na sub-página visível no momento.
Use esse padrão quando fizer sentido agrupar páginas relacionadas (como
Outbound poderia se juntar a essa mesma dupla, virando "SPR / Leftover /
Outbound") em vez de poluir o menu lateral com um item por planilha.

## Contrato esperado da API

O endpoint da página (ex: `api/spr.js`) precisa devolver:

```json
{
  "ok": true,
  "atualizadoEm": "2026-07-28T18:00:00.000Z",
  "periodo": { "dim":"day", "inicio":"2026-07-28", "fim":"2026-07-28", "inicioAnterior":"2026-07-27", "fimAnterior":"2026-07-27" },
  "atual":    { "minhaMetrica": 100, "outraMetrica": 50 },
  "anterior": { "minhaMetrica": 80,  "outraMetrica": 40 },
  "delta":    { "minhaMetrica": 25,  "outraMetrica": 25 },
  "<rowsField>": [ { "coluna1": "...", "coluna2": 123 } ],
  "<totalField>": 42,
  "opcoesFiltro": { "meuAgrupador": ["A","B"], "meuFiltro": ["X","Y"] }
}
```

Isso é exatamente o que `api/spr.js` faz: recebe `dim`/`date` + filtros via
query string, filtra e agrega no servidor (nunca manda a base inteira pro
navegador), devolve os totais do período atual e do anterior + as opções
reais pra popular os filtros. Use-o como referência pra um novo endpoint.

## Passo a passo pra uma página nova

**1. Backend** — criar `api/<pagina>.js` seguindo o padrão de `api/spr.js`
(reaproveitando `fetchTabByGid` de `api/_google.js`): filtra/agrega no
servidor, devolve o formato acima.

**2. HTML da seção** — só isto (nada de filtros/kpis/tabela escritos à
mão):

```html
<section id="section-<pagina>" class="section">
  <div class="section-header" id="section-<pagina>-header">
    <div class="section-header-left">
      <div class="section-title"><Título> <span class="ds-badge ok" id="ds-badge-<pagina>" style="margin-left:8px"></span></div>
      <div class="section-subtitle">...</div>
    </div>
    <div class="section-dl-group">
      <button class="spr-pipboy-btn" onclick="pulsoOpenPipboy('<pagina>')"><i class="fas fa-satellite-dish"></i> Pipboy</button>
      <button class="dl-btn dl-btn-csv" onclick="pulsoLoad('<pagina>')"><i class="fas fa-rotate-right"></i> Atualizar</button>
    </div>
  </div>
  <div id="pulso-root-<pagina>"></div>
</section>
```

**3. Config JS** — registrar a página perto da config da SPR (mesmo bloco):

```js
pulsoRegister({
  key: '<pagina>',
  label: '<Título>',              // aparece no cabeçalho do modal do Pipboy
  apiPath: '/api/<pagina>',
  toggleGroups: [
    { key:'turno', static:['T1','T2','T3'] },   // opções fixas
    { key:'algo',  dynamic:'algo' },             // opções vêm de opcoesFiltro.algo
  ],
  multiselects: [
    { key:'campo1', label:'Rótulo 1', field:'coluna_da_api' },
    { key:'campo2', label:'Rótulo 2', field:'outra_coluna', searchable:true },
  ],
  kpis: [
    { key:'minhaMetrica', label:'Minha Métrica', icon:'fa-route' }, // key bate com atual/delta da API
  ],
  table: {
    title: 'Registros do período selecionado',
    rowsField: '<rowsField>', totalField: '<totalField>',   // nomes usados na resposta da API
    searchFields: ['coluna_busca'],
    itemNameSingular: 'registro', itemNamePlural: 'registros',
    columns: [
      { key:'coluna1', label:'Coluna 1', type:'text' },     // type: text | number | date
    ],
  },
  insights(data, rows){                          // opcional — insights específicos do domínio
    return [{ icon:'fa-star', html:'Texto do insight.' }];
  },
});
```

**4. Dispatch** — em `renderSection`, adicionar `'<pagina>': ()=>pulsoRender('<pagina>')`.

**5. Nav + acesso** — item de menu (`data-section="<pagina>"`), entrada em
`sectionMeta` e em `ALL_SECTIONS` (controle de acesso por perfil).

Isso é tudo — filtros, KPIs com delta, tabela ordenável com busca, e Pipboy
já funcionam sem escrever HTML de UI nenhum.

## O que o motor já resolve de graça

- Filtro de período (Dia/Semana/Mês + calendário), com o backend
  calculando o período anterior equivalente.
- Agrupadores estilo Turno (fixos) ou Canal (descobertos dinamicamente a
  partir de `opcoesFiltro`, pra campos que não existem como coluna própria
  — ver `canalDe()` em `api/spr.js` como exemplo).
- Dropdowns com busca e "Todos"/"Limpar".
- Tabela com colunas clicáveis (asc → desc → ordem original) e busca local
  (os dados já vêm filtrados/paginados pelo backend).
- Pipboy: sempre inclui o insight genérico de "maior variação vs período
  anterior" baseado nos `kpis` do config; `cfg.insights()` é onde entram
  os insights específicos do domínio da página.
- Fallback de erro (`Erro: ...` no badge) se a API falhar — nunca quebra a
  tela.

## O que fica por sua conta

- O endpoint da API em si (a lógica de agregação é específica de cada
  planilha).
- Decidir quais métricas/colunas fazem sentido pra cada página.
