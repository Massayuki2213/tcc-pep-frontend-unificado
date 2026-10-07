/**
 * Verificação da ANOVA de três fatores contra um caso de referência construído.
 *
 * Gera dados com efeitos CONHECIDOS e confere se o modelo os recupera. É o único
 * jeito de saber que a decomposição está certa sem depender dos dados reais —
 * se eu validasse contra eles, estaria conferindo o resultado contra si mesmo.
 */
const path = require('path');
const A = path.resolve('C:/projetos/tcc-pep-frontend/orchestrator/analise.js');
const mod = require(A);

// Reexecuta o arquivo para alcançar a função interna
const src = require('fs').readFileSync(A, 'utf8');
const sandbox = { module: { exports: {} }, require, console, process };
sandbox.exports = sandbox.module.exports;
new Function('module', 'exports', 'require', 'console', 'process', src + '\n;module.exports.__anova3 = anovaTresFatores;')(
  sandbox.module, sandbox.exports, require, console, process,
);
const anova3 = sandbox.module.exports.__anova3;

const ARQS = ['monolito', 'microsservicos'];
const CARGAS = ['normal', 'dia-corrido', 'emergencia'];
const MAQS = ['notebook', 'desktop'];

// PRNG com semente — o teste precisa ser reproduzível
let s = 12345;
function rand() {
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  return s / 0x7fffffff;
}
function normal() {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}

/** Monta células com efeitos aditivos conhecidos e ruído controlado. */
function gerar({ efA, efB, efC, efAC, sigma, n }) {
  const celulas = {};
  for (const i of ARQS) {
    for (const j of CARGAS) {
      for (const k of MAQS) {
        const v = [];
        for (let r = 0; r < n; r++) {
          v.push(
            100 +
            (i === 'microsservicos' ? efA : 0) +
            (j === 'dia-corrido' ? efB : j === 'emergencia' ? 2 * efB : 0) +
            (k === 'notebook' ? efC : 0) +
            (i === 'microsservicos' && k === 'notebook' ? efAC : 0) +
            sigma * normal(),
          );
        }
        celulas[`${i}|${j}|${k}`] = v;
      }
    }
  }
  return celulas;
}

const casos = [];
const check = (nome, ok, detalhe) => casos.push({ nome, ok, detalhe });

// ── 1. Decomposição exata: SS_total = soma de todos os efeitos + resíduo
{
  const r = anova3(gerar({ efA: 30, efB: 20, efC: 10, efAC: 5, sigma: 4, n: 5 }), MAQS);
  check('decomposicao exata (SS_total = sum SS)', r.decomposicaoExata,
    `residuo da decomposicao = ${r.residuoDecomposicao.toExponential(2)}`);
  const glSoma = r.fatores.reduce((a, f) => a + f.df, 0) + r.residuo.df;
  check('graus de liberdade somam N-1', glSoma === r.N - 1, `${glSoma} vs ${r.N - 1}`);
  check('gl do residuo = N - a*b*c', r.residuo.df === 60 - 12, `${r.residuo.df}`);
}

// ── 2. Efeito presente é detectado
{
  const r = anova3(gerar({ efA: 30, efB: 20, efC: 10, efAC: 0, sigma: 4, n: 5 }), MAQS);
  const f = nome => r.fatores.find(x => x.nome === nome);
  check('detecta efeito de Arquitetura', f('Arquitetura').p < 0.001, `p=${f('Arquitetura').p.toExponential(2)}`);
  check('detecta efeito de Carga', f('Carga').p < 0.001, `p=${f('Carga').p.toExponential(2)}`);
  check('detecta efeito de Maquina', f('Máquina').p < 0.001, `p=${f('Máquina').p.toExponential(2)}`);
}

// ── 3. Efeito ausente: a TAXA de falsos positivos deve ficar perto de alfa.
// Julgar por um sorteio unico seria errado — sob a nula, p<0,05 acontece em 5%
// das vezes por definicao. O que valida a implementacao e a calibracao: se a
// distribuicao F estiver certa, a taxa converge para alfa.
{
  const REPS = 400;
  let fpAC = 0, fpABC = 0, fpBC = 0;
  for (let r = 0; r < REPS; r++) {
    const res = anova3(gerar({ efA: 30, efB: 20, efC: 10, efAC: 0, sigma: 4, n: 5 }), MAQS);
    const f = nome => res.fatores.find(x => x.nome === nome).p;
    if (f('Arquitetura × Máquina') < 0.05) fpAC++;
    if (f('Carga × Máquina') < 0.05) fpBC++;
    if (f('Arquitetura × Carga × Máquina') < 0.05) fpABC++;
  }
  // Erro padrao de uma proporcao de 0,05 em 400 ensaios e ~1,1pp; +-3pp e folga
  // suficiente para nao acusar falha por acaso, e apertado o bastante para
  // flagrar um F mal calibrado (que daria taxas tipo 20% ou 0%).
  const dentro = (taxa) => Math.abs(taxa - 0.05) < 0.03;
  check('taxa de falso positivo A x Maquina ~ 5%', dentro(fpAC / REPS), `${(100 * fpAC / REPS).toFixed(1)}%`);
  check('taxa de falso positivo B x Maquina ~ 5%', dentro(fpBC / REPS), `${(100 * fpBC / REPS).toFixed(1)}%`);
  check('taxa de falso positivo tripla ~ 5%', dentro(fpABC / REPS), `${(100 * fpABC / REPS).toFixed(1)}%`);
}

// ── 4. Interação injetada é recuperada
{
  const r = anova3(gerar({ efA: 30, efB: 20, efC: 10, efAC: 40, sigma: 4, n: 5 }), MAQS);
  const f = r.fatores.find(x => x.nome === 'Arquitetura × Máquina');
  check('recupera Arquitetura x Maquina injetada', f.p < 0.001, `p=${f.p.toExponential(2)}`);
}

// ── 5. Sem variação dentro das células → degenerado, não "significativo"
{
  const c = {};
  for (const i of ARQS) for (const j of CARGAS) for (const k of MAQS) c[`${i}|${j}|${k}`] = [5, 5, 5, 5, 5];
  const r = anova3(c, MAQS);
  check('variancia nula vira degenerado', r.degenerado === true && r.fatores.every(f => f.F === null),
    `degenerado=${r.degenerado}`);
}

// ── 6. SS da Máquina bate com o cálculo manual
{
  const cel = gerar({ efA: 30, efB: 20, efC: 10, efAC: 0, sigma: 4, n: 5 });
  const r = anova3(cel, MAQS);
  const med = v => v.reduce((x, y) => x + y, 0) / v.length;
  const todos = [];
  const porMaq = { notebook: [], desktop: [] };
  for (const i of ARQS) for (const j of CARGAS) for (const k of MAQS) {
    todos.push(...cel[`${i}|${j}|${k}`]);
    porMaq[k].push(...cel[`${i}|${j}|${k}`]);
  }
  const mu = med(todos);
  const manual = MAQS.reduce((acc, k) => acc + porMaq[k].length * (med(porMaq[k]) - mu) ** 2, 0);
  const obtido = r.fatores.find(f => f.nome === 'Máquina').ss;
  check('SS da Maquina confere com calculo manual', Math.abs(manual - obtido) < 1e-8,
    `manual=${manual.toFixed(6)} obtido=${obtido.toFixed(6)}`);
}

console.log('\nVERIFICACAO DA ANOVA DE TRES FATORES\n');
let ok = true;
for (const c of casos) {
  if (!c.ok) ok = false;
  console.log(`  ${c.ok ? 'ok   ' : 'FALHA'} ${c.nome.padEnd(42)} ${c.detalhe}`);
}
console.log(`\n  ${ok ? 'Todas as verificacoes passaram.' : 'HA FALHA — nao confie nos resultados.'}\n`);
process.exit(ok ? 0 : 1);
