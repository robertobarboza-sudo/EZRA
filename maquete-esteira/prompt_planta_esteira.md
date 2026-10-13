# Prompt — Maquete 3D da Planta das Esteiras (RJ2)

## Objetivo

Criar uma maquete 3D interativa e viva da planta de separação com 3 esteiras do centro de distribuição RJ2. Os colaboradores aparecem trabalhando, os pacotes correm nas esteiras e os indicadores de produção são calculados em tempo real. Ela serve para entender, ajustar e apresentar a operação.

## 1. Estilo visual

- Maquete 3D realista, com renderização no estilo Unreal: iluminação global em tela, antisserrilhado temporal, bloom e profundidade de campo.
- Piso de concreto cinza claro, voltado para o claro, com manchas suaves e juntas de dilatação.
- Demarcações de piso: faixas amarelas de corredor, setas de fluxo e caminho seguro de pedestres em verde bem escuro, sem grade.
- Textos pintados no piso e placas suspensas identificando cada área.
- Modo "Foto realista" com traçado de caminho (path tracing) da cena no momento.
- Painel de controle claro, com tipografia técnica e tema claro/escuro.

## 2. Layout da planta (posições fiéis à planta RJ2)

- **3 esteiras:** Termoplástica, Lona 01 e Lona 02. Cada uma tem 62,5 m, 1,65 m de largura e 0,9 m/s.
- **Indução:** 8 m no começo de cada esteira.
- **5 bancadas (ilhas) por lado.** Cada ilha tem:
  - flow rack de 2,5 × 3,3 m;
  - scuttles de 1,20 × 1,00 × 2,00 m;
  - corredor de paleteira de 3 m entre ilhas.
- **Goleiro** no fim da esteira, com flow rack de 1,8 m, 4 gaiolas e gaiola de avarias.
- **Oeste:**
  - entrada (docas);
  - buffer de scuttles e gaiolas cheias (área amarela);
  - buffer de gaiolas vazias (área vermelha);
  - banheiros.
- **Sudoeste:** 1 robô de stretch (base redonda, mastro de 1,1 m, percurso circular) e 2 posições de montagem e stretch manual.
- **Leste:** saída/descarga de scuttles e gaiolas, nas docas.
- **Sul:**
  - caminho seguro de pedestres de até 1,4 m;
  - mesa da liderança;
  - tratativa de avarias;
  - passagem de scuttles.

## 3. Pessoas

- Humanos MakeHuman com esqueleto completo, vários gêneros, tons de pele, cabelos e alturas.
- Uniforme operacional: colete refletivo, camiseta, calça, botas e luvas. Boné conforme a função.
- Caminhada por captura de movimento (CMU), misturada pela velocidade real, sem deslizar os pés.
- Braços e tronco seguem a tarefa: alcançar, carregar caixa, empurrar gaiola, puxar paleteira.
- Ao clicar numa pessoa, aparece um balão com a função, o local e o que ela está fazendo.

## 4. Funções e atividades

| Função | Atividade |
|---|---|
| Indução | Tira a gaiola vazia, põe a gaiola cheia e induz os pacotes na esteira |
| Pescador | Pesca o pacote da esteira para o flow rack da sua ilha |
| Separador | Separa do flow rack para a scuttle do destino |
| Goleiro | Pega o que passou das ilhas e separa as avarias |
| Paleteiro | Tira a scuttle cheia e põe a scuttle vazia, com paleteira |
| Setup de gaiolas | Repõe as gaiolas da indução |
| Recebimento | Doca → buffer de gaiolas cheias; gaiolas vazias → doca |
| Abastecimento | Leva gaiolas e scuttles dos buffers da planta às linhas |
| Montagem e stretch | Monta a caixa no pallet; o robô ou 2 pessoas passam o filme stretch |
| Saída | Leva a scuttle cheia à doca de saída |
| Tratativa de avarias | Busca a gaiola de avarias do goleiro e trata os volumes |
| Liderança | Acompanha a operação na mesa |

## 5. Premissas (editáveis no painel, aba Premissas)

| Premissa | Valor |
|---|---|
| Capacidade por esteira | 3.000 pct/h, ineficiência de 15% |
| Volume no goleiro | 10%, sendo 5% de avarias |
| PHD (pacotes por hora por pessoa) | indução 350, pescador 600, separador 300, goleiro 350 |
| Scuttle | 46 volumes, ocupação útil de 90%, troca com 85% cheia |
| Gaiola | 45 volumes, altura de 1,7 m |
| Indução | 4 pessoas por lado |
| Por ilha | 1 pescador e 1 separador |
| Por lado | 3 paleteiros e 3 de setup |
| Goleiros | 2 |
| Planta | recebimento 4, abastecimento de gaiolas 4, abastecimento de scuttles 12, saída 6 |
| Montagem e stretch | 1 robô (30 s), stretch manual 2 (20 s de montagem + 80 s de stretch), operador do robô 1 |
| Tratativa e liderança | tratativa 2 (25 s por volume), liderança 2 |
| Velocidades | pessoa 1,3 m/s; paleteira e gaiola 1,1 m/s |

## 6. Painel e indicadores

- **Card "Produção por esteira"** (abre e fecha): pacotes/h atual, acumulado do turno e goleiro, por esteira.
- **Aba Operação:**
  - tabela por esteira: induzidos/h, saída/h, pesca, separados, goleiro, goleiro %, trocas de scuttle e de gaiola, expedidas;
  - barras por bancada em volumes/h dos últimos 10 minutos.
- **Aba Premissas:** todas as premissas editáveis. A planta é remontada com os novos valores.
- **Aba Planta:** título, fluxo do processo e especificações.
- **Câmeras:** Aérea, Eixo, Planta, Ilha, Indução, Goleiro, Buffer de saída, Buffer de gaiolas, Recebimento, Montagem/stretch, Caminho seguro, Avarias e Seguir paleteira.
- **Seletor de esteira:** a mesma vista em outra esteira.
- **Simulação:** velocidade 1×, 2×, 4× e 8×, pausa, qualidade (leve, alta, cinema), cotas, fantasma e exportação.

## 7. Requisitos técnicos

- three.js r186 com WebGPU (com retorno automático para WebGL2) e pós-processamento em nós TSL: SSGI, TRAA, bloom, motion blur e profundidade de campo.
- Pessoas em glTF com compressão meshopt; HDRI de galpão para iluminação e reflexos.
- Simulação por eventos com tarefas encadeadas, rotas por corredores e trajetórias suaves.
- Fontes em `maquete-esteira/src/`; `build.sh` gera um único `index.html`.

## Resultado esperado

Uma maquete viva da planta das 3 esteiras, fiel às posições da planta RJ2, com pessoas realistas trabalhando, pacotes e unitizadores em movimento e indicadores coerentes com as premissas. Ela deve permitir ver a operação de qualquer ângulo e testar mudanças de dimensionamento.

Link atual: https://claude.ai/artifact/E2sk3hkZsjYAoZGX71QVwy
