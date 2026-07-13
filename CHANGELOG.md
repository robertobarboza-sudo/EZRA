# Changelog

Registro das alterações do site PULSO, em ordem cronológica (mais recente no topo).

## 2026-07-13

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
