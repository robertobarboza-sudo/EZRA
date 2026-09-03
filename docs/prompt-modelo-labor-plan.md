# Modelo de Labor Plan — aba `bat`

> Especificação do modelo de planejamento de mão de obra do COP RJ2, escrita em
> cima do **input real** da aba `bat` (2.014 linhas, 4 blocos de colunas).

---

## 1. Objetivo

> **Com o HC que a escala me dá, quanto de capacidade eu consigo instalar, e isso
> cobre o forecast hora a hora?**

```
RECURSOS (o que eu tenho)  →  DEMANDA (o que vai chegar)  →  CAPACIDADE (o que entrego)
   HC da escala                 forecast × curva              HC por processo, por hora
   + recursos instalados        por fluxo (LH / FM)           respeitando priorização
```

## 2. O que a aba `bat` já tem

Quatro blocos de colunas lado a lado, cada um com sua própria altura:

| Colunas | Bloco | Linhas | Conteúdo |
|---|---|---|---|
| **A–F** | Premissas (subprocessos) | 92 | `PROCESSO · POR WS · PHD · NOMINAL · PRIORIZAÇÃO · MACRO` |
| **G–P** | Forecast | 2.013 | `date · destination · origin_type · direct · transhipment · total · key · APOIO` |
| **Q–V** | Curva Line Haul | 168 | `HORA · CURVA · % CURVA · NÚM_DIA · DIA` |
| **W–AB** | Curva First Mile | 168 | idem |
| **AC–AO** | Quadro (escala) | 168 | `DATA · DIA · SOC · HORA · TURNO · T1A · T1B · T2 · T4 · T3 · QUADRO FIXO · FOLGAS` |

### 2.1 Premissas (A–F) — subprocessos, cada um vinculado a um macro

Cada linha é um **subprocesso**; a coluna `MACRO` (F) diz a qual processo macro
ele pertence. As 92 linhas têm três naturezas misturadas:

**a) Subprocessos operacionais** (~66 linhas) — MACRO = `ASM`, `INBOUND LH`,
`INBOUND FM`, `ESTEIRA`, `ESTEIRA TERMO`, `EXPEDIÇÃO HUB`, `EXPEDIÇÃO SOC`,
`TINTA`, `REVERSA`, `TRANSIÇÃO`. Dividem-se em dois tipos, e **a diferença define
a fórmula**:

- **Direto** (53 com PHD): atua em área que define capacidade efetiva.
  Consome HC **e** entrega capacidade.
  Ex.: `BEEP LH` PHD 4.355 · `INDUÇÕES NÍVEL 3` PHD 1.584 · `PESCA ESTEIRA` PHD 352.
- **Indireto / apoio** (39 sem PHD): atua dentro do processo, mas **não em área que
  define capacidade efetiva**. Consome HC (entra na distribuição de labor) e
  **não soma capacidade nenhuma**.
  Ex.: `GAIOLEIRO`, `FISCAL DE PÁTIO`, `GOLEIRO ESTEIRA`, `TRIAGEM SACAS VAZIAS`.

A consequência é importante: **PHD vazio não é dado faltando** — é a marca de que
aquele subprocesso não gera capacidade. O modelo trata os dois grupos igual na
hora de consumir HC, e diferente na hora de somar capacidade.

**b) Recursos instalados** (MACRO = `ATIVO`, 15 linhas) — o teto físico da casa:
`MÁX DOCAS IN` 29 · `MÁX DOCAS OUT` 13 · `BEEP LH T1/T2/T3` 18 cada · `PDA` 78 ·
`ESTEIRAS` 2 · `MANUAIS` 5 · `MÁX FILA FM` 20 · `CAP STAGE IN/OUT` ·
`TEMPO DE FILA/DESCARGA TARGET FM`.

**c) Parâmetros de modelo** (MACRO = `PERFIL`, `OEE`, `SPR`, `INDICADOR`, `MINUTOS`):
- `PERFIL` — **roteamento e mix**: `DEMANDA ASM` 85% / `DEMANDA ESTEIRA` 15%
  (soma 100%) e perfil de pacote `P` 40% / `M` 45% / `G` 9% / `BULKY` 6% (soma 100%).
- `OEE` — `CAPACIDADE ASM` 27.371 · `CAPACIDADE ESTEIRA` 2.534.
- `SPR OUT` 6.224 · `PRODUTIVIDADE OVERALL` 629 · `ATENDIMENTO SODEXO` 240 min.

### 2.2 Forecast (G–P) — ano inteiro, por data × origem

2.013 linhas cobrindo **358 datas** (02/01 a 31/12/2026), 7 origens: `FMH`,
`INTER-SOC`, `CB`, `BIG SELLER`, `PUDO SVP`, `SOC`, `FULL`. Cada linha traz
`direct` + `transhipment` = `total`.

A coluna **`APOIO`** é a peça que liga forecast e curva: classifica cada linha em
**`HUB`** (1.074) ou **`FM`** (939) — ou seja, qual fluxo aquele volume percorre.

### 2.3 Curvas (Q–V e W–AB) — 24h × 7 dias, por fluxo

168 linhas cada = 24 horas × 7 dias da semana, com `% CURVA` já calculado.
Somas conferidas: **fecham 100% por dia** (variação de ±0,04pp, arredondamento).

### 2.4 Quadro (AC–AO) — a escala, hora a hora

168 linhas = 7 dias (31/08 a 06/09/2026) × 24 horas, na ordem do cutoff (6h→5h).

O ponto que muda o modelo: **as escalas se sobrepõem por desenho**. A escala é
**5x2 com jornada de 9h45**, então o time do turno seguinte entra ainda dentro da
janela do anterior — a sobreposição é a virada de turno, não erro de dado. São 5
escalas com janelas próprias, e em algumas horas duas convivem:

| Escala | Janela | Horas de relógio | Observação |
|---|---|---|---|
| `T1A` | 06h–14h | 9 | |
| `T1B` | — | — | coluna existe, **sem nenhum valor** |
| `T2` | 12h–21h | 10 | sobrepõe T1A das 12h às 14h |
| `T4` | 19h–03h | 9 | sobrepõe T2 das 19h às 21h |
| `T3` | 22h–05h | 8 | sobrepõe T4 das 22h às 03h · **janela menor por lei** |

O `T3` cobrir só 8 horas de relógio não é dado faltando: é a **hora noturna
reduzida** (CLT art. 73 §1º — das 22h às 5h a hora conta como 52min30). Com a
hora valendo menos tempo de relógio, a mesma jornada de 9h45 se completa em menos
horas presentes. Consequência prática pro planejamento: **cobrir a madrugada
custa mais HC por hora de operação** do que cobrir o mesmo intervalo de dia.

`QUADRO FIXO` (AN) é a soma das escalas ativas naquela hora — **confere nas 168
linhas, sem divergência**. É por isso que o quadro salta de 459 (só T1A) para 963
às 12h (T1A + T2) e cai para 504 às 15h (só T2).

`FOLGAS` (AO) segue a mesma lógica de soma por escala ativa na hora — mas **não é
a rotação da 5x2**. Testado isolando as horas em que só uma escala está ativa:

| Escala | Folgas por dia na semana | Soma | Esperado numa 5x2 |
|---|---|---|---|
| `T1A` | 141 · 118 · 12 · 10 · 0 · 145 | 426 | ~918 (2 × 459) |
| `T2` | 112 · 3 · 72 · 126 · 101 · 232 · 50 | 696 | ~1.120 |
| `T3` | 99 · 66 · 66 · 158 · 157 · 271 · 24 | 841 | ~1.176 |

Numa 5x2 toda escala teria ~28,6% de folga **todo dia**, sem variação. O real
oscila de 0% (T1A na sexta) a 65% (T2 no domingo), e a soma da semana dá 46–72%
do que a rotação exigiria. `FOLGAS` é outra coisa: **ausência programada**
(férias, folga pedida, banco de horas), com preenchimento ainda irregular.

São **duas camadas diferentes**, e as duas valem:

- `QUADRO FIXO` já é quem está **escalado** naquele dia — a rotação da 5x2 já está
  refletida nele (por isso o domingo encolhe: T2 cai de 560 para 77, T3 de 588
  para 212, em vez de manter número cheio com folga alta).
- `FOLGAS` é **ausência programada** por cima disso (férias, folga pedida, banco
  de horas) — gente escalada que não vai estar lá.

```
HC efetivo(dia, hora) = QUADRO FIXO − FOLGAS
```

Ex.: segunda no T1A → 459 − 141 = **318** pessoas de verdade. Sexta → 446 − 0 = 446.

A coluna `TURNO` (AH) é o **turno operacional** (T1/T2/T3, 8h cada) — não confundir
com as colunas de escala T1A/T2/T4/T3, que são outra coisa apesar do nome parecido.

## 3. Como o modelo calcula

### 3.1 A unidade de decisão: quantas instâncias do macro rodar

Não existe min/máx como número solto. O que existe é: **o macro roda em N
instâncias**, e tudo escala linear com N.

```
HC(macro, N)         = Σ_subprocessos (POR WS)         × N
capacidade(macro, N) = Σ_subprocessos_com_PHD (PHD)    × N        ← indiretos entram com 0
```

Rodou 1 esteira, conta os subprocessos ×1; rodou 2, ×2; e assim por diante. Daí
saem naturalmente o mínimo e o máximo do macro:

```
mínimo = HC(macro, 1)          ← o macro roda, ou não roda
máximo = HC(macro, N_instalado) ← N_instalado vem do bloco ATIVO (ex.: ESTEIRAS = 2)
```

**N é a variável que o planejamento decide.** É isso que a tela precisa deixar
ajustar: quantas instâncias de cada macro abrir, dado o HC que a escala permite.

### 3.2 A conta, ponta a ponta

```
1. demanda(dia, hora, fluxo) = Σ_origens[APOIO = fluxo] total(dia, origem) × %curva_fluxo(dia_semana, hora)

2. roteamento:  demanda_ASM     = demanda × 85%        (PERFIL)
                demanda_ESTEIRA = demanda × 15%

3. escolhe N por macro  →  HC(macro, N) e capacidade(macro, N)   (§3.1)

4. restrições:  Σ_macros HC(macro, N) ≤ HC efetivo(dia, hora)   ← QUADRO FIXO − FOLGAS
                N ≤ N_instalado (bloco ATIVO)
                ordem de corte quando falta gente = PRIORIZAÇÃO (1 → 2 → 3)

5. gap(hora) = demanda(hora) − Σ capacidade(macro, N)
```

O teto é **por hora**, não por turno — nas horas de sobreposição (12–14h, 19–21h,
22–03h) há mais gente na casa, e o modelo pode alocar mais ali.

## 4. Pontas soltas (não bloqueiam o cálculo)

**1. `PRIORIZAÇÃO` vazia em 25 subprocessos** (valor `-`) e `0` em 1. Significa
"não prioriza", "não roda", ou "preencher depois"? É o que decide quem é cortado
primeiro quando o HC não dá.

**2. Curva First Mile sem domingo.** As 24 linhas de domingo existem com `HORA`,
`CURVA` e `DIA`, mas `% CURVA` está vazio — FM não opera domingo, ou faltou
preencher?

**3. Cobertura desigual entre blocos.** O forecast tem o ano inteiro (358 datas),
o quadro tem **1 semana** (31/08–06/09). Fora dessa semana o modelo não tem
escala pra comparar. O quadro se repete por dia da semana, ou vai ser preenchido
data a data?

**4. `T1B` está vazia** e `DIA` vem em inglês no quadro (`Monday`) mas em
português nas curvas (`SEGUNDA`) — detalhe de join, resolvo no código.

## 5. O que a tela precisa entregar

1. **Plano do dia/turno**: demanda hora a hora por fluxo, HC necessário por
   processo, HC disponível, gap.
2. **Ajustar e ver o efeito na hora**: HC por processo, total da escala, e
   simular forecast diferente.
3. **Gargalo explícito**: qual processo trava a hora, e quanto de HC resolve.
4. **Premissa ≠ resultado**: forecast (companhia) e curva (histórico) entram como
   leitura; escala e alocação são nossas e voltam pra aba `bat`.

---

*Ancorado no conteúdo real da aba `bat` em 2026-09-03: 92 subprocessos, 2.013 linhas
de forecast (358 datas), 2 curvas de 168 linhas e o quadro de 168 linhas (7 dias).
Turnos T1/T2/T3 e cutoff 06h
seguem o padrão do resto do PULSO.*
