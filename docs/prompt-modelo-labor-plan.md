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

- **Direto** (53 com PHD): dimensionado por volume.
  `HC = CEIL(demanda_hora ÷ PHD) × POR WS`
  Ex.: `BEEP LH` PHD 4.355 · `INDUÇÕES NÍVEL 3` PHD 1.584 · `PESCA ESTEIRA` PHD 352.
- **Indireto / apoio** (39 sem PHD): não escala com volume, escala com estrutura.
  Ex.: `GAIOLEIRO`, `FISCAL DE PÁTIO`, `GOLEIRO ESTEIRA`, `TRIAGEM SACAS VAZIAS`.
  Tem `POR WS` mas não tem PHD — precisa de uma regra própria (ver §4, ponto 2).

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

O ponto que muda o modelo: **as escalas se sobrepõem**. Não são 3 turnos
estanques — são 5 escalas com janelas próprias, e em algumas horas duas convivem:

| Escala | Janela | Observação |
|---|---|---|
| `T1A` | 06h–14h | |
| `T1B` | — | coluna existe, **sem nenhum valor** |
| `T2` | 12h–21h | sobrepõe T1A das 12h às 14h |
| `T4` | 19h–03h | sobrepõe T2 das 19h às 21h |
| `T3` | 22h–05h | sobrepõe T4 das 22h às 03h |

`QUADRO FIXO` (AN) é a soma das escalas ativas naquela hora — **confere nas 168
linhas, sem divergência**. É por isso que o quadro salta de 459 (só T1A) para 963
às 12h (T1A + T2) e cai para 504 às 15h (só T2).

`FOLGAS` (AO) segue a mesma lógica de soma por escala ativa na hora.

A coluna `TURNO` (AH) é o **turno operacional** (T1/T2/T3, 8h cada) — não confundir
com as colunas de escala T1A/T2/T4/T3, que são outra coisa apesar do nome parecido.

## 3. Como o modelo calcula

```
1. demanda(dia, hora, fluxo) = Σ_origens[APOIO = fluxo] total(dia, origem) × %curva_fluxo(dia_semana, hora)

2. roteamento:  demanda_ASM     = demanda × 85%        (PERFIL)
                demanda_ESTEIRA = demanda × 15%

3. por posto direto:   HC(processo, hora) = CEIL(demanda_hora ÷ PHD) × POR WS
   por posto indireto: regra a definir (§4.2)

4. restrições:  Σ HC alocado(hora) ≤ QUADRO FIXO(dia, hora)    ← bloco AC–AO
                HC(subprocesso) ≤ recurso instalado (bloco ATIVO)
                ordem de corte quando falta gente = PRIORIZAÇÃO (1 → 2 → 3)

5. gap(hora) = demanda(hora) − capacidade instalada(hora)
```

O teto é **por hora**, não por turno — nas horas de sobreposição (12–14h, 19–21h,
22–03h) há mais gente na casa, e o modelo pode alocar mais ali.

## 4. O que falta pro modelo fechar

**1. `QUADRO FIXO` é bruto ou líquido?** Ou seja: das 459 pessoas do T1A na
segunda, as 141 de `FOLGAS` já estão fora (efetivo = 459) ou ainda dentro
(efetivo = 318)? É a diferença entre planejar com 459 ou com 318 — nada mais no
modelo muda tanto o resultado.

**2. Regra dos 39 subprocessos indiretos (sem PHD).** Eles têm `POR WS` mas não
escalam com volume. Três caminhos possíveis — qual é o certo?
   - `POR WS` × nº de estações abertas do subprocesso âncora do mesmo MACRO;
   - proporção fixa do HC do MACRO;
   - valor fixo por turno (posição fixa).

**3. Min/máx por macro.** Você citou que cada processo macro tem mínimo e máximo
de pessoas, mas não há essas colunas. É derivado (`POR WS` × recurso instalado),
ou são dois números novos a preencher por macro?

**4. `PRIORIZAÇÃO` vazia em 25 subprocessos** (valor `-`) e `0` em 1. Significa
"não prioriza", "não roda", ou "preencher depois"? É o que decide quem é cortado
primeiro quando o HC não dá.

**5. Curva First Mile sem domingo.** As 24 linhas de domingo existem com `HORA`,
`CURVA` e `DIA`, mas `% CURVA` está vazio — FM não opera domingo, ou faltou
preencher?

**6. Cobertura desigual entre blocos.** O forecast tem o ano inteiro (358 datas),
o quadro tem **1 semana** (31/08–06/09). Fora dessa semana o modelo não tem
escala pra comparar. O quadro se repete por dia da semana, ou vai ser preenchido
data a data?

**7. `T1B` está vazia** e `DIA` vem em inglês no quadro (`Monday`) mas em
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
