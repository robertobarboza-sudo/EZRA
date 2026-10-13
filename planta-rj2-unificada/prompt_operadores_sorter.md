# Prompt — Personagens 3D para Sorter Futurista

## Objetivo

Criar personagens 3D renderizados para representar operadores em um ambiente logístico futurista. A aparência deve ser semelhante à dos personagens de The Sims, com acabamento profissional e movimentação natural e fluida.

## 1. Estilo visual

- Personagens 3D estilizados, com proporções humanas realistas e acabamento de videogame moderno.
- Expressões faciais naturais, olhos expressivos e aparência amigável.
- Texturas de alta qualidade, iluminação cinematográfica e materiais realistas.
- Visual corporativo, adequado para um projeto arquitetônico de centro de distribuição.
- Evitar aparência infantil, caricaturas exageradas ou estética excessivamente robótica.

## 2. Uniforme e EPIs

- Colete refletivo laranja com faixas de alta visibilidade.
- Camiseta cinza ou preta com detalhes laranja.
- Calça cargo operacional cinza-escura.
- Botas de segurança pretas.
- Luvas de proteção adequadas à atividade.
- Crachá de identificação.
- Capacete ou boné de segurança conforme a função e os riscos da área.
- Logotipo corporativo discreto no uniforme.

## 3. Perfis de operadores

Criar personagens variados em gênero, aparência física, tom de pele, cabelo e idade (todos adultos).

Cada personagem deve ter:

- Modelo 3D completo.
- Vistas frontal, lateral e traseira.
- Rig humanoide com esqueleto articulado.
- Malha otimizada para renderização em tempo real.
- Materiais e texturas consistentes entre os personagens.
- Animações reutilizáveis entre diferentes operadores.

## 4. Atividades operacionais

Criar animações para:

- caminhada e deslocamento entre postos;
- retirada e movimentação de caixas;
- leitura de códigos de barras com scanner;
- conferência de volumes em uma estação;
- abastecimento de esteiras;
- triagem e direcionamento de pacotes;
- interação com telas e painéis digitais;
- inspeção visual e acompanhamento da operação.

## 5. Movimentação

A movimentação deve ser suave, contínua e natural, semelhante à de personagens de jogos de simulação.

Requisitos:

- Ciclos de caminhada com transições naturais.
- Movimentos coordenados de braços, pernas, tronco e cabeça.
- Animações de pegar, levantar, girar e posicionar caixas.
- Transições suaves entre estados de animação.
- Sem deslizamento dos pés, movimentos bruscos ou colisões entre personagens.
- Variação de velocidade e orientação conforme a atividade.

## 6. Integração com o ambiente 3D

Os personagens ficam num sorter futurista, com esteiras transportadoras, chutes de separação, estações de leitura, painéis digitais e áreas de abastecimento.

Cada operador fica associado a um posto de trabalho e a uma atividade operacional específica.

## 7. Requisitos técnicos

Preparar os modelos para integração em Unity, Unreal Engine ou aplicação web 3D com Three.js.

- Preferir os formatos GLB/GLTF para aplicações web.
- Usar rig humanoide compatível com animações reutilizáveis.
- Otimizar polígonos, materiais e texturas para renderização em tempo real.
- Separar modelos, animações e materiais quando possível.
- Permitir controle programático da posição, da rotação, da velocidade e do estado de animação.

## Resultado esperado

Um conjunto de operadores 3D estilizados e profissionais, com EPIs adequados, aparência consistente e animações fluidas. Eles ficam integrados a um ambiente logístico futurista para mostrar o funcionamento da operação em tempo real.

## Recomendação técnica

| Componente | Solução sugerida |
|---|---|
| Personagens | Blender para modelagem e rigging |
| Animações | Mixamo ou animações próprias com rig humanoide |
| Visualização operacional | Three.js para web ou Unity para simulação interativa |

A imagem é uma referência visual, não um modelo 3D articulado. Para movimentar os personagens no projeto, são necessários modelos com esqueleto (rig) e animações exportadas, de preferência em GLB/GLTF quando o destino é o navegador.

## Referência visual (imagens enviadas na conversa)

Pranchas "Personagens operadores (estilo The Sims)" e "Operadores (estilo The Sims)":

- **Perfis:** operadora de triagem, operador de sorter, operador de conferência e operadora de embalagem. Vistas de frente, lado e costas.
- **Uniforme:**
  - colete laranja com duas faixas refletivas horizontais e uma vertical, e o logotipo "S" no peito e nas costas;
  - camiseta polo cinza-escura com mangas e gola com detalhe laranja;
  - calça cargo cinza-escura com bolsos laterais e detalhes laranja;
  - luvas pretas e botas de segurança pretas;
  - crachá pendurado no pescoço;
  - boné cinza-escuro em parte dos operadores.
- **Atividades mostradas:** movimentação de caixa, conferência no terminal, leitura de código com scanner, abastecimento com carrinho de gaiola, triagem nas rampas e visão geral da operação.
- **Ambiente:**
  - rampas laranja, esteiras cinza-escuras e piso cinza claro com faixas amarelas;
  - painel "SORTER 01" com pacotes/hora, taxa de acerto e status;
  - parede com a marca em laranja.

## Como isto entra na maquete (planta-rj2-unificada)

As pessoas da maquete já são humanos MakeHuman com esqueleto. A caminhada e a postura vêm da captura de movimento CMU e são misturadas por velocidade, sem deslizar os pés.

O uniforme acima é aplicado no navegador, sobre os materiais das pessoas:
- colete laranja com faixas refletivas;
- camiseta e calça cinza-escuras;
- luvas e botas pretas;
- boné cinza-escuro.

Para chegar ao estilo The Sims no rosto e no cabelo, o caminho é trocar os modelos por personagens feitos no Blender, com o mesmo rig humanoide, e exportar em GLB.
