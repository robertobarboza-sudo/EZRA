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
| **A–F** | Premissas | 92 | `PROCESSO · POR WS · PHD · NOMINAL · PRIORIZAÇÃO · MACRO` |
| **G–P** | Forecast | 2.013 | `date · destination · origin_type · direct · transhipment · total · key · APOIO` |
| **Q–V** | Curva Line Haul | 168 | `HORA · CURVA · % CURVA · NÚM_DIA · DIA` |
| **W–AB** | Curva First Mile | 168 | idem |

### 2.1 Premissas (A–F) — três tipos de linha no mesmo bloco

As 92 linhas não são todas processo operacional. Há três naturezas misturadas:

**a) Postos de trabalho** (~66 linhas) — MACRO = `ASM`, `INBOUND LH`, `INBOUND FM`,
`ESTEIRA`, `ESTEIRA TERMO`, `EXPEDIÇÃO HUB`, `EXPEDIÇÃO SOC`, `TINTA`, `REVERSA`,
`TRANSIÇÃO`. Dividem-se em dois tipos, e **a diferença define a fórmula**:

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

## 3. Como o modelo calcula

```
1. demanda(dia, hora, fluxo) = Σ_origens[APOIO = fluxo] total(dia, origem) × %curva_fluxo(dia_semana, hora)

2. roteamento:  demanda_ASM     = demanda × 85%        (PERFIL)
                demanda_ESTEIRA = demanda × 15%

3. por posto direto:   HC(processo, hora) = CEIL(demanda_hora ÷ PHD) × POR WS
   por posto indireto: regra a definir (§4.2)

4. restrições:  Σ HC alocado ≤ HC disponível da escala        ← falta esse dado
                HC(processo) ≤ recurso instalado (bloco ATIVO)
                ordem de corte quando falta gente = PRIORIZAÇÃO (1 → 2 → 3)

5. gap(hora) = demanda(hora) − capacidade instalada(hora)
```

## 4. O que falta pro modelo fechar

Em ordem de impacto:

**1. HC disponível por dia × turno (a escala).** É a etapa 1 do modelo e o teto de
tudo — não existe na aba. O bloco `ATIVO` tem recurso *físico* (docas, PDAs,
esteiras), não gente. Sem isso o modelo calcula o **necessário**, mas não
consegue dizer o que cabe. Sugestão: um 5º bloco (AD–AG) com
`DATA · TURNO · HC DISPONÍVEL · OBS`.

**2. Regra dos 39 postos indiretos (sem PHD).** Eles têm `POR WS` mas não escalam
com volume. Três caminhos possíveis — qual é o certo?
   - `POR WS` × nº de estações abertas do processo âncora do mesmo MACRO;
   - proporção fixa do HC do MACRO;
   - valor fixo por turno (posição fixa).

**3. Min/máx por processo.** Você citou "cada processo macro tem um mínimo e um
máximo de pessoas", mas a aba não tem essas colunas. É derivado de `POR WS` ×
recurso instalado, ou são dois números novos a preencher?

**4. `PRIORIZAÇÃO` vazia em 25 processos** (valor `-`) e `0` em 1. Significa "não
prioriza", "não roda", ou "preencher depois"? É o que decide quem é cortado
primeiro quando o HC não dá.

**5. Curva First Mile sem domingo.** As 24 linhas de domingo existem com `HORA`,
`CURVA` e `DIA`, mas `% CURVA` está vazio — FM não opera domingo, ou faltou
preencher?

## 5. O que a tela precisa entregar

1. **Plano do dia/turno**: demanda hora a hora por fluxo, HC necessário por
   processo, HC disponível, gap.
2. **Ajustar e ver o efeito na hora**: HC por processo, total da escala, e
   simular forecast diferente.
3. **Gargalo explícito**: qual processo trava a hora, e quanto de HC resolve.
4. **Premissa ≠ resultado**: forecast (companhia) e curva (histórico) entram como
   leitura; escala e alocação são nossas e voltam pra aba `bat`.

---

*Ancorado no conteúdo real da aba `bat` em 2026-09-03: 92 premissas, 2.013 linhas
de forecast (358 datas), 2 curvas de 168 linhas. Turnos T1/T2/T3 e cutoff 06h
seguem o padrão do resto do PULSO.*
