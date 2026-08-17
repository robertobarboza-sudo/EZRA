/**
 * PULSO — Árvore de KPI's (aba árvore_pulso, gid 25033403).
 *
 * Substitui a antiga "Árvore (daily)", que era um espelho ESTÁTICO colado
 * dentro do index.html. Agora os dados vêm ao vivo da planilha (pedido do
 * Roberto em 2026-08-13, junto com o mockup React "arvore-kpis").
 *
 * A aba é longa (1 linha por Data × KPI, ~70 mil linhas) com as colunas:
 *   Data | Bloco | PIC | Sub Bloco | KPI | Target | Semana | Valor | Observação | Link
 * "Data" guarda tanto data ISO (2026-01-07) quanto rótulo de semana (W2) —
 * as duas coisas viram colunas na tabela final, por isso ficam no mesmo
 * dicionário `valores` (chave = a própria Data).
 *
 * Helper (prefixo _) de propósito: o plano Hobby da Vercel limita em 12
 * funções serverless e o projeto já está no teto, então isso entra como
 * módulo de api/overview.js (modo ?arvore=1), não como endpoint próprio —
 * mesmo padrão de ?esteira=1 (cluster) e ?monitor=1 (outbound).
 */
const { fetchTabByGid, fetchTabRawValues, batchUpdateValues, updateRangeRaw } = require('./_google');

const ARVORE_SHEET = { spreadsheetId: '1BqZElDRwVaGpDYZzHTq9UQvVLy2guRVfTdvwGHL1qC4', gid: '25033403' };

// Unidade e direção (maior-melhor / menor-melhor) NÃO existem na planilha —
// a coluna Target é só um número. Essa tabela reproduz a classificação do
// convert_data.py do mockup que o Roberto aprovou, pra página nova mostrar
// os mesmos status/cores que ele viu. Chave = Bloco|PIC|Sub Bloco|KPI.
// Valor = 2 letras: [n]umber/[p]ercent + higher/[l]ower/near_[z]ero better.
// KPI que aparecer na planilha e não estiver aqui cai no heurístico abaixo.
const ARVORE_META = {
  "Pessoas|Ingryd (HSE)|ACA|Total":"nh",
  "Pessoas|Ingryd (HSE)|ACA|Inbound":"nh",
  "Pessoas|Ingryd (HSE)|ACA|ASM":"nh",
  "Pessoas|Ingryd (HSE)|ACA|Outbound":"nh",
  "Pessoas|Ingryd (HSE)|ACA|Esteira":"nh",
  "Pessoas|Ingryd (HSE)|ACA|Outros (RTS, Almox, Meio Ambiente, Automação e etc)":"nh",
  "Pessoas|Ingryd (HSE)|PS|Total":"nh",
  "Pessoas|Ingryd (HSE)|PS|Inbound":"nh",
  "Pessoas|Ingryd (HSE)|PS|ASM":"nh",
  "Pessoas|Ingryd (HSE)|PS|Outbound":"nh",
  "Pessoas|Ingryd (HSE)|PS|Esteira":"nh",
  "Pessoas|Ingryd (HSE)|PS|Outros (RTS, Almox, Meio Ambiente, Automação e etc)":"nh",
  "Pessoas|Ingryd (HSE)|HSE|SPI":"ph",
  "Pessoas|COP|ABS|Total":"pl",
  "Pessoas|COP|ABS|T1":"pl",
  "Pessoas|COP|ABS|T2":"pl",
  "Pessoas|COP|ABS|T3":"pl",
  "Pessoas|COP|ABS|T4":"pl",
  "Pessoas|Enfermagem|Atendimentos Ambulatorios|Total":"nh",
  "Pessoas|Enfermagem|Atendimentos Ambulatorios|T1":"nh",
  "Pessoas|Enfermagem|Atendimentos Ambulatorios|T2":"nh",
  "Pessoas|Enfermagem|Atendimentos Ambulatorios|T3":"nh",
  "Inventário|COP|Stuck Received (Inbound)|% Orders Packed within 6h":"pl",
  "Inventário|Diogo (INV)|Stuck Received (Inbound)|%> 24 horas":"pl",
  "Inventário|Diogo (INV)|Stuck Received (Inbound)|>24 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Received (Inbound)|>48 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Received (Inbound)|>72 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Received (Inbound)|>10 dias":"nl",
  "Inventário|Diogo (INV)|Stuck Packed/Packing (Outbound)|>24 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Packed/Packing (Outbound)|>48 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Packed/Packing (Outbound)|>72 horas":"nl",
  "Inventário|Diogo (INV)|Stuck Packed/Packing (Outbound)|>10 dias":"nl",
  "Inventário|Diogo (INV)|COP|Salvados - Quant.TOs Geradas":"nh",
  "Inventário|Diogo (INV)|Inventário|Losses":"nl",
  "Inventário|Diogo (INV)|Inventário|Damage":"nl",
  "Inventário|Diogo (INV)|Inventário|Pacotes Coletados":"nh",
  "Inventário|Diogo (INV)|Inventário|Pacotes Coletados cancelados":"nh",
  "Inventário|Diogo (INV)|Inventário|Pacotes Coletados com Losses":"nl",
  "Planejamento|Rodrigo (PCP)|Forecast|Inbound Forecast S&OP":"nh",
  "Planejamento|Rodrigo (PCP)|Forecast|Received Inbound Total":"nh",
  "Planejamento|Rodrigo (PCP)||(%) Desvio de Forecast":"pz",
  "Planejamento|Rodrigo (PCP)|Planejamento|Packed Planejado D-1":"nh",
  "Planejamento|Rodrigo (PCP)|Planejamento|Packed Real D-1":"nh",
  "Planejamento|Rodrigo (PCP)|Planejamento|(%) Aderência ao Plano All":"ph",
  "Planejamento|Rodrigo (PCP)|Planejamento|(%) Aderência ao Plano T1":"ph",
  "Planejamento|Rodrigo (PCP)|Planejamento|(%) Aderência ao Plano T2":"ph",
  "Planejamento|Rodrigo (PCP)|Planejamento|(%) Aderência ao Plano T3":"ph",
  "Planejamento|Rodrigo (PCP)|Planejamento|Handover":"nh",
  "Planejamento|Rodrigo (PCP)|Planejamento|Backlog Piso D0 (Retrato das 6)":"nl",
  "Planejamento|Rodrigo (PCP)|Planejamento|Backlog Piso + Patio D0 (Retrato das 6)":"nl",
  "Planejamento|Rodrigo (PCP)|Planejamento|Produtividade Planejada":"nh",
  "Planejamento|Rodrigo (PCP)|Planejamento|Produtividade Real":"nh",
  "Planejamento|Rodrigo (PCP)||Produtividade Real T1":"nh",
  "Planejamento|Rodrigo (PCP)||Produtividade Real T2":"nh",
  "Planejamento|Rodrigo (PCP)||Produtividade Real T3":"nh",
  "Planejamento|Rodrigo (PCP)|Aderência|Aderência DW":"ph",
  "Planejamento|Rodrigo (PCP)|Aderência|Sizing Total":"ph",
  "Planejamento|Rodrigo (PCP)|Aderência|T1":"ph",
  "Planejamento|Rodrigo (PCP)|Aderência|T2":"ph",
  "Planejamento|Rodrigo (PCP)|Aderência|T3":"ph",
  "Inbound|COP|LH|Forecast Received":"nh",
  "Inbound|COP|LH|Received":"nh",
  "Inbound|COP|LH|(%) Forecast x Received":"ph",
  "Inbound|COP|LH|LH Qtd de carros planejados":"nh",
  "Inbound|COP|LH|LH | Qtd de carros descarregados":"nh",
  "Inbound|COP|LH|Qtd de carros em Fila D0 (retrato das 06:00)":"nl",
  "Inbound|COP|LH|Qtd de carros atrasados em fila D0 (retrato das 06:00)":"nl",
  "Inbound|COP|LH|Qtd de carros atrasados em fila + 6h D0 (retrato das 06:00)":"nl",
  "Inbound|COP|LH|Qtd de carros descarregados atrasados":"nl",
  "Inbound|COP|LH|Qtd de carros descarregados atrasados + 6h":"nl",
  "Inbound|COP|LH|% de carros descarregados atrasados":"pl",
  "Inbound|COP|LH|Tempo de Fila LH":"nl",
  "Inbound|COP|LH|% Aderência Stage In":"ph",
  "Inbound|COP|LH|% Wrong Crossdocking":"pl",
  "Inbound|COP|LH|% Share de Sacas":"ph",
  "Inbound|COP|FM|Forecast Received":"nh",
  "Inbound|COP|FM|Received":"nh",
  "Inbound|COP|FM|(%) Forecast x Received":"ph",
  "Inbound|COP|FM|Tempo de Fila FM":"nl",
  "Inbound|COP|QB|Packed QB":"nh",
  "Inbound|COP|QB|Share QB":"ph",
  "Inbound|COP|Triagem|Postos hora Planejados":"nh",
  "Inbound|COP|Triagem|Postos hora Realizados":"nh",
  "Inbound|COP|Triagem|% Aderência Postos":"ph",
  "Inbound|COP|Triagem|Pacotes Planejados":"nh",
  "Inbound|COP|Triagem|Pacotes Realizados":"nh",
  "Inbound|COP|Triagem|% Aderência Pacotes":"ph",
  "Inbound|COP|ABS|% ABS":"pl",
  "Inbound|COP|ABS|% Aderência preenchimento ABS":"pl",
  "Inbound|COP|ABS|Aderência Medidas Disciplinares":"pl",
  "Inbound|COP|ABS|Aderência Entrevista de ABS":"pl",
  "Máquina|COP|Rejeito|Matriz (Total)":"pl",
  "Máquina|COP|Rejeito|IBA":"pl",
  "Máquina|COP|Rejeito|IBB":"pl",
  "Máquina|COP|Rejeito|IBC":"pl",
  "Máquina|COP|Rejeito|IBD":"pl",
  "Máquina|COP|Rejeito|IBE":"pl",
  "Máquina|COP|Rejeito|IBF":"pl",
  "Máquina|COP|Rejeito|OB (Total)":"pl",
  "Máquina|COP|Rejeito|OBA":"pl",
  "Máquina|COP|Rejeito|OBB":"pl",
  "Máquina|COP|Rejeito|OBC":"pl",
  "Máquina|COP|Rejeito|OBD":"pl",
  "Máquina|COP|Rejeito|CBS (Total)":"pl",
  "Máquina|COP|Rejeito|CBS N3":"pl",
  "Máquina|COP|Rejeito|CBS N2":"pl",
  "Máquina|COP|Rejeito|NC":"pl",
  "Máquina|PCM|Automação|Qtd de OM Corretivas":"nl",
  "Máquina|PCM|Automação|Qtd de horas gastas em Corretivas":"nl",
  "Sorter|COP|Sorter|Packed Planejado":"nh",
  "Sorter|COP|Sorter|Packed Real":"nh",
  "Sorter|COP|Sorter|(%) Planejado x Real":"ph",
  "Sorter|COP|Sorter|Produção Pico Total":"nh",
  "Sorter|COP|Sorter|Produção Pico Zona":"nh",
  "Sorter|COP|Sorter|Produção Média":"nh",
  "Sorter|COP|Sorter|Tempo de Chute Fechado":"pl",
  "Sorter|COP|Sorter|\"Parcel Loop\"":"nl",
  "Sorter|COP|Sorter|\"Over Loop\"":"nl",
  "Sorter|COP|Sorter|% Share NC Processado":"pl",
  "Sorter|COP|Sorter|Backlog NC (Retrato das 6 horas)":"pl",
  "Sorter|COP|ABS|ABS":"pl",
  "Sorter|COP|ABS|% Aderência preenchimento ABS":"pl",
  "Sorter|COP|ABS|Aderência Medidas Disciplinares":"pl",
  "Sorter|COP|ABS|Aderência Entrevista de ABS":"pl",
  "Esteira|COP|Esteira|Packed Planejado":"nh",
  "Esteira|COP|Esteira|Packed Real":"nh",
  "Esteira|COP|Esteira|(%) Planejado x Real":"ph",
  "Esteira|COP|Esteira|% Share Packed Esteira":"ph",
  "Esteira|COP|Esteira|Backlog Tinta >24horas":"nl",
  "Esteira|COP|ABS|ABS":"pl",
  "Esteira|COP|ABS|% Aderência preenchimento ABS":"pl",
  "Esteira|COP|ABS|Aderência Medidas Disciplinares":"pl",
  "Esteira|COP|ABS|Aderência Entrevista de ABS":"pl",
  "Outbound|COP|Outbound|% Leftover Total":"pl",
  "Outbound|COP|Outbound|Leftover Total":"pl",
  "Outbound|COP|Outbound|% Leftover Ops":"pl",
  "Outbound|COP|Outbound|% Leftover Field":"pl",
  "Outbound|COP|Outbound|% Orders Outbounded within 24h":"ph",
  "Outbound|COP|Outbound|% FIFO Broken":"pl",
  "Outbound|COP|Outbound|Aderência Atrelamento de Sacas (LMH)":"ph",
  "Outbound|COP|Outbound|Aderência Atrelamento de Sacas (XPT)":"ph",
  "Outbound|COP|Outbound|Aderência ETA":"ph",
  "Outbound|COP|Outbound|Aderência CPT":"ph",
  "Outbound|COP|Outbound|% Clusterização Stage Out (Retrato das 6 horas)":"ph",
  "Outbound|COP|ABS|ABS":"pl",
  "Outbound|COP|ABS|% Aderência preenchimento ABS":"pl",
  "Outbound|COP|ABS|Aderência Medidas Disciplinares":"pl",
  "Outbound|COP|ABS|Aderência Entrevista de ABS":"pl",
  "Auditoria|COP|Mis|% Mis-scanning (SoC>LMH)":"pl",
  "Auditoria|COP|Mis|% Mis-routing":"pl",
  "Auditoria|COP|Auditoria de TO|Auditoria de TO (Qty)":"nh",
  "Auditoria|COP|Auditoria de TO|Meta":"nh",
  "Auditoria|COP|Auditoria de TO|% Auditado no ASM":"ph",
  "Auditoria|COP|Auditoria de TO|% wrong ASM":"pl",
  "Auditoria|COP|Auditoria de TO|% Auditado na Esteira":"ph",
  "Auditoria|COP|Auditoria de TO|% wrong Esteira":"pl",
  "Auditoria|COP|Auditoria de TO|% Auditado QB":"ph",
  "Auditoria|COP|Auditoria de TO|% wrong QB":"pl",
  "Auditoria|COP|Auditoria IN|Auditoria de FM":"nh",
  "Auditoria|COP|Auditoria IN|Auditoria de LH":"nh",
  "Auditoria|COP|Auditoria IN|Auditoria de NC":"pl",
  "Auditoria|COP|Auditoria IN|Auditoria de Outbound":"nh",
  "RETURNS|COP|EHA | RETURNS|Orfãos":"nl",
  "RETURNS|COP|EHA | RETURNS|Salvados - STN":"nh",
  "RETURNS|COP|EHA | RETURNS|Salvados - CTN":"nh",
  "RETURNS|COP|EHA | RETURNS|Descarte sem identificação":"nl",
  "RETURNS|COP|EHA | RETURNS|Descarte com identificação":"nl",
  "RETURNS|COP|EHA | RETURNS|Backlog de Salvados - Scuttles":"nl",
  "RETURNS|COP|EHA | RETURNS|Recevied EHA inbound":"nh",
  "RETURNS|COP|EHA | RETURNS|Registro de Avarias":"nl",
  "RETURNS|COP|EHA | RETURNS|% EHA X Recevied":"ph"
};

// Heurístico só pra KPI novo que ainda não está no ARVORE_META (a planilha
// pode ganhar linhas sem que essa tabela seja atualizada). Deliberadamente
// simples: nome com % ou target fracionário => percentual; nome com palavra
// de ocorrência/atraso => menor é melhor.
const PALAVRAS_MENOR_MELHOR = /atras|fila|backlog|perda|loss|damage|avaria|abs\b|absente|acidente|erro|falha|reclama|devolu|pendente|sinistro|excede|> ?\d|acima/i;
function metaHeuristica(kpi, targetNum, targetRaw) {
  const nome = String(kpi || '');
  const unit = /%/.test(nome) || /%/.test(String(targetRaw || '')) || (targetNum !== null && targetNum > 0 && targetNum <= 1)
    ? 'percent' : 'number';
  const polarity = PALAVRAS_MENOR_MELHOR.test(nome) || (unit === 'number' && targetNum === 0)
    ? 'lower_better' : 'higher_better';
  return { unit, polarity };
}
function metaDoKpi(bloco, pic, sub, kpi, targetNum, targetRaw) {
  const cfg = ARVORE_META[[bloco, pic, sub, kpi].join('|')];
  const m = cfg
    ? {
      unit: cfg[0] === 'p' ? 'percent' : 'number',
      polarity: cfg[1] === 'l' ? 'lower_better' : cfg[1] === 'z' ? 'near_zero' : 'higher_better',
    }
    : metaHeuristica(kpi, targetNum, targetRaw);

  // Correção sobre a tabela do mockup: contagem (number) com meta ZERO é
  // sempre "quanto menos melhor" — meta 0 só existe pra coisa que não devia
  // acontecer. O convert_data.py marcava os 12 KPIs de ACA/PS (acidentes,
  // bloco Pessoas/HSE) como higher_better, o que deixava indicador de
  // segurança SEMPRE verde, inclusive com acidente registrado. Achado em
  // 2026-08-13 ao portar a página; reportado ao Roberto.
  if (m.unit === 'number' && targetNum === 0 && m.polarity === 'higher_better') {
    m.polarity = 'lower_better';
  }
  return m;
}

// Texto que a planilha usa pra "não tem número aqui" — some do gráfico e
// conta como "sem dado", não como zero (zerar inflaria média e status).
const VAZIOS = new Set(['', '-', '-%', '#REF!', '#N/A', '#DIV/0!', '#VALUE!', 'EM CRIAÇÃO', 'PENDENTE', 'N/A', 'NA']);

// Parser próprio em vez do toNum de _period.js: aquele devolve 0 pra
// qualquer lixo ("pendente" viraria 0 = "bateu o target de 0"), aqui
// precisamos distinguir zero de vazio.
function num(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || VAZIOS.has(s.toUpperCase())) return null;
  const pct = s.endsWith('%');
  const corpo = pct ? s.slice(0, -1).trim() : s;
  const t = corpo.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  // Arredonda a divisão por 100 (1,35% viraria 0.013500000000000002 em
  // ponto flutuante) — mantém o JSON limpo e não muda a precisão útil.
  return pct ? Math.round(n * 1e8) / 1e10 : n;
}

const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function diaDaSemana(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d.getTime()) ? '' : DIA_SEMANA[d.getUTCDay()];
}

const ehData = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
const ehSemana = v => /^W\d+$/.test(v);

async function buildArvore() {
  const { rows } = await fetchTabByGid(ARVORE_SHEET.spreadsheetId, ARVORE_SHEET.gid);

  const kpiPorChave = new Map(); // chave -> objeto do KPI (ordem = ordem da planilha)
  const semanaDeDia = new Map(); // iso -> rótulo de semana
  const diasComDado = new Set();
  const semanasComDado = new Set();
  const todasDatas = new Set();
  const todasSemanas = new Set();
  const blocos = [];

  rows.forEach(r => {
    const data = String(r.data || '').trim();
    const bloco = String(r.bloco || '').trim();
    const kpiNome = String(r.kpi || '').trim();
    if (!data || !bloco || !kpiNome) return;

    const pic = String(r.pic || '').trim();
    const sub = String(r['sub bloco'] || '').trim();
    const chave = [bloco, pic, sub, kpiNome].join('|');

    if (ehData(data)) {
      todasDatas.add(data);
      const sem = String(r.semana || '').trim();
      if (ehSemana(sem)) semanaDeDia.set(data, sem);
    } else if (ehSemana(data)) {
      todasSemanas.add(data);
    } else {
      return; // Data que não é nem dia nem semana — ignora
    }

    if (!kpiPorChave.has(chave)) {
      if (!blocos.includes(bloco)) blocos.push(bloco);
      const targetRaw = String(r.target || '').trim();
      const target = num(targetRaw);
      const m = metaDoKpi(bloco, pic, sub, kpiNome, target, targetRaw);
      kpiPorChave.set(chave, {
        id: 'k' + kpiPorChave.size,
        bloco, pic, subBloco: sub, kpi: kpiNome,
        fonte: String(r.link || '').trim(),
        unit: m.unit, polarity: m.polarity,
        target, targetRaw,
        valores: {}, obs: {},
      });
    }
    const k = kpiPorChave.get(chave);
    if (!k.fonte && r.link) k.fonte = String(r.link).trim();

    const v = num(r.valor);
    if (v !== null) {
      k.valores[data] = v;
      if (ehData(data)) diasComDado.add(data);
      else semanasComDado.add(data);
    }
    const obs = String(r['observação'] || r.observacao || '').trim();
    if (obs && !VAZIOS.has(obs.toUpperCase())) k.obs[data] = obs;
  });

  // Último dia com número de verdade — vira o "hoje" da tela e o limite da
  // timeline (a planilha tem o ano inteiro pré-criado, sem dado à frente).
  const diasOrdenados = [...diasComDado].sort();
  const lastRealDate = diasOrdenados[diasOrdenados.length - 1] || null;

  const days = [...todasDatas].sort()
    .filter(iso => !lastRealDate || iso <= lastRealDate)
    .map(iso => ({ iso, wk: semanaDeDia.get(iso) || '', wd: diaDaSemana(iso) }));

  const ordemSemana = s => parseInt(s.slice(1), 10);
  const weeks = [...todasSemanas].sort((a, b) => ordemSemana(a) - ordemSemana(b))
    .map(label => {
      const dias = days.filter(d => d.wk === label).map(d => d.iso).sort();
      return {
        label,
        startIso: dias[0] || null,
        endIso: dias[dias.length - 1] || null,
        hasRealData: semanasComDado.has(label) || dias.some(iso => diasComDado.has(iso)),
      };
    })
    .filter(w => w.startIso);

  const comDado = weeks.filter(w => w.hasRealData);
  const refWeeks = comDado.slice(-2).map(w => w.label);

  const kpis = [...kpiPorChave.values()];
  // Quebra por turno (pedido do Roberto em 2026-08-13, mockup "arvore-kpis"
  // bundle): dentro do mesmo Bloco/PIC/Sub Bloco, se existir KPI nomeado
  // exatamente T1/T2/T3/T4, o KPI "Total" desse mesmo grupo ganha turnoRefs
  // apontando pros ids — usado no drawer pra montar a tabela "Por turno".
  // Só o "Total" recebe (não qualquer KPI não-T1-4 do grupo): um Sub Bloco
  // como ABS tem várias métricas diferentes além de Total/T1-T4 (% Aderência,
  // Entrevista, etc.) — anexar turnoRefs nelas mostraria os valores de T1-T4
  // do ABS dentro do drawer de uma métrica sem relação nenhuma com turno.
  const grupos = new Map(); // bloco|pic|sub -> kpis do grupo
  kpis.forEach(k => {
    const chaveGrupo = [k.bloco, k.pic, k.subBloco].join('|');
    if (!grupos.has(chaveGrupo)) grupos.set(chaveGrupo, []);
    grupos.get(chaveGrupo).push(k);
  });
  grupos.forEach(grupo => {
    const turnos = {};
    grupo.forEach(k => { if (/^T[1-4]$/.test(k.kpi)) turnos[k.kpi] = k.id; });
    if (!Object.keys(turnos).length) return;
    const total = grupo.find(k => k.kpi === 'Total');
    if (total) total.turnoRefs = turnos;
  });

  return {
    meta: {
      fonte: 'ÁRVORE_INPUT',
      lastRealDate,
      refWeeks,
      atualizadoEm: new Date().toISOString(),
    },
    blocks: blocos,
    weeks,
    days,
    kpis,
  };
}

// Preenchimento manual (pedido do Roberto em 2026-08-17) — a aba já vem com
// o ano inteiro pré-criado (1 linha por Data × Bloco/PIC/Sub Bloco/KPI,
// Valor default "-"), então escrever é achar a linha existente e trocar só
// as células Valor (coluna H) e Observação (coluna I) — nunca insere linha
// nova.
//
// Regra por célula (entries[i] = { bloco, pic, subBloco, kpi, data, valor, observacao }):
//   Valor digitado (não vazio)      -> sobrescreve, seja lá o que tinha antes
//   Valor vazio + célula já tinha dado real -> mantém (não escreve nada)
//   Valor vazio + célula já estava vazia/"-" -> escreve "-" (mesmo texto
//                                                que a planilha já usa)
//   Observação: sem o mesmo problema de ambíguidade do Valor (comentário
//   vazio não precisa de placeholder pra não virar "zero") — digitada
//   sobrescreve, vazia sempre mantém o que já tinha, nunca força "-".
async function writeArvoreValores(entries) {
  const { title, values } = await fetchTabRawValues(ARVORE_SHEET.spreadsheetId, ARVORE_SHEET.gid);

  const idx = new Map(); // "bloco|pic|sub|kpi|data" -> { rowNum, valorAtual, obsAtual }
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const chave = [row[1] || '', row[2] || '', row[3] || '', row[4] || '', row[0] || ''].join('|');
    idx.set(chave, { rowNum: i + 1, valorAtual: row[7] || '', obsAtual: row[8] || '' });
  }

  const updates = [];
  const naoEncontrados = [];
  entries.forEach(e => {
    const chave = [e.bloco || '', e.pic || '', e.subBloco || '', e.kpi || '', e.data || ''].join('|');
    const alvo = idx.get(chave);
    if (!alvo) { naoEncontrados.push(chave); return; }

    const digitado = String(e.valor == null ? '' : e.valor).trim();
    let novoValor;
    if (digitado !== '') {
      novoValor = digitado;
    } else {
      const atual = String(alvo.valorAtual || '').trim();
      novoValor = (atual === '' || VAZIOS.has(atual.toUpperCase())) ? '-' : null; // null = mantém, não escreve
    }
    if (novoValor !== null && novoValor !== alvo.valorAtual) {
      updates.push({ range: `'${title}'!H${alvo.rowNum}`, values: [[novoValor]] });
    }

    const comentario = String(e.observacao == null ? '' : e.observacao).trim();
    if (comentario !== '' && comentario !== alvo.obsAtual) {
      updates.push({ range: `'${title}'!I${alvo.rowNum}`, values: [[comentario]] });
    }
  });

  if (updates.length) await batchUpdateValues(ARVORE_SHEET.spreadsheetId, updates);
  return { escritos: updates.length, naoEncontrados };
}

// "Copiar e colar como valor" no lugar (pedido do Roberto em 2026-08-17)
// — congela o resultado ATUAL do IMPORTRANGE/ARRAYFORMULA em texto/número
// fixo, célula por célula, sem mudar formatação nem posição. A partir daí
// a aba para de depender da planilha de origem e passa a ser editada só
// pelo preenchimento manual (writeArvoreValores acima).
//
// Roda em CHUNKS (uma chamada por pedaço, não a planilha inteira de uma
// vez): 53 mil linhas × 10 colunas não cabe com folga no tempo de uma
// function da Vercel, e escrever tudo de uma vez sem clear-antes (ver
// updateRangeRaw) significa que um chunk que falha no meio não deixa
// nenhum trecho apagado — só not-yet-frozen, ainda servido pela fórmula
// até a próxima chamada terminar o resto. Cada chamada relê a aba inteira
// (não só o chunk) pra sempre converter o dado mais recente, já que a
// fonte pode estar em recálculo entre uma chamada e outra.
async function freezeArvoreChunk(chunkStart, chunkSize) {
  const { title, values } = await fetchTabRawValues(ARVORE_SHEET.spreadsheetId, ARVORE_SHEET.gid);
  const NUM_COLS = 10; // A..J (Data..Link)
  const total = values.length;
  if (chunkStart >= total) return { done: true, totalRows: total, escritas: 0, nextStart: total };

  const end = Math.min(total, chunkStart + chunkSize);
  const slice = values.slice(chunkStart, end).map(row => {
    const r = row.slice(0, NUM_COLS);
    while (r.length < NUM_COLS) r.push('');
    return r;
  });
  const range = `'${title}'!A${chunkStart + 1}:J${end}`;
  await updateRangeRaw(ARVORE_SHEET.spreadsheetId, range, slice);
  return { done: end >= total, totalRows: total, escritas: slice.length, nextStart: end };
}

module.exports = { buildArvore, writeArvoreValores, freezeArvoreChunk };
