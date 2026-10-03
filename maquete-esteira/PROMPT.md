# Prompt — Maquete 3D da Esteira 01 (separação manual)

> Prompt gerado a partir das premissas da operação e usado para gerar `maquete-esteira/index.html`.

---

Crie uma página HTML única (Three.js via CDN, sem build) que renderize em 3D, com acabamento de
**maquete arquitetônica realista**, a planta de uma operação de logística de **separação manual em
esteira (conveyor)**. A cena deve parecer um modelo físico sobre um plinto, com sombras suaves,
tone mapping cinematográfico e perspectiva forte (ponto de fuga) para dar profundidade.

## Unidade e escala
- 1 unidade = 1 metro. Todas as medidas abaixo são reais e devem ser respeitadas.

## Piso / plinto
- Plinto branco-concreto com bordas visíveis, como base de maquete.
- Textura de concreto polido + **grade de linhas no piso**: linha fina a cada 1 m, linha mais
  marcada a cada 5 m — a grade reforça a profundidade e o ponto de fuga.
- Demarcações de piso: contorno amarelo em cada ilha, faixa zebrada na zona de indução,
  linha verde de corredor de pedestres nas laterais, textos de piso ("ILHA 01", "INDUÇÃO", "GOLEIRO").

## Esteira (1 linha)
- Comprimento **42 m**, largura **1,50 m**, altura de trabalho ~0,82 m.
- Lona de borracha escura com textura que **se move** (velocidade ajustável), longarinas de
  alumínio, pés a cada ~2 m com travessas, tambores nas pontas.
- **Primeiros 8 m = zona de indução**: 4 colaboradores (2 de cada lado) pegam volumes de pallets
  de entrada e colocam na esteira. Botoeira de emergência no início da linha.
- Os 34 m restantes = zona de separação com as ilhas.

## Ilhas (10 no total)
- **5 ilhas de cada lado** da esteira, distribuídas uniformemente nos 34 m (passo de 6,8 m).
- Cada ilha tem um **flow rack cinza** (estrutura de aço galvanizado/cinza com pistas de roletes
  inclinadas em 2 níveis), perpendicular à esteira, com **corredor central onde o colaborador
  fica DENTRO da bancada**, de frente para a esteira.
- Em volta do flow rack: **6 caixas, 3 de cada lado**.
  - Caixa: altura **2,00 m**, base igual a um **pallet PBR (1,20 × 1,00 m)**, apoiada **sobre um
    pallet de madeira** (0,144 m).
  - Papelão kraft com textura, abas superiores abertas, janela frontal de carga voltada para o
    colaborador (aba rebatida) e etiqueta de posição (ex.: `I03·E2`).
  - Nível de preenchimento visível subindo conforme os pacotes entram; ao encher, a caixa é trocada.

## Goleiro (fim da esteira)
- Mesa de acúmulo com roletes e batente no final da linha.
- Uma ilha com **2 gaiolas** (base 1,20 × 1,00 m, **altura 1,70 m**), tela aramada, rodízios,
  **portas abertas voltadas para o meio**, e um colaborador (o **goleiro**) entre elas.
- Todo pacote que não for "pescado" nas ilhas (sem rota, ou operador ocupado/perdeu) chega ao fim
  e o goleiro coloca na gaiola.

## Colaboradores
- Figuras humanas proporcionais (~1,75 m): calçado, calça, camisa, **colete refletivo** (laranja nas
  ilhas, amarelo na indução, verde no goleiro), cabeça, braços articulados (ombro/cotovelo).
- Animação: virar para a esteira, alcançar o pacote, girar para a caixa de destino e arremessar
  pela janela da caixa; respiração/balanço sutil em repouso.

## Pacotes
- Fluxo contínuo de pacotes variados (caixas kraft com fita e etiqueta, envelopes plásticos
  brancos/cinza) correndo sobre a esteira.
- Cada pacote nasce com uma rota (ilha + posição) ou sem rota; contadores por ilha e do goleiro.

## Câmera e interface
- Câmera perspectiva com FOV que acentua o ponto de fuga; órbita, zoom e pan.
- Vistas prontas: Perspectiva, Eixo da esteira (ponto de fuga central), Planta (topo), Ilha, Goleiro.
- Painel: indicadores (induzidos, pescados, goleiro, taxa de captura, pacotes/h), barras por ilha,
  controles de velocidade da esteira, taxa de indução, pausar, ligar/desligar **cotas** (42 m,
  8 m, 34 m, 1,50 m, 2,00 m, 1,70 m) e tooltip ao passar o mouse sobre caixas/gaiolas.
- Responsivo (desktop e celular), tema claro/escuro no painel.
