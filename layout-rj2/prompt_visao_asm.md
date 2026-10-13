# Prompt — Visão 3D do ASM (Sorter RJ2 ASM3)

## Objetivo

Criar uma visão 3D navegável do layout do sorter ASM3 do RJ2, lida diretamente do arquivo Navisworks (`SPX_BR_RJ2_ASM3_Layout-V6.1-0729.nwd`, gerado a partir de "conveyor system.dwg"). Ela deve mostrar com fidelidade a posição de cada esteira, do sorter, das docas e das rampas, para orientar decisões de layout e servir de base para a maquete viva.

## 1. Estilo visual

- Estrutura metálica do sorter e das esteiras em laranja, com acabamento de pintura eletrostática.
- Lonas, roletes e carrinhos do sorter em cinza escuro, quase preto.
- Faces planas (sem suavização), destacando a forma das peças do CAD.
- Piso de concreto no estilo da maquete das esteiras: cinza claro, manchas suaves e juntas de dilatação.
- Desenho 2D do CAD (paredes, docas, marcações) visível no piso.
- Sombras do sol e reflexos suaves do ambiente.
- Painel claro com a ficha do modelo à esquerda e os controles à direita. Tema claro e escuro.

## 2. O que o modelo contém

- Área de cerca de 335 × 159 m, com até 21 m de altura.
- 127 mil peças sólidas, 4.782 formas únicas e 16 milhões de triângulos.
- 1,4 milhão de segmentos de linha do desenho 2D.
- **Sorter:** carrinhos cross-belt de 600 mm em 3 níveis (2,6 / 4,3 / 5,7 m), com cerca de 1.056 módulos por nível no desenho. Premissa da operação: 946 carrinhos por nível, volta completa em 3 minutos.
- **Rampas:** 765 quedas que descem dos níveis até as estações de saca, a 1,6 m.
- **Indução:** 42 postos marcados no CAD, nas plataformas dos níveis 4,3 e 5,7 m.
- **Docas:** 22 esteiras telescópicas na parede norte.
- **Outbound:** linha com cerca de 28 chutes de saída.

## 3. Navegação e controles

- **Câmeras:** Planta (de cima), Perspectiva, Sorter e Docas, com transição suave.
- **Camadas:** sólidos 3D, peças menores que 20 cm, linhas do desenho 2D, piso de concreto e lajes do CAD (translúcidas).
- **Medida:** clicar numa peça mostra as dimensões em metros e a coordenada no desenho.
- **Legenda de materiais:** estrutura metálica, esteiras e roletes, pilares.

## 4. Leitura do arquivo .nwd (conversor próprio, sem Autodesk)

- **Arquivo:** o `.nwd` é um `LcUStream` com blocos zlib.
- **Formas:**
  - sólidos em faixas de triângulos, polilinhas, linhas e textos;
  - vértices em float32 (mm);
  - índices em código de bytes: novos vértices, repetição de canto, canto anterior e vértice absoluto.
- **Instâncias:**
  - transformação por translação + quatérnio, com espelhamento/escala ou matriz 3×3;
  - referência à forma;
  - material com cor.
- **Classificação das peças:**
  - placa fina horizontal → lona (cinza escuro);
  - cilindro longo → rolete;
  - pilar → concreto;
  - peças repetidas por carrinho → carrinho;
  - o resto → metal (laranja).
- **Scripts:** em `layout-rj2/conversor/` (`unz`, `objs`, `inst`, `topo_cache`, `export`, `classify`, `extra`, `levels`, `floorlines`).

## 5. Requisitos técnicos

- three.js com WebGL, malhas instanciadas por forma e linhas instanciadas por shader.
- Modelo compactado em `modelo.json` (geometria e instâncias em binário gzip, cerca de 2,8 MB).
- Coordenadas em metros, com origem em X 370 / Y 210 do desenho; Z para cima no CAD e Y para cima na cena.
- Página única (`layout-rj2/index.html`) servida por servidor local ou publicada como artifact.

## 6. Pontos de atenção

- O formato `.nwd` é fechado. Três das 1.454 formas sólidas não decodificam.
- Linhas de construção do CAD com mais de 500 m são descartadas.
- Os textos do desenho e a árvore de nomes (camadas e blocos) ainda não estão ligados às peças.
- As rampas do CAD vão de 1,6 m (estação) a 5,6 m (nível de cima).
- O desenho inclui bonecos de escala nos postos de indução. Na maquete viva eles são trocados por pessoas.

## Resultado esperado

Uma visão 3D fiel e leve do ASM, com o visual laranja e preto, que permita entender a posição de cada equipamento, medir peças e servir de base para unir o sorter à planta das esteiras numa única maquete viva.

Link atual: https://claude.ai/artifact/J1SGnmQxhzRka4QQpNB9hz
