/**
 * Campanha de coleta — executa o delineamento fatorial completo sem babá.
 *
 * Percorre as 6 células (2 arquiteturas × 3 cargas) até cada uma ter o número
 * de repetições pedido, zerando o banco antes de cada rodada e guardando no
 * acervo apenas as rodadas que passam na validação.
 *
 * ORDEM ALEATORIZADA: as rodadas pendentes são embaralhadas com semente fixa.
 * Rodar em bloco (todo monolito, depois todo MS) confunde a arquitetura com o
 * tempo — máquina esquenta, processos de fundo variam — e o segundo bloco
 * pareceria mais lento por motivo alheio à arquitetura. Embaralhar espalha
 * esses efeitos entre as células. A semente deixa a ordem reproduzível, o que
 * permite declará-la no relatório.
 *
 * RETOMÁVEL: lê o acervo ao iniciar e só enfileira o que falta. Se a campanha
 * cair na rodada 20, basta executar de novo.
 *
 * Uso:
 *   node orchestrator/campanha.js                    # 5 repetições, semente 42
 *   node orchestrator/campanha.js --repeticoes 3
 *   node orchestrator/campanha.js --semente 7
 *   node orchestrator/campanha.js --dry-run          # só mostra o plano
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
}
const BASE = arg('base', 'http://localhost:3333');
const REPETICOES = Number(arg('repeticoes', 5));
const SEMENTE = Number(arg('semente', 42));
const DRY_RUN = args.includes('--dry-run');

/**
 * As 6 células. O monolito usa `cenario-mono-ms`, não `cenario-emergencia`:
 * só ele espelha os 5 joins do script de microsserviços. Comparar workloads
 * diferentes invalidaria o teste t.
 */
const CELULAS = [
  { stack: 'monolito',       script: 'cenario-mono-ms',       carga: '1', arquitetura: 'monolito',       nomeCarga: 'normal' },
  { stack: 'monolito',       script: 'cenario-mono-ms',       carga: '2', arquitetura: 'monolito',       nomeCarga: 'dia-corrido' },
  { stack: 'monolito',       script: 'cenario-mono-ms',       carga: '3', arquitetura: 'monolito',       nomeCarga: 'emergencia' },
  { stack: 'microsservicos', script: 'cenario-emergencia-ms', carga: '1', arquitetura: 'microsservicos', nomeCarga: 'normal' },
  { stack: 'microsservicos', script: 'cenario-emergencia-ms', carga: '2', arquitetura: 'microsservicos', nomeCarga: 'dia-corrido' },
  { stack: 'microsservicos', script: 'cenario-emergencia-ms', carga: '3', arquitetura: 'microsservicos', nomeCarga: 'emergencia' },
];

// k6 devolve 99 quando um threshold estoura. Isso e RESULTADO, nao falha:
// a rodada rodou inteira e o CSV esta completo.
const EXITS_ACEITOS = [0, 99];
// Rodada boa tem de 4.500 a 7.700 amostras; abaixo disso foi abortada
const MIN_AMOSTRAS = 1000;
const TIMEOUT_RODADA_MS = 12 * 60 * 1000;
const INTERVALO_POLL_MS = 5000;
// Deixa a maquina assentar entre rodadas
const PAUSA_ENTRE_RODADAS_MS = 10000;

// O log vai para a pasta da propria maquina, junto do acervo que ele descreve:
// e ele a evidencia de como aquelas rodadas foram coletadas.
const maq = require('./maquina');
const LOG_FILE = path.resolve(__dirname, '..', 'laboratorio', maq.pasta(), 'campanha.log');

function registrar(msg) {
  const linha = `${new Date().toISOString()}  ${msg}`;
  console.log(linha);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, linha + '\n');
  } catch { /* log em disco e conveniencia, nao pode derrubar a campanha */ }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

/** PRNG com semente — embaralhamento reproduzível. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(lista, semente) {
  const rand = mulberry32(semente);
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function api(caminho, opcoes) {
  const r = await fetch(`${BASE}${caminho}`, opcoes);
  const texto = await r.text();
  let corpo = null;
  try { corpo = JSON.parse(texto); } catch { corpo = texto; }
  return { status: r.status, corpo };
}

async function esperarFim() {
  const limite = Date.now() + TIMEOUT_RODADA_MS;
  while (Date.now() < limite) {
    await dormir(INTERVALO_POLL_MS);
    const { corpo } = await api('/status');
    if (corpo && corpo.running === false) return corpo;
  }
  return null;
}

/** Recusa rodada abortada antes que ela vire observação do experimento. */
function validar(csvNovo, status) {
  if (!EXITS_ACEITOS.includes(status.exitCode)) {
    return { ok: false, motivo: `exitCode ${status.exitCode}` };
  }
  if (!csvNovo) return { ok: false, motivo: 'nenhum CSV novo apareceu em /results' };
  return { ok: true };
}

async function executarRodada(celula, indice, total) {
  const etiqueta = `${celula.arquitetura}/${celula.nomeCarga}`;
  registrar(`[${indice}/${total}] ${etiqueta} — iniciando (reset + k6)`);

  const antes = new Set(((await api('/results')).corpo || []).map(r => r.rel));

  const inicio = await api('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stack: celula.stack, script: celula.script, carga: celula.carga, reset: true }),
  });
  if (inicio.status !== 202) {
    registrar(`[${indice}/${total}] ${etiqueta} — FALHA ao iniciar: ${JSON.stringify(inicio.corpo)}`);
    return false;
  }
  if (inicio.corpo.reset) {
    registrar(`[${indice}/${total}] ${etiqueta} — banco zerado (${inicio.corpo.reset.linhasAntes} -> ${inicio.corpo.reset.linhasDepois} linhas)`);
  }

  const status = await esperarFim();
  if (!status) {
    registrar(`[${indice}/${total}] ${etiqueta} — TIMEOUT, abortando rodada`);
    await api('/stop', { method: 'POST' });
    return false;
  }

  const depois = (await api('/results')).corpo || [];
  const csvNovo = depois.find(r => !antes.has(r.rel) && r.stack === celula.stack);

  const v = validar(csvNovo, status);
  if (!v.ok) {
    registrar(`[${indice}/${total}] ${etiqueta} — DESCARTADA (${v.motivo})`);
    return false;
  }

  const imp = await api('/lab/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rel: csvNovo.rel }),
  });
  if (imp.status !== 201) {
    registrar(`[${indice}/${total}] ${etiqueta} — falha ao guardar: ${JSON.stringify(imp.corpo)}`);
    return false;
  }

  const m = imp.corpo.metricas;
  // A validação de amostras só é possível depois do parse, feito na importação
  if (m.samples !== null && m.samples < MIN_AMOSTRAS) {
    registrar(`[${indice}/${total}] ${etiqueta} — DESCARTADA (so ${m.samples} amostras, minimo ${MIN_AMOSTRAS}) — removendo do acervo`);
    await api(`/lab/observacoes/${imp.corpo.id}`, { method: 'DELETE' });
    return false;
  }
  if (m.error_rate_pct === 100) {
    registrar(`[${indice}/${total}] ${etiqueta} — DESCARTADA (100% de erro) — removendo do acervo`);
    await api(`/lab/observacoes/${imp.corpo.id}`, { method: 'DELETE' });
    return false;
  }

  registrar(
    `[${indice}/${total}] ${etiqueta} — OK  exit=${status.exitCode}  samples=${m.samples}  avg=${m.avg_ms}ms  p95=${m.p95_ms}ms  rps=${m.rps}`,
  );
  return true;
}

async function main() {
  const saude = await api('/health');
  if (saude.status !== 200) {
    console.error(`Orquestrador nao respondeu em ${BASE}. Rode: npm run orchestrator`);
    process.exit(1);
  }
  for (const [nome, info] of Object.entries(saude.corpo.stacks || {})) {
    if (!info.disponivel) {
      console.error(`Stack ${nome} nao encontrada em ${info.dir}`);
      process.exit(1);
    }
  }

  // A VM do Docker precisa comportar o orcamento de 4 CPU / 3 GB de UMA stack.
  // Abaixo disso o limite do compose deixa de ser o gargalo e a maquina passa a
  // ser — e ai a rodada nao e comparavel com a de outra maquina.
  const p = maq.perfil();
  registrar(`maquina: ${maq.resumo()}`);
  registrar(`acervo desta maquina: laboratorio/${maq.pasta()}/`);
  if (p.cpusDocker !== null && p.cpusDocker < 4) {
    registrar(`AVISO: a VM do Docker tem ${p.cpusDocker} CPU, abaixo das 4 que uma stack reserva.`);
    registrar('       Os limites do compose nao vao vincular e a medicao nao sera comparavel.');
    registrar('       Aumente CPUs em Docker Desktop > Settings > Resources antes de coletar.');
    if (!args.includes('--forcar')) {
      registrar('       Interrompido. Use --forcar para coletar mesmo assim.');
      return;
    }
  }

  const acervo = (await api('/lab/observacoes')).corpo || [];
  const maquinasNoAcervo = [...new Set(acervo.map(o => o.maquina?.apelido).filter(Boolean))];
  if (maquinasNoAcervo.length && !maquinasNoAcervo.includes(p.apelido)) {
    registrar(`NOTA: o acervo ja tem rodadas de ${maquinasNoAcervo.join(', ')}.`);
    registrar(`      As novas virao carimbadas como "${p.apelido}" e a analise vai`);
    registrar('      sinalizar a mistura — trate "maquina" como fator ou separe os acervos.');
  }
  const pendentes = [];
  registrar(`=== campanha: ${REPETICOES} repeticoes por celula, semente ${SEMENTE} ===`);
  // Conta so o que ESTA maquina produziu: cada maquina precisa do seu proprio
  // conjunto completo de repeticoes. Contar o acervo inteiro faria a maquina B
  // concluir que nao ha nada a coletar, porque as celulas ja estariam cheias
  // com as rodadas da maquina A.
  const daMaquina = acervo.filter(o => (o.maquina?.apelido ?? null) === p.apelido);
  if (acervo.length !== daMaquina.length) {
    registrar(`acervo total: ${acervo.length} observacoes | desta maquina: ${daMaquina.length}`);
  }
  for (const c of CELULAS) {
    const tem = daMaquina.filter(o => o.arquitetura === c.arquitetura && o.carga === c.nomeCarga).length;
    const falta = Math.max(0, REPETICOES - tem);
    registrar(`  ${(c.arquitetura + '/' + c.nomeCarga).padEnd(28)} tem ${tem}, faltam ${falta}`);
    for (let i = 0; i < falta; i++) pendentes.push(c);
  }

  if (pendentes.length === 0) {
    registrar('Nada a fazer — todas as celulas ja tem as repeticoes pedidas.');
    return;
  }

  const ordem = embaralhar(pendentes, SEMENTE);
  const minutos = Math.round((ordem.length * 4.2));
  registrar(`${ordem.length} rodadas pendentes — estimativa ~${minutos} min (~${(minutos / 60).toFixed(1)}h)`);
  // MONO/MS, nao a inicial: "monolito" e "microsservicos" comecam com a mesma letra
  registrar('ordem sorteada: ' + ordem.map(c => `${c.stack === 'monolito' ? 'MONO' : 'MS'}${c.carga}`).join(' '));

  if (DRY_RUN) {
    registrar('--dry-run: parando aqui, nada foi executado.');
    return;
  }

  let ok = 0;
  let falhas = 0;
  for (let i = 0; i < ordem.length; i++) {
    let sucesso = await executarRodada(ordem[i], i + 1, ordem.length);
    if (!sucesso) {
      registrar(`[${i + 1}/${ordem.length}] repetindo uma vez...`);
      await dormir(PAUSA_ENTRE_RODADAS_MS);
      sucesso = await executarRodada(ordem[i], i + 1, ordem.length);
    }
    sucesso ? ok++ : falhas++;
    if (i < ordem.length - 1) await dormir(PAUSA_ENTRE_RODADAS_MS);
  }

  registrar(`=== fim: ${ok} rodadas guardadas, ${falhas} descartadas ===`);
  const final = ((await api('/lab/observacoes')).corpo || [])
    .filter(o => (o.maquina?.apelido ?? null) === p.apelido);
  for (const c of CELULAS) {
    const tem = final.filter(o => o.arquitetura === c.arquitetura && o.carga === c.nomeCarga).length;
    registrar(`  ${(c.arquitetura + '/' + c.nomeCarga).padEnd(28)} ${tem}/${REPETICOES}`);
  }
}

main().catch(e => {
  registrar(`ERRO FATAL: ${e.message}`);
  process.exit(1);
});
