# Changelog

Registro das alterações do site PULSO, em ordem cronológica (mais recente no topo).

## 2026-07-29

- **Nova página: Leftover**, dividindo o item de menu "SPR / Leftover" com a SPR — uma aba no topo da seção troca entre as duas sem sair da página. Dados da aba `leftover_hub_pulso` via `api/leftover.js`. Filtros: Turno, Type CPT, Hub, Causa 1, Causa 2. 7 cards: registros de leftover, destinos diferentes, pacotes leftover, % impacto operacional + pacotes, % impacto externo + pacotes. Pipboy com insights (hub ofensor, causa mais frequente, turno com mais volume, e um aviso separado pra registros classificados como Inconsistência de Dados).
- **Classificação Operacional × Externo definida com o time**: causas `[SOC]` = Operacional; `[GOV]` = Inconsistência de Dados (não entra nos 2 cards, só aparece como insight no Pipboy); qualquer outro prefixo (`[LH]`, `[3PL]`, `[XPT]`, `[EXT]`, `[INFO]`) = Externo.
- **Fix: campo de data do SPR sem clique.** O alvo real pra abrir o calendário é o ícone nativo do navegador, minúsculo e escondido no canto — parecia "quebrado" porque clicar no resto da caixa só seleciona texto. Trocado por uma seta pra baixo maior e visível.
- Extraída a matemática de período (dia/semana/mês) pra `api/_period.js`, compartilhada entre `api/spr.js` e `api/leftover.js` — evita duplicar a mesma lógica em cada endpoint novo.

## 2026-07-28

- **Pipboy ganhou tela de carregamento.** Clicar no botão mostra a imagem do mascote (`assets/pipboy.webp`) por 2s antes de revelar os insights — puramente de apresentação, os insights já são calculados na hora. Confirmado que o Pipboy só abre por clique, nunca automaticamente.
- **Motor de dashboard reutilizável.** Extraído tudo que foi construído pra SPR (filtros por período, agrupadores, dropdowns com busca, tabela ordenável, Pipboy) num motor genérico orientado a configuração (`pulsoRegister`/`pulsoRender` em `index.html`). Páginas novas (Leftover, Outbound, ...) agora só precisam de um endpoint no formato padrão + um objeto de config — sem recriar a UI do zero. Documentado em `docs/pulso-dashboard-engine.md`. Comportamento da SPR verificado idêntico após a migração.

- **Refino da SPR**: dropdowns de filtro ganharam "Todos"/"Limpar"; colunas da tabela de LTs ficaram clicáveis pra ordenar (asc/desc/original); novo filtro de **Canal** (HUB/SOC/FMH…) derivado do prefixo de `destination_station_code`, já que não existe coluna própria pra isso; e um botão **Pipboy** que abre um painel de insights automáticos (maior variação vs período anterior, concentração por destino/agência, viagens não fechadas, turno mais movimentado) — calculado a partir dos dados já carregados, sem chamada a IA externa.
- Cantos menos arredondados (`--radius-lg` 18px → 12px) e barra de filtros da SPR com altura alinhada entre os controles.
- Corrigido erro de digitação "viagems" → "viagens" (apareceu duas vezes, no rodapé da tabela e no Pipboy).

- **Fix: `GOOGLE_PRIVATE_KEY` não autenticava.** Normalização mais robusta (aspas em volta, `\n` escapado, CRLF) e erro mais claro quando falta o `-----BEGIN PRIVATE KEY-----`. Causa raiz das duas tentativas anteriores: colagens incompletas/malformadas da chave.
- **Nova planilha conectada: SPR/Leftover/Outbound.** `1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4`, compartilhada com a Service Account. Abas: `spr_pulso`, `leftover_hub_pulso`, `rawdata_out_pulso`, `cluster_pulso`.
- **Nova seção SPR.** Filtros (Dia/Semana/Mês + calendário, Turno, e busca por Solicitante/Destino/Veículo/Agência) e cards de KPI (SPR Overall = pedidos/viagem, viagens, orders e TO por scuttle/saca) com comparação automática vs. período anterior. Agregação feita no servidor (`api/spr.js`) — a aba tem ~20 mil linhas/~15MB, grande demais pra filtrar no navegador.
- **Clusterização pausada (não é mais seção "ao vivo").** O mapa doca×rua que construímos partiu de colunas assumidas sem ver os dados reais; a aba real (`outbound_ontime`) é uma tabela de TOs individuais, não de ocupação por doca/rua. Código mantido, só desligado de `LIVE_SECTIONS` até definirmos com o time como derivar ocupação a partir dos dados reais.
- **Ferramenta de introspecção `/api/debug-meta`** pra inspecionar planilhas novas (lista abas, cabeçalhos, amostra, tamanho do JSON) sem chutar estrutura. Vai ser usada pra ligar Leftover e Outbound a seguir.

## 2026-07-27

- **Nova camada visual (inspirada em `versao_demo_codex.html`).** Paleta clara/quente com fundo em gradiente e cards translúcidos ("glassmorphism"), substituindo o visual escuro anterior como padrão. O arquivo de referência partia de uma cópia anterior ao trabalho de integração — só o CSS visual foi portado; PULSO, Analytics e a integração com Google Sheets (Backlog/Clusterização) foram mantidos.
- **Modo kiosk: tela de login removida.** O portal entra direto como usuário fixo (`PORTAL_USER`, papel Administrador) ao carregar — pensado pra exibição tipo TV/painel na operação, sem precisar autenticar. Código de login (`doLogin`, `USERS`, formulário) permanece no arquivo, só não é mais acionado; reversível se decidirem reativar.
- **Botão de alternância de tema claro/escuro ocultado.** O sistema `[data-theme="light"]` antigo usa uma paleta que conflita com a nova camada visual — desativado até ser refeito especificamente pra ela.

## 2026-07-24

- **Troca de arquitetura: Apps Script → Service Account (Google Sheets API).** O admin do Workspace da Shopee desabilitou acesso anônimo ("ANYONE") em Web Apps do Apps Script, bloqueando a abordagem anterior. Substituído por autenticação servidor-a-servidor via Service Account (`api/_google.js`, JWT Bearer + Sheets API v4), com credenciais em `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`. `gas/` removido. `/api/dados` agora resolve abas pelo `gid` (sobrevive a renomeações).
- **Seção Clusterização ligada à planilha — mapa de docas/ruas ao vivo.** A aba `outbound_ontime` alimenta o mapa de ocupação (já existia pronto no código, só não estava conectado): grade doca × rua, barras de stage, aging, fanout endereçado, cluster ideal e KPIs (% clusterização, ruas OK/NOK etc.). Contrato de colunas em `docs/integracao-planilha.md`.

## 2026-07-15

- **Integração Google Sheets — estrutura completa (piloto: Backlog).** Criados o Apps Script (`gas/Code.gs`) que publica abas da planilha como JSON, a function `/api/dados` na Vercel (proxy com cache de 5 min; URL do script protegida em env var `GAS_URL`) e a camada `LIVE_SECTIONS` no DataService do front. A seção Backlog saiu do placeholder "Em Construção" e ganhou interface completa (abas Received/Packed/EHA, filtro por perfil, cards e gráficos por hora), lendo da planilha com fallback automático para dados demo. Contrato de colunas e passo a passo em `docs/integracao-planilha.md`.
- **Correção: troca de aba no Backlog não montava os cards.** `bklTab` agora reconstrói o painel completo (cards + gráficos), não só os gráficos.

## 2026-07-13

- **Vercel Web Analytics habilitado.** Snippet de script adicionado no `<head>` do `index.html` (sem pacote npm, já que o site não tem build step). (`87a3c51`)
- **Filtros removidos do header global.** Semana, Mês, Data e Turno saíram do topo do site — vão ser recolocados dentro de cada página específica em vez de ficar fixos globalmente. (`55734a7`)
- **Rebranding: J.A.R.V.I.S. → PULSO.** Nome trocado em todo o texto visível (título da aba, tela de login, sidebar, relatórios exportados). (`a76bd76`)
- **Site publicado na Vercel.** `index.html` (cópia de `checkpoints/versão_demo.html`) adicionado na raiz do repositório para hospedagem estática. Domínio ativo: `pulso-rj2.vercel.app`. (`b0f3b2c`)

## Checkpoints (pontos seguros para reverter)

| Tag | Data | Descrição |
|---|---|---|
| `estavel-2026-07-13` | 2026-07-13 | PULSO no ar, filtros globais removidos, tudo funcionando. |

### Como voltar a um checkpoint

```
git checkout estavel-2026-07-13 -- index.html
git commit -m "Reverter para checkpoint estavel-2026-07-13"
git push origin main
```

Ou, mais rápido: no dashboard da Vercel, abra a aba **Deployments** do projeto `pulso`, encontre o deploy correspondente à data desejada e clique em **Promote to Production**. Isso restaura o site ao vivo em segundos, sem precisar mexer em código.
