# Layout RJ2 ASM3 (Navisworks) em 3D

Visualizador do arquivo `SPX_BR_RJ2_ASM3_Layout-V6.1-0729.nwd`, lido diretamente do formato Navisworks, sem Autodesk.

## Como abrir

```
cd layout-rj2
python3 -m http.server 8765
```

Depois abra `http://localhost:8765/index.html`. É preciso servidor local, porque a página carrega `modelo.json`.

## O que foi lido do .nwd

O `.nwd` é um `LcUStream` com blocos zlib. Dois fluxos têm a geometria:

**Fluxo de formas** (primeiros blocos):
- uma lista de objetos, cada um serializado a partir do id 100;
- tipos de forma:
  - 94: sólido em faixas de triângulos;
  - 95: polilinha;
  - 96: linhas;
  - 103: texto.
- Vértices em float32 (mm).
- Índices em código de bytes:
  - `00–3F`: novos vértices em sequência;
  - `40–7F`: repete o canto *d* posições atrás;
  - `80`: repete o canto anterior;
  - `E0 xx`: repete o canto *d* longo;
  - `F0 xx xx`: vértice absoluto.
- Comprimentos das faixas em campo de bits: `[n][bits][n][palavras]`.
- Quando há segunda lista de índices, ela aponta para a tabela de cantos.

**Fluxo de instâncias** (bloco de ~30 MB):
- objetos com id sequencial e classe;
- classes de transformação:
  - 15: translação (double) + quatérnio;
  - 16: translação + quatérnio + escala (espelhamento);
  - 17: matriz 3×3 + translação;
  - 14: só translação.
- Classe 93: caixa envolvente e índice da forma no fluxo de formas.
- Classes 55 e 54: material e cor.

## Gerar de novo

Coloque os blocos descomprimidos em `../nwd_out` e rode, nesta ordem:
1. `unz.py`;
2. `objs.py` (no bloco de instâncias, a partir do id `0x69`);
3. `inst.py`;
4. `topo_cache.py`;
5. `export.py`.

## Limites conhecidos

- 3 dos 1.454 sólidos não decodificam e ficam de fora.
- Objetos com mais de 500 m (linhas de construção do CAD) são descartados.
- Os textos ainda não aparecem.
- A árvore de nomes (camadas, blocos) ainda não está ligada às peças.
