# Integração PULSO ↔ Google Sheets

## Arquitetura

```
Google Sheets (planilha privada, você edita)
        │  compartilhada como Leitor com a Service Account
        ▼
Google Sheets API v4 — autenticado via JWT Bearer (Service Account)
        │  chamada servidor-a-servidor (api/_google.js)
        ▼
Vercel Function  /api/dados  (api/dados.js)
        │  cache de CDN: 5 min (s-maxage=300)
        ▼
Front-end PULSO (index.html → DataService)
        │  fallback automático para dados demo se a planilha estiver fora
        ▼
Cards, gráficos e o mapa de Clusterização
```

> Histórico: a primeira versão usava um Apps Script Web App como proxy.
> O admin do Workspace da Shopee desabilitou acesso "ANYONE" (anônimo) em
> Web Apps do domínio, então trocamos para uma Service Account do Google
> Cloud + Sheets API — abordagem padrão para acesso servidor-a-servidor
> sem depender de link público.

- As credenciais da Service Account ficam **só** nas variáveis de ambiente
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` do projeto Vercel —
  nunca aparecem no navegador.
- Cada aba é referenciada pelo **gid** (id numérico fixo da aba, visível na
  URL `...#gid=NNNN`), não pelo nome — sobrevive a renomeações da aba.
- Cache de 5 minutos na CDN cobre as cadências de "a cada 30 min" e
  "a cada 5 min" sem sobrecarregar a API do Google.
- Se a API falhar, o site continua no ar com dados demo e a etiqueta da
  seção mostra `Demo` em vez de `Planilha · HH:MM`.

## Configuração da Service Account (uma vez)

1. Google Cloud Console → ativar **Google Sheets API** no projeto.
2. Criar uma Service Account (ex: `pulso-sheets-reader`) e gerar uma
   chave JSON.
3. Compartilhar a planilha com o `client_email` da Service Account,
   permissão **Leitor**.
4. No projeto `pulso` da Vercel → Settings → Environment Variables,
   adicionar:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — o `client_email` do JSON.
   - `GOOGLE_PRIVATE_KEY` — o valor de `private_key` do JSON (com as
     quebras de linha `\n`).
5. Redeploy do projeto para as variáveis valerem.

## Planilhas em uso

| Planilha | spreadsheetId | Abas relevantes |
|---|---|---|
| Outbound Ontime (antiga, piloto) | `1sn2V55qslwcjrbnCklVzxjoPrerO_Ba7XAfRKQ-XV_0` | `outbound_ontime` (gid `1819579584`) |
| SPR/Leftover/Outbound (atual) | `1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4` | `spr_pulso` (gid `1276487267`), `leftover_hub_pulso` (gid `352174025`), `rawdata_out_pulso` (gid `0`), `cluster_pulso` (gid `646168208`) |

## Seções ligadas

Seções simples (fetch + fallback pra demo) usam `CONFIG` no topo de
[api/dados.js](../api/dados.js) — front chama `/api/dados?tabs=<seção>`:

| Seção     | Planilha | Aba (gid) |
|-----------|----------|-----------|
| `backlog` | *(pendente — usar aba real quando definida)* | — |

Seções com filtro/agregação pesada têm endpoint dedicado, porque
mandar a planilha inteira pro navegador a cada filtro não escala
(ex: `spr_pulso` tem ~20 mil linhas / ~15MB em JSON):

| Seção | Endpoint | Planilha (gid) |
|---|---|---|
| SPR | [api/spr.js](../api/spr.js) | `spr_pulso` (gid `1276487267`) da planilha SPR/Leftover/Outbound |

## Clusterização — modelo pausado

O mapa doca × rua (`buildClusterSummary`/`buildClusterTable`,
`linhasParaDocas`) continua no código, mas **não está em
`LIVE_SECTIONS`** — a aba `outbound_ontime` real é uma tabela de ~7.500
registros individuais de TO (transfer order: `to number`, `driver`,
`receiver`, `quantity`, `staging area` etc.), não uma tabela de
ocupação por doca/rua com capacidade. O contrato de colunas abaixo foi
uma suposição feita sem ver os dados reais — para reativar, é preciso
antes decidir com o time de operação como derivar ocupação/capacidade/
cluster ideal a partir dos dados reais (o campo `staging area`, ex.
`OBS-01S0`, parece decompor em doca+posição, mas isso não foi
confirmado).

## Contrato de colunas — Clusterização (aba `outbound_ontime`, não usado atualmente)

Primeira linha = cabeçalho (case-insensitive). Uma linha por combinação
doca × rua/posição de stage:

| coluna         | obrigatório | descrição                                   |
|----------------|-------------|----------------------------------------------|
| `doca`         | sim         | identificador da doca (ex: `D01`)             |
| `rua`          | sim         | identificador da rua/posição (ex: `RUA 01`)   |
| `spp`          | não         | posição SPP                                   |
| `saca`         | não         | identificação da saca                         |
| `scuttle`      | não         | identificação do scuttle                      |
| `posocc`       | sim         | posições ocupadas (número)                    |
| `poscap`       | sim         | capacidade de posições (número)               |
| `aging`        | não         | aging médio em horas (número)                 |
| `pacotesovr`   | não         | pacotes em overflow (número)                  |
| `proxcpt`      | não         | próximo CPT (texto/horário)                   |
| `timercpt`     | não         | timer até o CPT (texto)                       |
| `ocupacao`     | não         | % ocupação; se ausente, calculado de posocc/poscap |
| `posicoespend` | não         | posições pendentes de endereçamento (número)  |
| `cidade`       | não         | cidade/hub do fanout endereçado                |
| `clusterideal` | não         | cluster ideal sugerido, pra comparar com `cidade` |

O front-end (`linhasParaDocas` em `index.html`) agrupa as linhas por
`doca` e monta a grade doca × rua que alimenta `buildClusterSummary` e
`buildClusterTable` — o mapa de ocupação, KPIs (% clusterização, aging
médio, ruas OK/NOK etc.) e as barras de stage.

## SPR — `/api/spr`

Endpoint dedicado (não passa por `/api/dados`) porque a aba `spr_pulso`
é grande demais pra filtrar no navegador. Faz o fetch da planilha,
filtra e agrega no servidor a cada chamada (cache de CDN de 5 min por
combinação de query params).

**Query params:** `dim` (`day`|`week`|`month`, default `day`), `date`
(`YYYY-MM-DD`, default = data mais recente da base), `turno`,
`solicitation_by`, `destination`, `vehicle`, `agency` (todos listas
separadas por vírgula), `q` (busca livre em `destination_station_code`).

**Resposta:** `{ ok, atualizadoEm, periodo: {dim, inicio, fim,
inicioAnterior, fimAnterior}, atual: {viagens, pedidosPorViagem,
ordersScuttle, ordersSaca, toScuttle, toSaca}, anterior: {...},
delta: {...% por métrica}, opcoesFiltro: {turno, solicitation_by,
destination_station_code, used_vehicle, used_agency_name} }`.

Comparação de período: dia compara com o dia anterior, semana com a
semana anterior (segunda–domingo), mês com o mês anterior — sempre
calculado a partir de `cutoff_date`, não das colunas `mes`/`semana`
(que não têm ano, ambíguas entre anos diferentes).

O front (`index.html`, bloco "SPR") faz seu próprio fetch em `sprLoad()`
em vez de passar pelo `DataService` genérico, porque tem estado de
filtro complexo (`SPR_STATE`) que precisa disparar refetch a cada
mudança.

## Ferramenta de introspecção (`/api/debug-meta`)

Criada pra descobrir a estrutura de uma planilha nova sem chutar
colunas. Restrita a uma lista fixa de `spreadsheetId` permitidos
(`PERMITIDAS` em `api/debug-meta.js`) — não aceita qualquer ID.

- `?id=<spreadsheetId>` — lista abas (título + gid).
- `?id=<spreadsheetId>&gid=<gid>` — cabeçalho + 5 linhas de amostra.
- `?id=<spreadsheetId>&gid=<gid>&raw=1` — valores brutos (sem tratar
  linha 1 como cabeçalho; útil pra abas tipo "ReadMe").
- `?id=<spreadsheetId>&gid=<gid>&size=1` — tamanho do JSON resultante,
  pra decidir se cabe em `/api/dados` (proxy simples) ou precisa de
  endpoint dedicado com agregação server-side (como o SPR).

Ainda em uso pra onboarding de Leftover e Outbound. Remover quando não
precisar mais adicionar planilhas novas.

## Como ligar uma nova seção

1. Rodar o `/api/debug-meta` pra ver a estrutura real da aba (nunca
   assumir colunas sem ver os dados).
2. Se a aba for pequena (cabe tranquilo num fetch só): adicionar a
   entrada em `CONFIG` (`api/dados.js`) com `spreadsheetId` e `gid`, e
   o nome da seção em `LIVE_SECTIONS` no `DataService` (`index.html`).
   Se for grande ou precisar de filtro/agregação (como o SPR): criar
   um endpoint dedicado em `api/`, reaproveitando `fetchTabByGid` de
   `api/_google.js`.
3. Compartilhar a planilha (se for outra) com a Service Account.
4. Escrever a função de conversão linhas → estrutura da UI e plugar no
   `render<Seção>`.
