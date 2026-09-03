# Prompt — Modelo de Labor Plan (aba `bat` + app Olho de Deus)

> Documento de especificação **e** prompt reutilizável. Descreve o modelo de
> planejamento de mão de obra do COP RJ2: de onde vem cada dado, como os três
> blocos se ligam, e o que a tela precisa deixar ajustar.

---

## 1. Objetivo

Montar o planejamento de um dia/turno respondendo a uma pergunta só:

> **Com o HC que a escala me dá, quanto de capacidade eu consigo instalar, e isso
> cobre o forecast hora a hora?**

O plano nasce de três blocos, nessa ordem — cada um restringe o próximo:

```
RECURSOS (o que eu tenho)  →  DEMANDA (o que vai chegar)  →  CAPACIDADE (o que eu consigo entregar)
   HC da escala                 forecast × curva              alocação por processo macro
   por dia e turno              por origem, por hora          respeitando min/max de cada um
```

## 2. Quem é dono de cada dado

Isso define o que é **editável na tela** e o que é **só leitura**:

| Dado | Origem | Editável? |
|---|---|---|
| **Forecast** (volume por origem) | Setado pela **companhia** | Não — entra como está; a tela permite simular por cima, sem sobrescrever |
| **Curva de chegada** (share por hora) | Vem do **histórico** | Não no dia a dia; recalculada periodicamente. Ajuste manual é exceção e fica registrado |
| **Escala / HC disponível** | Definido por **nós** | Sim |
| **Capacidade instalada** (posições, PHD, min/max por processo) | Definido por **nós** | Sim |

Regra que decorre disso: **simular ≠ salvar**. A tela deixa mexer em tudo pra ver
o efeito, mas só grava o que é nosso (escala e capacidade). Forecast e curva
voltam ao valor de origem quando a simulação é descartada.

## 3. Os três blocos

### 3.1 Recursos — quanto HC eu tenho

Ponto de partida. A escala do dia diz quantas pessoas existem por **dia × turno**
(turnos do padrão PULSO: T1 06–13h, T2 14–21h, T3 22–05h; dia operacional com
cutoff às 06h).

A partir do HC total, decide-se **quais processos macro rodar** — porque cada
processo tem um **mínimo** (abaixo disso não faz sentido abrir) e um **máximo**
(acima disso não cabe mais gente na posição). Os processos macro já existem hoje
na aba `config`, com PHD por processo: `ASM`, `INBOUND LH`, `INBOUND FM`,
`ESTEIRA`, `ESTEIRA TERMO`, `EXPEDIÇÃO HUB`, `EXPEDIÇÃO SOC`, `TINTA`, `REVERSA`.

> **Restrição dura:** `Σ HC alocado ≤ HC disponível da escala`, e por processo
> `min ≤ HC alocado ≤ max` (ou zero, se o processo não roda no turno).

### 3.2 Demanda — quanto vai chegar, e quando

Duas camadas:

1. **Volume por origem** (o forecast da companhia). As origens reais hoje são
   `FMH`, `INTER-SOC`, `CB`, `BIG SELLER`, `PUDO SVP`, `SOC`, `FULL`.
2. **Curva de chegada** — o share que distribui esse volume ao longo das horas,
   por **dia da semana × turno × hora**. Vem do histórico.

```
demanda(hora) = Σ_origem [ forecast(dia, origem) × curva(dia_semana, turno, hora) ]
```

A curva é o que transforma um número do dia numa necessidade hora a hora — sem
ela o plano vira média, e média esconde o pico que quebra a operação.

### 3.3 Capacidade — quanto eu consigo entregar

Para cada processo macro:

```
capacidade(processo, hora) = HC alocado × PHD(processo)
```

O plano fecha quando, para cada hora, a capacidade instalada cobre a demanda
daquela hora — respeitando o teto de HC da escala. Onde não cobrir, o modelo
mostra o **gap** (em unidades e em HC equivalente), que é o pedido de ajuste:
mais gente, outro turno, ou aceitar backlog.

## 4. Estrutura da aba `bat`

**Uma aba só, uma tabela só** — a coluna `bloco` diz o que a linha é (mesmo
padrão já usado no `kanban_input`). Isso mantém tudo num lugar, editável na mão,
e trivial de ler pela API.

Cabeçalho (linha 1):

```
bloco | data | dia_semana | turno | hora | macro | origem | valor | min | max | obs
```

Como cada bloco preenche:

| `bloco` | Preenche | `valor` significa | Exemplo |
|---|---|---|---|
| `escala` | `data`, `turno` | HC disponível | `escala \| 2026-09-04 \| \| T1 \| \| \| \| 110` |
| `processo` | `macro`, `min`, `max` | PHD (un/h por pessoa) | `processo \| \| \| \| \| ASM \| \| 1584 \| 4 \| 24` |
| `recurso` | `macro` | posições instaladas | `recurso \| \| \| \| \| ASM \| \| 24` |
| `forecast` | `data`, `origem` | volume (un) | `forecast \| 2026-09-04 \| \| \| \| \| CB \| 27973` |
| `curva` | `dia_semana`, `turno`, `hora` | peso (0–1 ou %) | `curva \| \| QUI \| T1 \| 8 \| \| \| 0,12` |

Regras:

- **Célula vazia é vazia, não zero.** Faltou dado, o modelo avisa — não assume 0.
- `data` em `YYYY-MM-DD`; `hora` em 0–23 (cutoff 06h→05h); `dia_semana` como
  `SEG…DOM`.
- Número com vírgula decimal, sem separador de milhar.
- A soma dos pesos da curva de um mesmo `dia_semana × turno` deve fechar em 100%;
  se não fechar, a tela mostra o desvio em vez de normalizar em silêncio.
- Linha nova = registro novo. Não se reaproveita linha de outro bloco.

## 5. O que a tela precisa entregar

1. **Ver o plano do dia/turno**: HC disponível, HC alocado, demanda prevista,
   capacidade instalada, gap — hora a hora e no consolidado.
2. **Ajustar e ver o efeito na hora**: mexer no HC por processo (respeitando
   min/max), no total da escala, e simular forecast diferente.
3. **Enxergar o gargalo**: qual processo trava a linha naquela hora, e quanto de
   HC resolveria.
4. **Deixar claro o que é premissa e o que é resultado** — número que veio da
   companhia/histórico não se confunde com número que nós definimos.
5. **Salvar só o que é nosso**: escala e capacidade voltam pra aba `bat`;
   forecast e curva, não.

## 6. Fora do escopo desta primeira versão

- Escala nominal por pessoa (nome, matrícula) — o modelo trabalha com **HC
  agregado** por turno, não com alocação individual.
- Absenteísmo e turnover como variável separada — por ora entram já descontados
  no HC disponível da escala.
- Reescrita da aba `config` — os processos macro e PHD continuam vindo de lá; a
  aba `bat` guarda só o que é do planejamento (min/max, escala, forecast, curva).

---

*Base real usada pra ancorar o modelo: `config` (processos macro + PHD),
`forecast_backlog_pulso` (origens e volumes), turnos T1/T2/T3 e cutoff 06h do
padrão PULSO.*
