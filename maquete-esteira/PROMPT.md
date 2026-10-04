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

---

## Revisão 2 (ajustes sobre o primeiro modelo)
- **Flow rack deitado**: mesa de roletes horizontal (1,00 × 3,30 m, ~0,85 m de altura) no eixo da ilha,
  perpendicular à esteira, com prateleira inferior e volumes em espera. O colaborador **não** fica
  dentro dele.
- **Ilha**: flow rack no centro, **corredor de 1,20 m** de cada lado e os **gaylords** (nome das caixas
  de 2 m sobre PBR) depois do corredor, 3 de cada lado. Largura total da ilha 5,80 m; passo 7,20 m.
- O separador fica na cabeceira da ilha, pega o volume da esteira e **caminha pelo corredor** até o
  gaylord de destino (animação de caminhada). Enquanto ele está ocupado, o que passa vai para o goleiro.
- **Esteira**: 44 m (8 m de indução + 36 m de ilhas) e largura **1,65 m**.
- **Indução com 7 posições**: 3 de cada lado e 1 na ponta da esteira; cada operador pega o volume de
  dentro de uma **gaiola** de abastecimento atrás dele (nível da gaiola baixa e é reposta).
- **Gaiolas sem porta** (goleiro e indução): face aberta voltada para o operador.
- **Volumes maiores** na esteira (caixas de 0,45 a 0,70 m e sacos volumosos).
- **Vista de ponto de fuga mais alta** (câmera elevada no eixo da esteira).
- **Colaboradores mais detalhados**: tronco e colete moldados, braços e pernas com cotovelo e joelho,
  rosto, boné ou cabelo, botas com solado, faixas e alças refletivas, cores em espaço sRGB correto.

---

## Revisão 3 — digital twin do CD (prompt do usuário + ajustes)
Objetivo: maquete digital **operacional e fotorrealista** de um centro de distribuição em funcionamento,
com fluxo **Recebimento → Indução → Triagem → Consolidação → Expedição** legível só de olhar.

**Ambiente**: galpão com pé-direito de 11 m, pilares e tesouras metálicas (azul institucional/cinza),
luminárias high-bay, faixa de iluminação natural, piso industrial de concreto polido, paredes da frente
cortadas na altura da maquete, docas com niveladoras, para-choques e caminhões (recebimento a oeste,
expedição nas laterais), porta-pallets (armazenagem), placas suspensas por área, faixas de corredor,
setas de fluxo em laranja. Identidade: branco, cinza claro, cinza industrial, laranja de destaque e azul escuro.

**Triagem (ajustes)**:
- Ilha mais perto da esteira; **pescador** só pesca da esteira e coloca no **flow rack** da ilha.
- Flow rack da ilha **preto e ~2,5× mais largo** (2,50 × 3,30 m); um **separador** pega do flow rack e coloca na
  **scuttle** (caixa maior, 1,20 × 1,00 × 2,00 m sobre PBR), 3 de cada lado, corredor de 1,20 m.
- **Corredor de 3,0 m entre ilhas** para a paleteira; a esteira cresce conforme as premissas.
- **Laterais**: 3 **paleteiros por lado** retiram a scuttle cheia (chamada a 85%), levam para a
  **consolidação** e trazem uma vazia do estoque; **carregadores** levam as cheias para os caminhões.
- **Goleiro**: flow rack na direção da esteira, mesma largura e **1,80 m**; **2 goleiros** (1 de cada lado) e
  **4 gaiolas** sem porta. Só **10%** do induzido vai para o goleiro.
- **Indução**: **8 operadores, 4 de cada lado** (sem posição na ponta), cada um com gaiola de abastecimento.
- **Setup de gaiolas**: 3 por lado; trazem a gaiola cheia antes, trocam quando a da indução esvazia e
  trocam as gaiolas cheias do goleiro (que vão para o reprocesso).
- **Volume**: 3.000 pct/h nominais com 15% de ineficiência (≈ 2.550 pct/h efetivos).

**Pessoas**: corpo esculpido com esqueleto (uma malha por pessoa), uniforme azul-marinho, colete
refletivo por função, variação de altura, porte, tom de pele, cabelo, boné e barba, animações de
pegar, girar, arremessar, caminhar, empurrar gaiola e puxar paleteira.

**Render**: tone mapping ACES, iluminação de ambiente (reflexos), sombras suaves, oclusão de
ambiente (SSAO), antisserrilhado (FXAA), profundidade de campo opcional; qualidade Cinema/Alto/Leve.

**Câmeras**: aérea isométrica (~40°), eixo da esteira (ponto de fuga), planta, e vistas em nível
humano (ilha, indução, goleiro, recebimento, expedição) + seguir paleteira.

**Premissas editáveis** (aba "Premissas"): volume, ineficiência, % goleiro, velocidade, medidas de
esteira, ilhas, flow racks, corredores, unitizadores e capacidades, pessoas por atividade e ritmo;
a maquete é remontada ao aplicar e mostra o resultado (comprimento, galpão, vazão, espaçamento e
quadro de pessoas).

### Revisão 3.1 — PHD por atividade
- Premissas ganham **PHD (pacotes/hora/pessoa)** de indução (350, já com a margem do goleiro), pescador (600),
  separador (300) e goleiro (350).
- Indução: cada operador induz no ritmo do PHD, limitado pela vazão efetiva da esteira (o que for menor).
- Pescador: o PHD é a capacidade (média por hora, com fôlego para rajadas); acima dela, o volume passa
  e vai para o goleiro. Separador e goleiro: o ciclo de cada volume segue o PHD (o flow rack faz o pulmão).
- A aba Premissas mostra a vazão simulada, o gargalo, a capacidade da indução e a ocupação de cada atividade.

### Revisão 4 — só a planta da esteira, com logística fechada
- **Sem recebimento, expedição, prédio ou caminhões**: só a planta da linha sobre o plinto, com
  **piso em grade** (linha a cada 1 m, mais forte a cada 5 m) para dar profundidade e escala.
- **Gaiolas**: antes da indução, **buffer de gaiolas cheias** (um lado da linha) e **de vazias** (outro lado),
  ligados por um corredor que cruza antes da esteira. O setup leva a gaiola cheia antes, troca quando a da
  indução esvazia e devolve a vazia ao buffer. O goleiro recebe gaiolas vazias desse buffer e a cheia volta
  para o buffer de cheias (reindução).
- **Scuttles**: a cheia sai da ilha com a paleteira para o **buffer de saída depois do goleiro**; a vazia vem
  do **buffer de scuttles vazias atrás dos paleteiros** (lateral), que é reposto.
- Render: relevo no papelão, variação de brilho no concreto, oclusão de ambiente mais marcada e vinheta.

### Revisão 5 — cubagem dos volumes
- Scuttle 1,20 × 1,00 × 2,00 m (2,40 m³), **ocupação útil 90%**, **perda por encaixe 1,5%**, **46 volumes** em média.
- Cubagem média por volume = 2,40 × 0,90 ÷ (46 × 1,015) ≈ **46,3 L** (≈ 45 × 33 × 31 cm); a mistura de
  caixas e sacos é escalada para essa média. Os três números são premissas editáveis.
- Removido o painel elétrico que ficava no caminho da indução; grade do piso mais clara; exportação .glb.

## Revisão 6: planta com três esteiras e modelo operacional completo

Base: planta baixa "Layout operacional – Centro de distribuição" (R12).

**Ajustes de medida.** As esteiras ficam com 42 m e o galpão cresce para caber tudo:
- **Galpão:** cerca de 96 × 97 m (no desenho, o galpão de 56 × 22 m não comporta três esteiras de 42 m com as ilhas).
- **Ilhas:** 3 por lado, o que dá exatamente 42 m de esteira.
- **Linhas:** 2,5 m entre as áreas de cada linha.

**Fluxo operacional:**
1. **Entrada (docas a oeste):** o recebimento leva as gaiolas cheias ao buffer de gaiolas cheias e devolve as vazias pelas docas.
2. **Abastecimento:** pelo corredor oeste, leva gaiola cheia ao buffer da indução de cada linha e traz a vazia ao buffer de vazias.
3. **Indução:** tira a gaiola vazia, leva ao buffer e coloca a cheia, que fica pré-posicionada na fileira de trás.
4. **Ilhas:** tira a scuttle cheia, leva ao buffer de saída da linha e coloca a vazia.
5. **Scuttles vazias:** paleteiras levam da área de pallets de scuttles (sudeste, com passagem) aos buffers laterais das linhas.
6. **Saída:** a scuttle cheia vai do buffer de saída da linha ao robô de stretch e depois à doca de carga (leste).
7. **Robô de stretch:** base redonda (tipo aspirador), 1,1 m de altura, percurso circular fixo em volta da scuttle.
   Na planta, a "área de conferência com robô" é na verdade a área de stretch. Ela foi posta ao lado da
   saída para a scuttle cheia não atravessar o galpão.

**Apoio:**
- caminho seguro de pedestres com até 1,4 m de largura, com barreira;
- conferência de scuttles, gaiolas e santinhas;
- mesa da liderança;
- banheiros.

**Premissas novas:**
- número de linhas e corredor entre linhas;
- largura do caminho seguro;
- equipes da planta: recebimento, abastecimento de gaiolas, abastecimento de scuttles, saída, conferência e liderança;
- robôs de stretch e tempo de stretch.

## Revisão 7: posições fiéis à planta RJ2

**Posições:**
- **Oeste:** entrada (docas) e rotas seguras nos cantos.
- **Noroeste:** buffer de scuttles e gaiolas (scuttles montadas e gaiolas cheias), banheiros ao norte.
- **Abaixo do buffer:** buffer de gaiolas (vazias).
- **Sudoeste:**
  - stretch com robô (1 robô e 1 operador que monta a caixa);
  - montagem com stretch manual (2 pessoas, 2 scuttles).
- **Centro:** abastecimento e as 3 esteiras (Termoplástica, Lona 01, Lona 02).
- **Leste:** saída/descarga de scuttles e gaiolas, com docas.
- **Sul:** circulação de pedestres com barreira, mesa da liderança, tratativa de avarias (sudeste) e passagem de scuttles.

**Fluxos:**
- **Scuttle vazia:** montada (caixa no pallet + filme stretch) → linha que precisa, ou buffer → buffers laterais das linhas.
- **Scuttle cheia:** buffer da linha → saída/descarga → doca.
- **Avarias:** % do volume do goleiro → gaiola de avarias no fim da linha → tratativa.

**Painel:** seletor de esteira para as vistas de linha (eixo, ilha, indução, goleiro, buffers).
