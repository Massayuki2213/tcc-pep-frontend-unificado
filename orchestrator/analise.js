/**
 * Análise estatística do delineamento fatorial.
 *
 * Implementa, sobre o acervo do laboratório, os três procedimentos que o
 * report 4 especifica:
 *
 *   1. Teste t de Welch  — monolito × microsserviços em cada carga fixa
 *   2. ANOVA de 2 fatores — arquitetura × carga, com termo de interação
 *   3. Tukey HSD          — comparações par a par entre as 6 células
 *
 * Por que Welch e não o t de Student clássico: o t de Student assume
 * variâncias iguais nos dois grupos, e aqui elas não são (o desvio do MS
 * chega a 4x o do monolito em algumas cargas). Welch corrige os graus de
 * liberdade e é o padrão recomendado quando a homocedasticidade não se
 * sustenta. O t de Student também é reportado, para comparação.
 *
 * Sem dependências: as distribuições t, F e da amplitude estudentizada são
 * calculadas aqui. O bloco --validar confere os valores contra referências
 * conhecidas antes de qualquer conclusão ser tirada.
 *
 * Uso:
 *   node orchestrator/analise.js                 # metrica avg_ms
 *   node orchestrator/analise.js --metrica rps
 *   node orchestrator/analise.js --validar       # so a auto-verificacao
 */
const ARQS = ['monolito', 'microsservicos'];
const CARGAS = ['normal', 'dia-corrido', 'emergencia'];
const ALFA = 0.05;

// ─── Funções especiais ────────────────────────────────────────────────────

function logGama(x) {
  // Lanczos, g=7, n=9
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGama(1 - x);
  x -= 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Beta incompleta regularizada I_x(a,b), por fração continuada (Lentz). */
function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGama(a) + logGama(b) - logGama(a + b);
  const frente = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  // A fração converge rápido só de um lado; do outro usa-se a simetria
  if (x < (a + 1) / (a + b + 2)) return (frente * fracCont(x, a, b)) / a;
  return 1 - (Math.exp(b * Math.log(1 - x) + a * Math.log(x) - lbeta) * fracCont(1 - x, b, a)) / b;
}

function fracCont(x, a, b) {
  const TINY = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + num * d; if (Math.abs(d) < TINY) d = TINY; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < TINY) c = TINY;
    h *= d * c;
    num = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + num * d; if (Math.abs(d) < TINY) d = TINY; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < TINY) c = TINY;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-12) break;
  }
  return h;
}

/** p bicaudal do t de Student. */
function pValorT(t, df) {
  const x = df / (df + t * t);
  return betaInc(x, df / 2, 0.5);
}

/** p da cauda superior da F. */
function pValorF(f, df1, df2) {
  if (f <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return betaInc(x, df2 / 2, df1 / 2);
}

function phi(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function Phi(z) {
  // Zelen & Severo (A&S 26.2.17) — erro < 7.5e-8
  const b = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const sinal = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  let soma = 0;
  let tp = t;
  for (const bi of b) { soma += bi * tp; tp *= t; }
  const cauda = phi(Math.abs(z)) * soma;
  void a;
  return z >= 0 ? 1 - cauda : cauda;
}

/** Simpson composta. */
function simpson(f, a, b, n) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** CDF da amplitude de k normais padrão. */
function cdfAmplitude(q, k) {
  if (q <= 0) return 0;
  const integrando = z => phi(z) * Math.pow(Phi(z) - Phi(z - q), k - 1);
  return k * simpson(integrando, -8.5, 8.5, 480);
}

/**
 * CDF da amplitude estudentizada: integra a CDF da amplitude sobre a
 * distribuição de s = sqrt(chi2_df / df).
 */
function ptukey(q, k, df) {
  if (q <= 0) return 0;
  const c = (df / 2) * Math.log(df / 2) - logGama(df / 2);
  const densS = s => Math.exp(c + (df - 1) * Math.log(s) - (df * s * s) / 2) * 2;
  const integrando = s => densS(s) * cdfAmplitude(q * s, k);
  // s concentra-se perto de 1; 0.03..3 cobre a massa com folga
  return simpson(integrando, 0.03, 3, 260);
}

/** Busca binária do q crítico para um dado alfa. */
function qCritico(k, df, alfa) {
  let lo = 0.1;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, k, df) < 1 - alfa) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Estatística descritiva ───────────────────────────────────────────────

const soma = v => v.reduce((a, b) => a + b, 0);
const media = v => soma(v) / v.length;
const varAmostral = v => {
  const m = media(v);
  return soma(v.map(x => (x - m) ** 2)) / (v.length - 1);
};
const dp = v => Math.sqrt(varAmostral(v));

// ─── Testes ───────────────────────────────────────────────────────────────

function testeWelch(a, b) {
  const [ma, mb] = [media(a), media(b)];
  const [va, vb] = [varAmostral(a), varAmostral(b)];
  const [na, nb] = [a.length, b.length];
  const se = Math.sqrt(va / na + vb / nb);
  const t = (ma - mb) / se;
  const df =
    (va / na + vb / nb) ** 2 /
    ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  return { t, df, p: pValorT(t, df), difMedia: ma - mb, se };
}

function testeStudent(a, b) {
  const [na, nb] = [a.length, b.length];
  const gl = na + nb - 2;
  const sp2 = ((na - 1) * varAmostral(a) + (nb - 1) * varAmostral(b)) / gl;
  const se = Math.sqrt(sp2 * (1 / na + 1 / nb));
  const t = (media(a) - media(b)) / se;
  return { t, df: gl, p: pValorT(t, gl) };
}

/** d de Cohen com desvio agrupado — tamanho do efeito. */
function cohenD(a, b) {
  const gl = a.length + b.length - 2;
  const sp = Math.sqrt(((a.length - 1) * varAmostral(a) + (b.length - 1) * varAmostral(b)) / gl);
  return (media(a) - media(b)) / sp;
}

/** ANOVA de dois fatores balanceada, com interação. */
function anovaDoisFatores(celulas) {
  const todos = [];
  for (const k of Object.keys(celulas)) todos.push(...celulas[k]);
  const N = todos.length;
  const grandeMedia = media(todos);
  const n = celulas[Object.keys(celulas)[0]].length;
  const a = ARQS.length;
  const b = CARGAS.length;

  let ssA = 0;
  for (const arq of ARQS) {
    const v = [];
    for (const c of CARGAS) v.push(...celulas[`${arq}|${c}`]);
    ssA += v.length * (media(v) - grandeMedia) ** 2;
  }
  let ssB = 0;
  for (const c of CARGAS) {
    const v = [];
    for (const arq of ARQS) v.push(...celulas[`${arq}|${c}`]);
    ssB += v.length * (media(v) - grandeMedia) ** 2;
  }
  let ssCelulas = 0;
  let ssDentro = 0;
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      const v = celulas[`${arq}|${c}`];
      const m = media(v);
      ssCelulas += v.length * (m - grandeMedia) ** 2;
      ssDentro += soma(v.map(x => (x - m) ** 2));
    }
  }
  const ssAB = ssCelulas - ssA - ssB;
  const ssTotal = soma(todos.map(x => (x - grandeMedia) ** 2));

  const dfA = a - 1;
  const dfB = b - 1;
  const dfAB = dfA * dfB;
  const dfErro = N - a * b;

  const msA = ssA / dfA;
  const msB = ssB / dfB;
  const msAB = ssAB / dfAB;
  const msErro = ssDentro / dfErro;

  // Variancia nula dentro das celulas degenera o F: ou sai NaN (0/0), ou sai
  // Infinity com p=0, que a tela leria como "significativo" com confianca
  // total. Nao e. Sem variacao entre repeticoes nao ha erro amostral contra o
  // qual comparar o efeito, e o teste nao se aplica. Acontece de verdade em
  // metricas como error_rate_pct, que costuma ser 0,00 em toda rodada boa.
  const degenerado = !Number.isFinite(msErro) || msErro === 0;
  const f = (ms, df) => (degenerado ? null : ms / msErro);
  const pv = (ms, df) => (degenerado ? null : pValorF(ms / msErro, df, dfErro));
  const eta = (ss) => (ss + ssDentro === 0 ? null : ss / (ss + ssDentro));

  return {
    n, N, ssTotal, msErro, dfErro,
    degenerado,
    motivoDegenerado: degenerado
      ? 'As repeticoes nao variam dentro das celulas — sem erro amostral, o teste F nao se aplica.'
      : null,
    fatores: [
      { nome: 'Arquitetura', ss: ssA, df: dfA, ms: msA, F: f(msA, dfA), p: pv(msA, dfA), etaP: eta(ssA) },
      { nome: 'Carga', ss: ssB, df: dfB, ms: msB, F: f(msB, dfB), p: pv(msB, dfB), etaP: eta(ssB) },
      { nome: 'Interação', ss: ssAB, df: dfAB, ms: msAB, F: f(msAB, dfAB), p: pv(msAB, dfAB), etaP: eta(ssAB) },
    ],
    residuo: { ss: ssDentro, df: dfErro, ms: msErro },
  };
}

function tukey(celulas, msErro, dfErro, n) {
  const chaves = [];
  for (const arq of ARQS) for (const c of CARGAS) chaves.push(`${arq}|${c}`);
  const k = chaves.length;
  const se = Math.sqrt(msErro / n);
  const qCrit = qCritico(k, dfErro, ALFA);
  const hsd = qCrit * se;
  // se == 0 faz todo q virar Infinity e todo par virar "significativo"
  const degenerado = !Number.isFinite(se) || se === 0;

  const pares = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const dif = media(celulas[chaves[i]]) - media(celulas[chaves[j]]);
      const q = Math.abs(dif) / se;
      pares.push({
        a: chaves[i], b: chaves[j], dif,
        q: degenerado ? null : q,
        p: degenerado ? null : 1 - ptukey(q, k, dfErro),
        significativo: !degenerado && Math.abs(dif) > hsd,
      });
    }
  }
  return { qCrit, hsd, se, pares: pares.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif)) };
}

// ─── Auto-verificação ─────────────────────────────────────────────────────

function validar() {
  const casos = [];
  const perto = (obtido, esperado, tol, nome) =>
    casos.push({ nome, obtido, esperado, ok: Math.abs(obtido - esperado) < tol });

  perto(Phi(0), 0.5, 1e-6, 'Phi(0) = 0,5');
  perto(Phi(1.96), 0.975, 1e-4, 'Phi(1,96) = 0,975');
  perto(Math.exp(logGama(5)), 24, 1e-6, 'gama(5) = 24');
  // t bicaudal: t=2,086 com 20 gl -> p ~ 0,05
  perto(pValorT(2.086, 20), 0.05, 1e-3, 'p(t=2,086; gl=20) = 0,05');
  // F(2,24) critico a 5% = 3,403
  perto(pValorF(3.403, 2, 24), 0.05, 1e-3, 'p(F=3,403; 2,24) = 0,05');
  // F(1,24) critico a 5% = 4,260
  perto(pValorF(4.26, 1, 24), 0.05, 1e-3, 'p(F=4,260; 1,24) = 0,05');
  // q critico de Tukey, k=6, gl=24, alfa=0,05 -> 4,373 (tabela)
  perto(qCritico(6, 24, 0.05), 4.373, 0.02, 'q(k=6; gl=24; 5%) = 4,373');

  console.log('AUTO-VERIFICACAO DAS DISTRIBUICOES\n');
  let todosOk = true;
  for (const c of casos) {
    if (!c.ok) todosOk = false;
    console.log(
      `  ${c.ok ? 'ok  ' : 'FALHA'} ${c.nome.padEnd(34)} obtido=${c.obtido.toFixed(5)}  esperado=${c.esperado}`,
    );
  }
  console.log(`\n  ${todosOk ? 'Todas as referencias conferem.' : 'ATENCAO: ha divergencia — nao confie nos resultados.'}`);
  return todosOk;
}

// ─── API programática ─────────────────────────────────────────────────────

/**
 * Roda a análise inteira sobre um acervo e devolve tudo estruturado.
 *
 * É esta função que o endpoint /lab/analise expõe para a tela de Resultados:
 * a estatística mora num lugar só, validada de uma vez, em vez de existir uma
 * segunda implementação no front que pode divergir em silêncio.
 */
/**
 * Rotulo da unidade da metrica-resposta. Cobre tambem as metricas de consumo de
 * recursos, que vem do Prometheus e nao do CSV do k6 — sem isso o relatorio
 * imprimiria "CPU: 1,83" sem dizer 1,83 de que.
 */
function unidadeDe(metrica, log) {
  const base =
    metrica === 'rps' ? 'req/s'
      : metrica.endsWith('_ms') ? 'ms'
        : metrica.startsWith('cpu_cores') ? 'cores'
          : metrica.startsWith('mem_mb') ? 'MB'
            // `_pct` aparece no fim (error_rate_pct) e no meio (cpu_pct_avg)
            : metrica.includes('_pct') ? '%'
              : '';
  return log ? `ln(${base || metrica})` : base;
}


/**
 * Diagnostico de normalidade dos residuos.
 *
 * A ANOVA e o teste t assumem residuos aproximadamente normais — residuo e o
 * quanto cada rodada se afasta da media da SUA celula, nao o dado bruto. Nao
 * ha aqui um teste de hipotese formal (Shapiro-Wilk) de proposito: com n=30 ele
 * tem pouco poder e so pegaria desvio grosseiro, enquanto assimetria, curtose e
 * o Q-Q mostram a MESMA coisa de forma inspecionavel, e o Q-Q e o que uma banca
 * consegue ler numa figura.
 *
 * Erros padrao de referencia para n=30: assimetria ~0,43 e curtose ~0,83. Dois
 * erros padrao sao a faixa usual de compatibilidade com a normal.
 */
function normalidade(celulas) {
  const res = [];
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      const v = celulas[`${arq}|${c}`];
      if (v.length < 2) continue;
      const m = media(v);
      for (const x of v) res.push(x - m);
    }
  }
  if (res.length < 8) return null;

  const n = res.length;
  const m = media(res);
  const s = dp(res);
  if (!Number.isFinite(s) || s === 0) {
    return { n, degenerado: true, assimetria: null, curtose: null, qq: [] };
  }

  const z = res.map(x => (x - m) / s);
  const assimetria = media(z.map(x => x ** 3));
  const curtose = media(z.map(x => x ** 4)) - 3;

  // Erros padrao sob normalidade (Cramer)
  const epAssim = Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3)));
  const epCurt = 2 * epAssim * Math.sqrt((n ** 2 - 1) / ((n - 3) * (n + 5)));

  // Pontos do Q-Q: quantil teorico (Blom) contra residuo padronizado observado
  const ordenados = [...z].sort((a, b) => a - b);
  const qq = ordenados.map((obs, i) => ({
    teorico: probitNormal((i + 1 - 0.375) / (n + 0.25)),
    observado: obs,
  }));

  return {
    n,
    degenerado: false,
    assimetria,
    curtose,
    epAssimetria: epAssim,
    epCurtose: epCurt,
    // |valor| acima de 2 erros padrao e o sinal convencional de desvio
    zAssimetria: assimetria / epAssim,
    zCurtose: curtose / epCurt,
    aceitavel: Math.abs(assimetria / epAssim) < 2 && Math.abs(curtose / epCurt) < 2,
    qq,
    // As rodadas mais distantes da media da sua celula — candidatas a
    // investigacao antes de culpar a arquitetura pelo resultado.
    extremos: [...z]
      .map((v, i) => ({ z: v, i }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3)
      .map(x => arred(x.z, 2)),
  };
}

/** Inversa da normal padrao (Acklam), para os quantis teoricos do Q-Q. */
function probitNormal(p) {
  if (p <= 0 || p >= 1) return 0;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416];
  const pl = 0.02425;
  let q;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function arred(n, c) {
  const f = 10 ** c;
  return Math.round(n * f) / f;
}

// ─── Análise por endpoint ─────────────────────────────────────────────────

/**
 * A mesma inferência, mas por endpoint em vez de sobre a linha GLOBAL.
 *
 * GLOBAL é a média das cinco operações, e ela esconde que elas se comportam de
 * maneiras opostas: no acervo do notebook os microsserviços perdem nas três
 * operações de atendimento e GANHAM nas duas que não passam pelo serviço de
 * atendimentos. Decidir a pergunta de pesquisa só pela média seria descartar o
 * achado mais específico que o experimento produziu.
 *
 * Duas saídas, que respondem a perguntas diferentes:
 *
 * `porCarga` compara as arquiteturas dentro de cada endpoint — quem é mais
 * rápido naquela operação, com p-valor e d de Cohen.
 *
 * `degradacao` compara cada arquitetura CONSIGO MESMA, de carga normal para
 * emergência. É esta que mede isolamento: um endpoint cujo trabalho não mudou
 * e cuja taxa de chegada quase não mudou, mas que fica muitas vezes mais lento,
 * está pagando a conta da saturação de um VIZINHO. No monolito eles dividem
 * processo e pool de conexões; nos microsserviços, não.
 *
 * `chegada` existe para o leitor poder descontar o confundidor: a arquitetura
 * mais lenta no conjunto entrega menos requisições por segundo em TODO endpoint,
 * então parte de qualquer vantagem dela vem de ter recebido menos carga. Sem
 * essa coluna o painel afirmaria mais do que o dado sustenta.
 */
function porEndpoint(acervo, metrica = 'avg_ms') {
  // Labels na ordem em que aparecem no CSV do k6, que é a ordem do cenário
  const labels = [];
  const endpointDe = new Map();
  for (const o of acervo) {
    for (const j of o.porJoin || []) {
      if (!endpointDe.has(j.label)) {
        labels.push(j.label);
        endpointDe.set(j.label, j.endpoint || '');
      }
    }
  }

  const valores = (label, arq, carga, campo) => acervo
    .filter(o => o.arquitetura === arq && o.carga === carga)
    .map(o => (o.porJoin || []).find(j => j.label === label)?.[campo])
    .filter(x => typeof x === 'number' && Number.isFinite(x));

  const descritiva = v => (v.length
    ? { n: v.length, media: arred(media(v), 2), desvio: v.length > 1 ? arred(dp(v), 2) : null }
    : { n: 0, media: null, desvio: null });

  const endpoints = labels.map(label => {
    const porCarga = CARGAS.map(carga => {
      const mono = valores(label, 'monolito', carga, metrica);
      const ms = valores(label, 'microsservicos', carga, metrica);
      const dMono = descritiva(mono);
      const dMs = descritiva(ms);

      const base = {
        carga,
        monolito: dMono,
        microsservicos: dMs,
        razao: dMono.media && dMs.media ? arred(dMs.media / dMono.media, 2) : null,
        // Quanto cada endpoint de fato recebeu — o confundidor, explícito
        chegada: {
          monolito: valores(label, 'monolito', carga, 'rps').length
            ? arred(media(valores(label, 'monolito', carga, 'rps')), 2) : null,
          microsservicos: valores(label, 'microsservicos', carga, 'rps').length
            ? arred(media(valores(label, 'microsservicos', carga, 'rps')), 2) : null,
        },
      };

      if (mono.length < 2 || ms.length < 2) return { ...base, insuficiente: true };
      // Mesmo cuidado dos outros testes: sem variação dentro dos grupos o t sai
      // NaN ou Infinity, e reportar isso como significativo afirmaria com
      // confiança total algo que o teste não mediu.
      const w = testeWelch(mono, ms);
      if (!Number.isFinite(w.t) || !Number.isFinite(w.p)) {
        return { ...base, insuficiente: false, degenerado: true };
      }
      return {
        ...base,
        insuficiente: false,
        degenerado: false,
        p: w.p,
        d: arred(cohenD(mono, ms), 2),
        significativo: w.p < ALFA,
        vence: dMono.media === dMs.media ? null : dMono.media < dMs.media ? 'monolito' : 'microsservicos',
      };
    });

    // Fator de degradação: a mesma arquitetura, normal -> emergência
    const degradacao = {};
    for (const arq of ARQS) {
      const vn = valores(label, arq, 'normal', metrica);
      const ve = valores(label, arq, 'emergencia', metrica);
      const n = vn.length ? media(vn) : null;
      const e = ve.length ? media(ve) : null;
      degradacao[arq] = n && e ? arred(e / n, 2) : null;
    }

    const emerg = porCarga.find(c => c.carga === 'emergencia');
    const sloEmerg = {};
    for (const arq of ARQS) {
      const v = valores(label, arq, 'emergencia', 'slo_pass_pct');
      sloEmerg[arq] = v.length ? arred(media(v), 1) : null;
    }

    return {
      label,
      endpoint: endpointDe.get(label) || '',
      porCarga,
      degradacao,
      sloEmergencia: sloEmerg,
      vencedorEmergencia: emerg?.vence ?? null,
      significativoEmergencia: emerg?.significativo ?? false,
    };
  });

  // Leitura consolidada: onde o veredito do GLOBAL se inverte, e qual o pior
  // fator de degradação de cada arquitetura. É o resumo que o painel abre.
  const ganhosMs = endpoints.filter(
    e => e.vencedorEmergencia === 'microsservicos' && e.significativoEmergencia,
  );
  const piorDegradacao = {};
  for (const arq of ARQS) {
    const fs = endpoints.map(e => e.degradacao[arq]).filter(x => typeof x === 'number');
    piorDegradacao[arq] = fs.length ? Math.max(...fs) : null;
  }

  return {
    metrica,
    unidade: unidadeDe(metrica, false),
    alfa: ALFA,
    total: acervo.length,
    maquinas: [...new Set(acervo.map(o => o.maquina?.apelido).filter(Boolean))],
    endpoints,
    isolamento: {
      ganhosMicrosservicos: ganhosMs.map(e => e.label),
      piorDegradacao,
    },
  };
}


/**
 * Consolida as quatro familias de metricas que a secao 2.4.1 do trabalho
 * promete medir, numa forma que responde diretamente a pergunta de pesquisa
 * da p.18: menor tempo de resposta, maior vazao, melhor aproveitamento de
 * recursos.
 *
 * Existe porque /lab/analise responde sobre UMA metrica por vez, e ler as
 * quatro exige quatro chamadas e juntar na cabeca. O veredito do trabalho
 * precisa caber numa tela.
 */
const METRICAS_CHAVE = [
  { chave: 'avg_ms', rotulo: 'Tempo de resposta', unidade: 'ms', melhor: 'menor' },
  { chave: 'rps', rotulo: 'Vazão', unidade: 'req/s', melhor: 'maior' },
  { chave: 'cpu_cores_avg', rotulo: 'CPU usada', unidade: 'cores', melhor: null },
  { chave: 'mem_mb_avg', rotulo: 'Memória usada', unidade: 'MB', melhor: 'menor' },
];

function resumo(acervo) {
  const metricas = METRICAS_CHAVE.map(def => {
    const r = analisar(acervo, def.chave, false);
    const achar = (arq, c) => r.descritivas.find(d => d.arquitetura === arq && d.carga === c);
    return {
      ...def,
      porCarga: CARGAS.map(c => {
        const mo = achar('monolito', c);
        const ms = achar('microsservicos', c);
        const t = r.testesT.find(x => x.carga === c);
        const difPct = mo?.media && ms?.media ? ((ms.media - mo.media) / mo.media) * 100 : null;
        return {
          carga: c,
          monolito: mo?.media ?? null,
          microsservicos: ms?.media ?? null,
          difPct,
          p: t?.degenerado ? null : (t?.welch?.p ?? null),
          d: t?.d ?? null,
          significativo: !!t?.significativo,
        };
      }),
      anova: r.anova && !r.anova.degenerado
        ? Object.fromEntries(r.anova.fatores.map(f => [f.nome, { p: f.p, etaP: f.etaP }]))
        : null,
      normalidadeOk: r.normalidade?.aceitavel ?? null,
    };
  });

  // Aproveitamento = vazao entregue por core efetivamente usado. Separa duas
  // coisas que "consumo de recursos" confunde: ser eficiente com o que se usa,
  // e conseguir usar o que se tem.
  const aproveitamento = [];
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      const obs = acervo.filter(o => o.arquitetura === arq && o.carga === c);
      if (!obs.length) continue;
      const rps = media(obs.map(o => o.metricas?.rps).filter(Number.isFinite));
      const cores = media(obs.map(o => o.metricas?.cpu_cores_avg).filter(Number.isFinite));
      aproveitamento.push({
        arquitetura: arq,
        carga: c,
        rps,
        cores,
        rpsPorCore: cores ? rps / cores : null,
        pctOrcamento: (cores / 4) * 100,
      });
    }
  }

  return { total: acervo.length, metricas, aproveitamento, orcamentoCpus: 4 };
}

function analisar(acervo, metrica = 'avg_ms', log = false) {
  const celulas = {};
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      celulas[`${arq}|${c}`] = acervo
        .filter(o => o.arquitetura === arq && o.carga === c)
        .map(o => o.metricas?.[metrica])
        .filter(x => typeof x === 'number' && Number.isFinite(x))
        .map(x => (log ? Math.log(x) : x));
    }
  }

  const tamanhos = Object.values(celulas).map(v => v.length);
  const balanceado = tamanhos.every(t => t === tamanhos[0]) && tamanhos[0] > 1;
  const completo = tamanhos.every(t => t >= 2);

  const descritivas = [];
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      const v = celulas[`${arq}|${c}`];
      const m = v.length ? media(v) : null;
      const s = v.length > 1 ? dp(v) : null;
      descritivas.push({
        arquitetura: arq,
        carga: c,
        n: v.length,
        media: m,
        desvio: s,
        cv: m && s ? (s / m) * 100 : null,
      });
    }
  }

  const testesT = CARGAS.map(c => {
    const mono = celulas[`monolito|${c}`];
    const ms = celulas[`microsservicos|${c}`];
    if (mono.length < 2 || ms.length < 2) return { carga: c, insuficiente: true };
    const w = testeWelch(mono, ms);
    const s = testeStudent(mono, ms);
    // Mesmo motivo da ANOVA: sem variacao dentro dos grupos nao ha erro
    // amostral, e o t sai NaN ou Infinity. Reportar isso como "significativo"
    // seria afirmar com confianca total algo que o teste nao mediu.
    const degenerado = !Number.isFinite(w.t) || !Number.isFinite(w.p);
    return {
      carga: c,
      insuficiente: false,
      degenerado,
      motivoDegenerado: degenerado
        ? 'As repeticoes nao variam dentro dos grupos — o teste t nao se aplica.'
        : null,
      mediaMono: media(mono),
      mediaMs: media(ms),
      dpMono: dp(mono),
      dpMs: dp(ms),
      // Em escala log a diferença de médias vira razão na escala original
      razao: log ? Math.exp(media(ms) - media(mono)) : media(ms) / media(mono),
      difMedia: w.difMedia,
      welch: { t: w.t, df: w.df, p: w.p },
      student: { t: s.t, df: s.df, p: s.p },
      d: cohenD(mono, ms),
      significativo: !degenerado && w.p < ALFA,
    };
  });

  let anova = null;
  let posthoc = null;
  if (balanceado) {
    anova = anovaDoisFatores(celulas);
    const tk = tukey(celulas, anova.msErro, anova.dfErro, anova.n);
    posthoc = {
      qCrit: tk.qCrit,
      hsd: tk.hsd,
      pares: tk.pares.map(p => ({
        a: p.a.replace('|', '/'),
        b: p.b.replace('|', '/'),
        dif: p.dif,
        q: p.q,
        p: p.p,
        significativo: p.significativo,
        // Marca as comparações que confrontam arquiteturas na mesma carga
        mesmaCarga: p.a.split('|')[1] === p.b.split('|')[1],
      })),
    };
  }

  // Quais maquinas produziram este acervo. Misturar hardwares sem tratar
  // "maquina" como fator infla o residuo e derruba o poder dos testes: a
  // variacao entre maquinas entra como se fosse ruido da arquitetura.
  const maquinas = [...new Set(acervo.map(o => o.maquina?.apelido).filter(Boolean))];

  return {
    maquinas,
    misturaMaquinas: maquinas.length > 1,
    normalidade: normalidade(celulas),
    metrica,
    log,
    unidade: unidadeDe(metrica, log),
    alfa: ALFA,
    total: acervo.length,
    balanceado,
    completo,
    descritivas,
    testesT,
    anova,
    posthoc,
  };
}

// ─── Relatório ────────────────────────────────────────────────────────────

const fmtP = p => (p < 0.0001 ? '< 0,0001' : p.toFixed(4).replace('.', ','));
const num = (x, d = 2) => x.toFixed(d).replace('.', ',');

function main() {
  const args = process.argv.slice(2);
  const soValidar = args.includes('--validar');
  const iM = args.indexOf('--metrica');
  const METRICA = iM >= 0 && args[iM + 1] ? args[iM + 1] : 'avg_ms';
  const LOG = args.includes('--log');

  const ok = validar();
  if (soValidar) return;
  if (!ok) process.exit(1);

  // Acervo DESTA maquina. Juntar maquinas aqui jogaria a variacao entre
  // hardwares no residuo da ANOVA de dois fatores — ver lab.js.
  const lab = require('./lab');
  const acervo = lab.listar();
  if (acervo.length === 0) {
    console.error(`\n  Acervo vazio em ${lab.ACERVO_DIR}\n`);
    process.exit(1);
  }
  console.log(`\nMAQUINA: ${acervo[0].maquina?.apelido ?? lab.PASTA}  (${acervo.length} observacoes)`);

  const celulas = {};
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      celulas[`${arq}|${c}`] = acervo
        .filter(o => o.arquitetura === arq && o.carga === c)
        .map(o => o.metricas[METRICA])
        .filter(x => typeof x === 'number')
        // Tempo de resposta costuma ter variancia crescente com a media; o log
        // estabiliza isso e resgata a homocedasticidade que a ANOVA assume.
        .map(x => (LOG ? Math.log(x) : x));
    }
  }

  const tamanhos = Object.values(celulas).map(v => v.length);
  const balanceado = tamanhos.every(t => t === tamanhos[0]) && tamanhos[0] > 1;

  const unidade = LOG ? "ln(ms)" : METRICA === "rps" ? "req/s" : METRICA.endsWith("_ms") ? "ms" : "";
  console.log(`\n\n${'='.repeat(72)}\nMETRICA-RESPOSTA: ${METRICA} (${unidade})\n${'='.repeat(72)}`);

  console.log('\n1. DESCRITIVAS POR CELULA\n');
  console.log('  celula'.padEnd(32) + 'n'.padStart(3) + 'media'.padStart(12) + 'desvio'.padStart(11) + 'CV%'.padStart(9));
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      const v = celulas[`${arq}|${c}`];
      const m = media(v);
      const s = dp(v);
      console.log(
        `  ${(arq + '/' + c).padEnd(30)}${String(v.length).padStart(3)}${num(m).padStart(12)}${num(s).padStart(11)}${num((s / m) * 100, 1).padStart(9)}`,
      );
    }
  }
  if (!balanceado) {
    console.log('\n  AVISO: delineamento desbalanceado — a ANOVA abaixo assume celulas iguais.');
  }

  console.log('\n\n2. TESTE t — monolito x microsservicos, por carga\n');
  console.log('  (H0: as medias das duas arquiteturas sao iguais naquela carga)\n');
  for (const c of CARGAS) {
    const mono = celulas[`monolito|${c}`];
    const ms = celulas[`microsservicos|${c}`];
    const w = testeWelch(mono, ms);
    const s = testeStudent(mono, ms);
    const d = cohenD(mono, ms);
    console.log(`  ${c.toUpperCase()}`);
    console.log(`    monolito       ${num(media(mono)).padStart(10)} ± ${num(dp(mono))}`);
    console.log(`    microsservicos ${num(media(ms)).padStart(10)} ± ${num(dp(ms))}`);
    console.log(`    diferenca      ${num(w.difMedia).padStart(10)} ${unidade}  (${num((w.difMedia / media(ms)) * 100, 1)}%)`);
    console.log(`    Welch    t(${num(w.df, 2)}) = ${num(w.t, 3)}   p = ${fmtP(w.p)}   ${w.p < ALFA ? 'SIGNIFICATIVO' : 'nao significativo'}`);
    console.log(`    Student  t(${s.df}) = ${num(s.t, 3)}   p = ${fmtP(s.p)}`);
    console.log(`    d de Cohen = ${num(d, 2)}\n`);
  }

  if (!balanceado) {
    console.log('\n  ANOVA e Tukey exigem celulas balanceadas — pulando.');
    return;
  }

  const av = anovaDoisFatores(celulas);
  console.log('\n3. ANOVA DE DOIS FATORES\n');
  console.log('  fonte'.padEnd(18) + 'SS'.padStart(16) + 'gl'.padStart(5) + 'MS'.padStart(16) + 'F'.padStart(11) + 'p'.padStart(12) + 'eta2p'.padStart(9));
  for (const f of av.fatores) {
    console.log(
      `  ${f.nome.padEnd(16)}${num(f.ss, 1).padStart(16)}${String(f.df).padStart(5)}${num(f.ms, 1).padStart(16)}${num(f.F, 3).padStart(11)}${fmtP(f.p).padStart(12)}${num(f.etaP, 3).padStart(9)}`,
    );
  }
  console.log(
    `  ${'Residuo'.padEnd(16)}${num(av.residuo.ss, 1).padStart(16)}${String(av.residuo.df).padStart(5)}${num(av.residuo.ms, 1).padStart(16)}`,
  );

  const tk = tukey(celulas, av.msErro, av.dfErro, av.n);
  console.log(`\n\n4. TUKEY HSD  (q critico = ${num(tk.qCrit, 3)}, HSD = ${num(tk.hsd)} ${unidade})\n`);
  console.log('  par'.padEnd(56) + 'dif'.padStart(12) + 'q'.padStart(9) + 'p'.padStart(12));
  for (const p of tk.pares) {
    const rotulo = `${p.a.replace('|', '/')} vs ${p.b.replace('|', '/')}`;
    console.log(
      `  ${rotulo.padEnd(54)}${num(p.dif).padStart(12)}${num(p.q, 2).padStart(9)}${fmtP(p.p).padStart(12)}  ${p.significativo ? '*' : ''}`,
    );
  }
  console.log('\n  * diferenca significativa a 5%');
}

if (require.main === module) main();

module.exports = {
  resumo, analisar, porEndpoint, validar, ARQS, CARGAS, ALFA };
