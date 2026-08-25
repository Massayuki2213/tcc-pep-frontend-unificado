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

  return {
    n, N, ssTotal, msErro, dfErro,
    fatores: [
      { nome: 'Arquitetura', ss: ssA, df: dfA, ms: msA, F: msA / msErro, p: pValorF(msA / msErro, dfA, dfErro), etaP: ssA / (ssA + ssDentro) },
      { nome: 'Carga', ss: ssB, df: dfB, ms: msB, F: msB / msErro, p: pValorF(msB / msErro, dfB, dfErro), etaP: ssB / (ssB + ssDentro) },
      { nome: 'Interacao', ss: ssAB, df: dfAB, ms: msAB, F: msAB / msErro, p: pValorF(msAB / msErro, dfAB, dfErro), etaP: ssAB / (ssAB + ssDentro) },
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

  const pares = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const dif = media(celulas[chaves[i]]) - media(celulas[chaves[j]]);
      const q = Math.abs(dif) / se;
      pares.push({
        a: chaves[i], b: chaves[j], dif, q,
        p: 1 - ptukey(q, k, dfErro),
        significativo: Math.abs(dif) > hsd,
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

// ─── Relatório ────────────────────────────────────────────────────────────

const fmtP = p => (p < 0.0001 ? '< 0,0001' : p.toFixed(4).replace('.', ','));
const num = (x, d = 2) => x.toFixed(d).replace('.', ',');

function main() {
  const args = process.argv.slice(2);
  const soValidar = args.includes('--validar');
  const iM = args.indexOf('--metrica');
  const METRICA = iM >= 0 && args[iM + 1] ? args[iM + 1] : 'avg_ms';

  const ok = validar();
  if (soValidar) return;
  if (!ok) process.exit(1);

  const fs = require('fs');
  const path = require('path');
  const acervo = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'laboratorio', 'observacoes.json'), 'utf8'),
  );

  const celulas = {};
  for (const arq of ARQS) {
    for (const c of CARGAS) {
      celulas[`${arq}|${c}`] = acervo
        .filter(o => o.arquitetura === arq && o.carga === c)
        .map(o => o.metricas[METRICA])
        .filter(x => typeof x === 'number');
    }
  }

  const tamanhos = Object.values(celulas).map(v => v.length);
  const balanceado = tamanhos.every(t => t === tamanhos[0]) && tamanhos[0] > 1;

  const unidade = METRICA === 'rps' ? 'req/s' : METRICA.endsWith('_ms') ? 'ms' : '';
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

main();
