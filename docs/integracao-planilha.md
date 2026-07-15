# Integração PULSO ↔ Google Sheets

## Arquitetura

```
Google Sheets (planilha privada, você edita)
        │  lida pelo Apps Script (gas/Code.gs, vinculado à planilha)
        ▼
Web App do Apps Script — endpoint JSON (URL secreta)
        │  chamada servidor-a-servidor
        ▼
Vercel Function  /api/dados  (api/dados.js)
        │  cache de CDN: 5 min (s-maxage=300)
        ▼
Front-end PULSO (index.html → DataService)
        │  fallback automático para dados demo se a planilha estiver fora
        ▼
Cards e gráficos da seção
```

- A URL do Web App fica **só** na variável de ambiente `GAS_URL` do projeto
  Vercel — nunca aparece no navegador.
- O cache de 5 minutos na CDN protege a planilha de excesso de chamadas.
  Dados "a cada 30 min" e "a cada 5 min" são cobertos pelo mesmo cache.
- Se a API falhar, o site continua no ar com os dados demo e a etiqueta
  da seção mostra `Demo` em vez de `Planilha · HH:MM`.

## Contrato da aba `backlog`

Primeira linha = cabeçalho (sem distinção de maiúsculas/minúsculas). Uma
linha por combinação tipo × perfil:

| tipo     | perfil | total | meta | h1  | h2  | ... | h24 |
|----------|--------|-------|------|-----|-----|-----|-----|
| received | p      | 4200  | 4000 | 180 | 210 | ... | 95  |
| received | m      | 3100  | 3000 |     |     |     |     |
| received | g      | 1500  | 1500 |     |     |     |     |
| received | bk     | 600   | 700  |     |     |     |     |
| packed   | p      | 3800  | 4000 |     |     |     |     |
| ...      | ...    | ...   | ...  |     |     |     |     |

- `tipo`: `received`, `packed` ou `eha`
- `perfil`: `p`, `m`, `g` ou `bk`
- `total` e `meta`: números inteiros
- `h1`..`h24` (opcionais): série horária dos gráficos, na ordem do eixo —
  `h1` = 06:00, `h2` = 07:00 … `h24` = 05:00. Se ausentes ou incompletas,
  o gráfico mantém a série demo.

## Como publicar o Apps Script (uma vez)

O código está em [gas/Code.gs](../gas/Code.gs). Deploy via `clasp` (já
logado nesta máquina) depois de vincular ao ID da planilha, ou manualmente:
Extensões → Apps Script na planilha → colar o código → Implantar →
Nova implantação → App da Web → Executar como "Eu" · Acesso "Qualquer
pessoa" → copiar a URL `/exec`.

A URL vai na env var `GAS_URL` do projeto `pulso` na Vercel
(Settings → Environment Variables) e exige um redeploy para valer.

## Como ligar uma nova seção

1. Criar a aba na planilha e definir o contrato de colunas.
2. Adicionar o nome da aba em `ABAS_LIBERADAS` no `gas/Code.gs` e
   republicar o script.
3. Adicionar a seção em `LIVE_SECTIONS` no `DataService` (index.html).
4. Fazer o `render<Seção>` consumir as linhas recebidas (ver
   `aplicarBacklogPlanilha` como referência).
