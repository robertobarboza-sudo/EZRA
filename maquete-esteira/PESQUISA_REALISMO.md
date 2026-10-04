# Pesquisa: bibliotecas públicas para realismo da maquete

Objetivo: deixar a maquete interativa mais bonita, realista e natural em três frentes, sem perder o
funcionamento ao vivo (simulação rodando, premissas editáveis):

1. personagens;
2. animação;
3. ambiente e renderização.

Cada item diz o que é, a licença, se dá para baixar deste ambiente (rede liberada só para npm, PyPI e
raw.githubusercontent) e a decisão.

## 1. Personagens

| Biblioteca / acervo | O que traz | Licença | Acesso daqui | Decisão |
|---|---|---|---|---|
| **MakeHuman 1.x** (`base.obj`, alvos, esqueleto `default.mhskel`, pesos) | Corpo humano paramétrico (gênero, idade, peso, etnia, proporções) com esqueleto de 163 ossos | CC0 nos ativos | ✅ raw.githubusercontent + PyPI | **Em uso.** 12 variações exportadas do Blender com colete, cabelo, boné, olhos e esqueleto |
| **MPFB2** (MakeHuman para Blender) | Pele com subsuperfície, sobrancelhas, cílios e cabelos de cartões | GPL (código) / CC0 (ativos) | Código ✅, pacotes de ativos ❌ (`static.makehumancommunity.org` bloqueado) | Usar quando houver acesso aos pacotes: maior ganho de realismo no rosto |
| Pacotes de pele, cabelo e roupa do MakeHuman (`makehuman_system_assets`) | Texturas de pele por etnia, roupas e cabelos prontos | CC0 | ❌ bloqueado | Pendente de acesso |
| SMPL / SMPL-X | Corpo estatístico de alta fidelidade | Não comercial | – | **Descartado** pela licença |
| Ready Player Me | Avatares estilizados | Serviço encerrado ao público | – | Descartado |
| VRoid / three-vrm (`@pixiv/three-vrm`) | Avatares em estilo anime | MIT | ✅ npm | Descartado: estilo não realista |
| Quaternius / Kenney | Personagens low-poly | CC0 | – | Descartado: estilizado |

## 2. Animação

| Biblioteca / acervo | O que traz | Licença | Acesso daqui | Decisão |
|---|---|---|---|---|
| **CMU Graphics Lab Motion Capture** (BVH de B. Hahne, espelho `una-dinosauria/cmu-mocap`) | Mais de 2.500 capturas: andar, andar de costas, girar no lugar, pegar e soltar objeto, ficar parado | Livre para qualquer uso | ✅ raw.githubusercontent | **Em uso.** Clipes: andar (69_02), andar de costas (69_39), parado (77_02), pegar objeto (69_73) |
| **NumPy + SciPy** (`pip install numpy scipy`) | Cinemática direta, quaternions, reamostragem e detecção de ciclo | BSD | ✅ PyPI | **Em uso** no conversor `render/bvh2clips.py` |
| `bvh` (PyPI) | Leitor de BVH | MIT | Pacote não compila aqui | Substituído por leitor próprio no conversor |
| `pymotion` (PyPI) | Utilitários de BVH e quaternions duais | MIT | ✅ (versão 0.0.0, vazia) | Sem uso |
| three.js `AnimationMixer` / `SkeletonUtils` | Mistura de clipes e clonagem de personagens com esqueleto | MIT | ✅ | **Em uso** (`SkeletonUtils`); mistura feita no próprio código |
| three.js `CCDIKSolver` | IK para mãos e pés | MIT | ✅ | Próximo passo: mãos encostando no volume e no timão |
| Motion Matching (Daniel Holden, `orangeduck/Motion-Matching`) | Escolha do trecho de captura mais próximo do movimento desejado | MIT (código) | ✅ | Referência; os dados que acompanham (LaFAN1) são não comerciais |
| LaFAN1 (Ubisoft), Bandai Namco Motion Dataset | Capturas de alta qualidade | CC BY-NC(-ND) | – | **Descartado** pela licença |
| Mixamo | Animações prontas | Grátis com conta Adobe | ❌ sem API pública | Descartado |

### Como a animação ficou estruturada

- **Clipes de captura:** o conversor gera `pessoas/movimentos.json`. Ele detecta o ciclo de passos e
  remove a deriva de direção e de deslocamento. Os laços de andar e de ficar parado são fechados com
  mistura entre o fim e o começo.
- **Pernas, quadril e tronco:** vêm da captura. A fase do passo avança pela distância realmente
  percorrida, então o pé não desliza. A mistura entre parado, andando e de costas é feita pela
  velocidade medida.
- **Braços e inclinação durante tarefas:** vêm da pose da tarefa (alcançar, carregar, empurrar gaiola,
  puxar paleteira), com transição suave.
- **Trajetórias:** cantos arredondados e perfil de velocidade com aceleração e frenagem, para pessoas
  e paleteiras. Acaba o "zigue-zague" com paradas a cada segmento.
- **Nível de detalhe:** a partir de 60 m da câmera, a pessoa troca para o boneco leve (1 chamada de
  desenho) com a mesma pose.

## 3. Ambiente e renderização

| Biblioteca / acervo | O que traz | Licença | Acesso daqui | Decisão |
|---|---|---|---|---|
| **@pmndrs/assets** (npm) | HDRIs da Poly Haven (warehouse, workshop, studio…), mapas normais | CC0 | ✅ npm | **Em uso:** HDRI de galpão para iluminação e reflexos |
| Poly Haven / ambientCG direto | Texturas PBR de concreto, papelão e metal | CC0 | ❌ bloqueado | Pendente de acesso; o HDRI vem pelo npm |
| three.js `EXRLoader` + `fflate` | Leitura do HDRI em EXR | MIT | ✅ | **Em uso** |
| **meshoptimizer** + `@gltf-transform/cli` | Compressão das pessoas (malha quantizada e meshopt) | MIT | ✅ npm | **Em uso (r186):** pessoas de 14 para 4,7 MB. No r128 a quantização quebrava as malhas com esqueleto |
| **three.js r186** | Iluminação física, AgX, `OutputPass`, materiais mais novos | MIT | ✅ npm | **Em uso** (r186, módulos ES) |
| **postprocessing** + **n8ao** (pmndrs) | Oclusão de ambiente de alta qualidade (N8AO), SMAA e bloom | Zlib / CC0 | ✅ npm | Avaliado: o N8AO depende de `three/webgpu`; usado o GTAO do próprio three |
| **three-gpu-pathtracer** + **three-mesh-bvh** | Traçado de caminho progressivo no navegador: modo "Foto" com qualidade de render na mesma cena viva | MIT | ✅ npm | **Em uso:** botão "Foto realista" |
| realism-effects | SSGI, TRAA, motion blur | MIT | ✅ npm | Avaliar depois do r186 (projeto pouco mantido) |
| Blender (`bpy` no PyPI) + Cycles | Renders estáticos e cozimento de luz | GPL | ✅ PyPI | Em uso para fotos e exportação das pessoas |

## 4. Plano de reestruturação

**Fase 1, com three r128 (feita nesta rodada):**

1. Postura corrigida: as pernas mantêm a postura natural do MakeHuman e só os braços saem da pose em A.
2. Captura de movimento CMU nas pernas, quadril e tronco, com fase pela distância e mistura por velocidade.
3. Trajetórias suaves para pessoas e paleteiras.
4. Nível de detalhe por distância.
5. HDRI de galpão (CC0) como ambiente de iluminação e reflexo.
6. Compressão com meshopt: testada e adiada para a Fase 2 (incompatível com malha com esqueleto no r128).
7. Botas e colete corrigidos na exportação: o pé do corpo não atravessa a bota e o recorte do colete fica limpo.

**Fase 2, migração para three r186 (feita):**

1. Scripts globais trocados por módulos ES com `importmap` no jsDelivr.
   - Cores mantidas com `ColorManagement` desligado.
   - Luzes multiplicadas por π, para o modelo de luz física.
2. Oclusão de ambiente GTAO (do próprio three) no lugar do SSAO, mais SMAA e `OutputPass`. O N8AO foi descartado porque depende do build `three/webgpu`.
3. Pessoas comprimidas com meshopt (de 14 MB para 4,7 MB), sem deformação no r186.
4. Botão **Foto realista** com `three-gpu-pathtracer`. Pausa a simulação e monta uma cena própria para o traçado:
   - geometria uniforme em coordenadas do mundo, com as pessoas na pose do momento;
   - só entra o que está no quadro;
   - o refinamento é progressivo e recomeça ao girar a câmera.
   Corrigidos no caminho:
   - estado do GTAO preso;
   - pessoas com esqueleto (a pose é cozida antes de entrar no traçado);
   - materiais de geometria com grupos.

**Fase 3, quando os acervos bloqueados estiverem acessíveis:**

1. Peles texturizadas, sobrancelhas, cílios e cabelos do MPFB2.
2. Texturas PBR da Poly Haven no piso, no papelão e no aço.
3. IK de mãos com `CCDIKSolver`.

## Créditos

- Captura de movimento: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), criada com
  financiamento da NSF EIA-0196217; conversão BVH de Bruce Hahne.
- Personagens: MakeHuman (CC0).
- HDRI: Poly Haven via @pmndrs/assets (CC0).
