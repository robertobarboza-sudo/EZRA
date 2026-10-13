# Continuar localmente

Branch: `claude/gifted-knuth-pr16nu`.

## 1. Baixar o projeto

```
git clone https://github.com/robertobarboza-sudo/ezra.git EZRA
cd EZRA
git checkout claude/gifted-knuth-pr16nu
```

Requisitos: Python 3 e um navegador Chrome ou Edge atualizado. Para editar e testar, também Node 20+.

## 2. Só ver a planta (sem instalar nada além do Python)

- Windows: clique duas vezes em `abrir-planta.bat`.
- Mac/Linux: rode `./abrir-planta.sh`.

O navegador abre em `http://localhost:8765/index.html`, com a planta unificada (sorter + 3 esteiras). A biblioteca 3D vem da internet (jsDelivr). A primeira carga leva alguns segundos.

Outras páginas, servidas pela raiz do repositório (`python3 -m http.server 8765`):
- `maquete-esteira/index.html`: só a planta das 3 esteiras (layout original);
- `layout-rj2/index.html`: só o sorter, lido do `.nwd`.

## 3. Continuar o trabalho com o Claude Code local

Na pasta `EZRA`, rode `claude` e peça:

> Leia CONTINUAR-LOCAL.md e planta-rj2-unificada/prompt_operadores_sorter.md e continue a planta unificada.

### Editar e testar a planta unificada

```
cd planta-rj2-unificada/src
npm install
npx playwright install chromium   # só para os testes automáticos
# (ou aponte um Chromium já instalado: export PW_CHROMIUM=/caminho/do/chrome)
bash build.sh                     # gera ../index.html (CDN) e test.html (local)
python3 -m http.server 8801
```

- Página local: `http://localhost:8801/test.html`. O modo leve, sem as peças menores que 20 cm, é `test.html?lite`.
- Teste do fluxo: `node srtest.js geral,sorter,rampas`. Ele mostra os números do sorter (carrinhos, mesas, pacotes por etapa, sacas, gaiolas) e salva capturas.
- No navegador, `window.__sr()` mostra os mesmos números e `window.__srPick(x, y)` diz qual peça do CAD está sob um ponto da tela.

## Como está organizado

| Pasta | O que é |
|---|---|
| `planta-rj2-unificada/` | Planta unificada (o trabalho atual) |
| `planta-rj2-unificada/src/` | Fontes. `build.sh` junta tudo em `index.html` |
| `planta-rj2-unificada/src/s_sorter.js` | Sorter: carga, carrinhos, mesas, quedas, sacas, take away, outbound, gaiolas |
| `planta-rj2-unificada/sorter/` | Dados do sorter: `modelo.json` (peças), `extra.json` (rampas, mesas, telescópicas, outbound), `niveis.json` (circuitos dos carrinhos), `piso_linhas.png` (desenho do CAD no piso) |
| `planta-rj2-unificada/pessoas/` | Pessoas MakeHuman com esqueleto e movimentos de captura (CMU) |
| `maquete-esteira/` | Planta das 3 esteiras no layout original |
| `layout-rj2/` | Visualizador do sorter e conversor do `.nwd` (`conversor/`) |

## Premissas (painel → Premissas → "Sorter (ASM)")

| Premissa | Valor |
|---|---|
| Carrinhos por nível | 946 |
| Níveis | 3 |
| Volta completa | 180 s |
| Indução por mesa | 1.000 pct/h |
| Pacotes por saca | 45 |
| Quedas por colaborador | 10 |
| Sacas por gaiola | 10 |
| Permanência no buffer de endereçamento | 120 s |
| Permanência na rua | 300 s |

## Fluxo implementado

1. O pacote sobe de baixo por um escorregador até o colaborador, que fica na plataforma ("mesa").
2. O colaborador põe o pacote na mesa do computador, que passa pelo pórtico de leitura.
3. A mesa dispara o pacote para o próximo carrinho livre.
4. O carrinho gira sem parar e descarrega na queda do destino.
5. A saca enche. O colaborador das suas 10 quedas fecha a saca, empurra para o take away e põe uma vazia.
6. O take away leva à matriz e ao outbound, onde a saca cai no chute do destino.
7. O colaborador põe a saca na gaiola. Com 10 sacas, a gaiola vai para o buffer de endereçamento e depois para a rua de destino, onde aguarda o carregamento.
8. Docas: carreta, telescópica e descarga.

## Pendências conhecidas

- Câmeras de perto (Indução do sorter, Rampas) ficam entre as rampas.
- O caminho do take away até o outbound é traçado em linha, sem seguir as esteiras reais.
- Nem todos os 42 postos de indução têm mesa.
- As rampas do CAD sobem do carrinho (1,6 m) até 5,6 m; a saca foi colocada na ponta baixa.
- Personagens no estilo The Sims: precisam de modelagem no Blender (ver `prompt_operadores_sorter.md`).
- O botão Exportar não funciona no link publicado (falta declarar a permissão de download).
