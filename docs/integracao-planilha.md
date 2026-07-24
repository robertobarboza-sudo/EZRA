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

## Seções ligadas e suas planilhas

Configurado em `CONFIG` no topo de [api/dados.js](../api/dados.js):

| Seção          | Planilha (spreadsheetId)              | Aba (gid)   |
|----------------|----------------------------------------|-------------|
| `clusterizacao`| `1sn2V55qslwcjrbnCklVzxjoPrerO_Ba7XAfRKQ-XV_0` | `1819579584` (aba `outbound_ontime`) |

## Contrato de colunas — Clusterização (aba `outbound_ontime`)

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

## Como ligar uma nova seção

1. Definir o contrato de colunas da aba de origem.
2. Adicionar a entrada em `CONFIG` (`api/dados.js`) com `spreadsheetId` e
   `gid`.
3. Adicionar o nome da seção em `LIVE_SECTIONS` no `DataService`
   (`index.html`).
4. Compartilhar a planilha (se for outra) com a Service Account.
5. Escrever a função de conversão linhas → estrutura da UI (ver
   `linhasParaDocas` como referência) e plugar no `render<Seção>`.
