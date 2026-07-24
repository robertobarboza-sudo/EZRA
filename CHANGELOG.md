# Changelog

Registro das alterações do site PULSO, em ordem cronológica (mais recente no topo).

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
