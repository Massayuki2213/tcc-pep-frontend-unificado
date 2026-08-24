/**
 * Orquestrador de testes k6 — ferramenta de medição do TCC.
 *
 * Roda no HOST (fora dos containers do benchmark) de propósito: o sistema
 * medido está limitado a 4 CPU / 3G espelhados com o MS, e quem dispara a
 * medição não pode consumir esse budget.
 *
 * Zero dependências — só Node built-ins.
 *
 * Uso:   node orchestrator/server.js
 * Env:   PORT        (default 3333)
 *        BACKEND_DIR (default ../../tcc-pep-backend-monolito) — stack monolito
 *        MS_DIR      (default ../../tcc-pep-backend-ms/tcc-pep-backend-microsservicos)
 *
 * Endpoints:
 *   GET  /health            → { ok: true }
 *   GET  /scenarios         → scripts e cargas disponíveis
 *   GET  /status            → estado da rodada atual + tail do log
 *   GET  /results           → lista os CSVs de k6-scripts/results/
 *   GET  /results/download?file=<rel> → baixa um CSV
 *   POST /run               → { script: "cenario-emergencia", carga: "1" | "2" | "3" }
 *   POST /stop              → interrompe a rodada em andamento
 *
 *   Laboratório (acervo de observações para o teste t / ANOVA):
 *   GET    /lab/observacoes        → todas as rodadas guardadas
 *   POST   /lab/observacoes        → { csv, arquivo, arquitetura, carga, nota }
 *   POST   /lab/importar           → { rel } importa um CSV vindo de /results
 *   PATCH  /lab/observacoes/<id>   → { arquitetura, carga, nota }
 *   DELETE /lab/observacoes/<id>   → remove do acervo
 *   GET    /lab/observacoes/<id>/csv → baixa o CSV original da rodada
 *   GET    /lab/dataset.csv        → dataset tidy consolidado
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const lab = require('./lab');

const PORT = Number(process.env.PORT || 3333);

const BACKEND_DIR =
  process.env.BACKEND_DIR ||
  path.resolve(__dirname, '..', '..', 'tcc-pep-backend-monolito');
const MS_DIR =
  process.env.MS_DIR ||
  path.resolve(__dirname, '..', '..', 'tcc-pep-backend-ms', 'tcc-pep-backend-microsservicos');

const K6_CONTAINER_NAME = 'k6_run_orchestrator';
const MAX_LOG_LINES = 400;

/**
 * As duas stacks comparadas pelo TCC. Cada uma tem seu docker-compose, seus
 * scripts k6 e seu diretório de resultados — mas o CSV de saída é idêntico,
 * o que permite consolidar tudo no laboratório.
 *
 * `scripts` é whitelist: nada vindo do request vira argumento além destes valores.
 */
const STACKS = {
  monolito: {
    nome: 'Monolito',
    dir: BACKEND_DIR,
    perfil: null,
    env: {},
    scripts: {
      'cenario-emergencia': '/scripts/cenario-emergencia.js',
      'cenario-mono-ms': '/scripts/cenario-mono-ms.js',
    },
  },
  microsservicos: {
    nome: 'Microsserviços',
    dir: MS_DIR,
    // O serviço k6 do compose do MS está sob profiles: ["load-test"]
    perfil: 'load-test',
    // Sem API_GATEWAY o script cai no fallback `http://ms-medicos:3001`, que
    // não tem o segmento do recurso e devolve 404 em todo POST. Roteando pelo
    // gateway as URLs saem completas — e essa é a topologia real do MS, com o
    // hop do gateway contando no tempo de resposta medido.
    env: { API_GATEWAY: 'http://api-gateway:4000' },
    scripts: {
      'cenario-emergencia-ms': '/scripts/cenario-emergencia-ms.js',
    },
  },
};
const CARGAS = ['1', '2', '3'];

function resultsDirDe(stack) {
  return path.join(STACKS[stack].dir, 'k6-scripts', 'results');
}

const state = {
  running: false,
  stack: null,
  script: null,
  carga: null,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  log: [],
};
let proc = null;

function appendLog(chunk) {
  const lines = chunk.toString().split(/\r?\n/).filter(l => l.trim() !== '');
  state.log.push(...lines);
  if (state.log.length > MAX_LOG_LINES) {
    state.log.splice(0, state.log.length - MAX_LOG_LINES);
  }
}

function startRun(stack, script, carga) {
  const cfg = STACKS[stack];
  state.running = true;
  state.stack = stack;
  state.script = script;
  state.carga = carga;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.exitCode = null;
  state.log = [`[orquestrador] iniciando ${script} em ${cfg.nome} (carga ${carga})...`];

  // Remove resto de rodada anterior abortada (best-effort)
  spawn('docker', ['rm', '-f', K6_CONTAINER_NAME]).on('close', () => {
    const args = ['compose'];
    if (cfg.perfil) args.push('--profile', cfg.perfil);
    args.push('run', '--rm', '--name', K6_CONTAINER_NAME, 'k6', 'run', '--out', 'experimental-prometheus-rw');
    args.push('-e', `SCENARIO=${carga}`);
    for (const [chave, valor] of Object.entries(cfg.env)) {
      args.push('-e', `${chave}=${valor}`);
    }
    args.push(cfg.scripts[script]);
    appendLog(`[orquestrador] cwd=${cfg.dir}`);
    appendLog(`[orquestrador] docker ${args.join(' ')}`);
    proc = spawn('docker', args, { cwd: cfg.dir });

    proc.stdout.on('data', appendLog);
    proc.stderr.on('data', appendLog);
    proc.on('error', err => {
      appendLog(`[orquestrador] erro ao executar docker: ${err.message}`);
      finishRun(-1);
    });
    proc.on('close', code => finishRun(code));
  });
}

function finishRun(code) {
  if (!state.running) return;
  state.running = false;
  state.finishedAt = new Date().toISOString();
  state.exitCode = code;
  appendLog(`[orquestrador] rodada encerrada (exit ${code})`);
  proc = null;
}

function stopRun() {
  if (!state.running) return false;
  appendLog('[orquestrador] parada solicitada — docker stop...');
  spawn('docker', ['stop', K6_CONTAINER_NAME]);
  if (proc) proc.kill();
  return true;
}

function listarResultados() {
  const out = [];
  for (const stack of Object.keys(STACKS)) {
    const raiz = resultsDirDe(stack);
    if (!fs.existsSync(raiz)) continue;
    for (const cenario of fs.readdirSync(raiz)) {
      const dir = path.join(raiz, cenario);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const arquivo of fs.readdirSync(dir)) {
        if (!arquivo.endsWith('.csv')) continue;
        const st = fs.statSync(path.join(dir, arquivo));
        out.push({
          stack,
          stackNome: STACKS[stack].nome,
          cenario,
          arquivo,
          // O prefixo da stack desambigua CSVs homônimos entre os dois repos
          rel: `${stack}/${cenario}/${arquivo}`,
          tamanhoBytes: st.size,
          modificadoEm: st.mtime.toISOString(),
        });
      }
    }
  }
  // Mais recentes primeiro
  return out.sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm));
}

/**
 * Resolve `<stack>/<cenario>/<arquivo>` para um caminho absoluto, recusando
 * qualquer coisa que escape do diretório de resultados daquela stack.
 */
function resolverResultado(rel) {
  const [stack, ...resto] = String(rel || '').split('/');
  if (!STACKS[stack] || resto.length === 0) return null;
  const raiz = path.resolve(resultsDirDe(stack));
  const alvo = path.resolve(raiz, resto.join('/'));
  if (!alvo.startsWith(raiz + path.sep) || !alvo.endsWith('.csv')) return null;
  return alvo;
}

function baixarResultado(res, rel) {
  const alvo = resolverResultado(rel);
  if (!alvo) {
    return json(res, 400, { error: 'Arquivo inválido.' });
  }
  if (!fs.existsSync(alvo)) {
    return json(res, 404, { error: 'Arquivo não encontrado.' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${path.basename(alvo)}"`,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(alvo).pipe(res);
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function texto(res, status, corpo, tipo, nomeArquivo) {
  const headers = {
    'Content-Type': tipo,
    'Access-Control-Allow-Origin': '*',
  };
  if (nomeArquivo) headers['Content-Disposition'] = `attachment; filename="${nomeArquivo}"`;
  res.writeHead(status, headers);
  res.end(corpo);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, {
      ok: true,
      backendDir: BACKEND_DIR,
      stacks: Object.fromEntries(
        Object.entries(STACKS).map(([k, c]) => [k, { dir: c.dir, disponivel: fs.existsSync(c.dir) }]),
      ),
    });
  }

  if (req.method === 'GET' && pathname === '/results') {
    return json(res, 200, listarResultados());
  }

  if (req.method === 'GET' && pathname === '/results/download') {
    return baixarResultado(res, searchParams.get('file'));
  }

  if (req.method === 'GET' && req.url === '/scenarios') {
    return json(res, 200, {
      stacks: Object.entries(STACKS).map(([valor, cfg]) => ({
        valor,
        nome: cfg.nome,
        dir: cfg.dir,
        // Se o repo não está no disco, a UI mostra a stack como indisponível
        disponivel: fs.existsSync(cfg.dir),
        scripts: Object.keys(cfg.scripts),
      })),
      cargas: [
        { valor: '1', nome: 'Normal (50 VUs)' },
        { valor: '2', nome: 'Dia Corrido (150 VUs)' },
        { valor: '3', nome: 'Emergência (300 VUs)' },
      ],
    });
  }

  if (req.method === 'GET' && req.url === '/status') {
    return json(res, 200, state);
  }

  if (req.method === 'POST' && req.url === '/run') {
    if (state.running) {
      return json(res, 409, { error: 'Já existe uma rodada em andamento.' });
    }
    const body = await readBody(req);
    // `stack` é opcional: chamadas antigas continuam medindo o monolito
    const stack = body.stack || 'monolito';
    const { script, carga } = body;

    const cfg = STACKS[stack];
    if (!cfg) {
      return json(res, 400, { error: `Stack inválida. Use: ${Object.keys(STACKS).join(', ')}` });
    }
    if (!fs.existsSync(cfg.dir)) {
      return json(res, 400, { error: `Repositório de ${cfg.nome} não encontrado em ${cfg.dir}.` });
    }
    if (!cfg.scripts[script]) {
      return json(res, 400, {
        error: `Script inválido para ${cfg.nome}. Use: ${Object.keys(cfg.scripts).join(', ')}`,
      });
    }
    if (!CARGAS.includes(String(carga))) {
      return json(res, 400, { error: 'Carga inválida. Use: 1, 2 ou 3.' });
    }
    startRun(stack, script, String(carga));
    return json(res, 202, { started: true, stack, script, carga });
  }

  if (req.method === 'POST' && req.url === '/stop') {
    const stopped = stopRun();
    return json(res, stopped ? 200 : 409, stopped
      ? { stopped: true }
      : { error: 'Nenhuma rodada em andamento.' });
  }

  // --- Laboratório ----------------------------------------------------------

  if (req.method === 'GET' && pathname === '/lab/observacoes') {
    return json(res, 200, lab.listar());
  }

  if (req.method === 'GET' && pathname === '/lab/dataset.csv') {
    return texto(res, 200, lab.datasetCsv(), 'text/csv; charset=utf-8', 'laboratorio-dataset.csv');
  }

  if (req.method === 'POST' && pathname === '/lab/importar') {
    const { rel } = await readBody(req);
    const r = lab.importarDoResults(rel, resolverResultado(rel));
    return json(res, r.erro ? 400 : 201, r.erro ? { error: r.erro } : r.obs);
  }

  if (req.method === 'POST' && pathname === '/lab/observacoes') {
    const { csv, arquivo, arquitetura, carga, nota } = await readBody(req);
    if (typeof csv !== 'string' || csv.trim() === '') {
      return json(res, 400, { error: 'Envie o conteúdo do CSV em `csv`.' });
    }
    if (csv.length > 2_000_000) {
      return json(res, 413, { error: 'CSV grande demais — esperado o sumário do k6, não o log bruto.' });
    }
    const r = lab.criar(csv, arquivo || 'colado.csv', { arquitetura, carga, nota, origem: 'upload' });
    return json(res, r.erro ? 400 : 201, r.erro ? { error: r.erro } : r.obs);
  }

  const obsMatch = pathname.match(/^\/lab\/observacoes\/([0-9a-f-]{36})(\/csv)?$/);
  if (obsMatch) {
    const [, id, sufixoCsv] = obsMatch;

    if (req.method === 'GET' && sufixoCsv) {
      const arq = lab.csvDaObservacao(id);
      if (!arq) return json(res, 404, { error: 'Observação não encontrada.' });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${arq.nome}"`,
        'Access-Control-Allow-Origin': '*',
      });
      return fs.createReadStream(arq.caminho).pipe(res);
    }

    if (req.method === 'PATCH') {
      const r = lab.atualizar(id, await readBody(req));
      return json(res, r.erro ? 400 : 200, r.erro ? { error: r.erro } : r.obs);
    }

    if (req.method === 'DELETE') {
      const r = lab.remover(id);
      return json(res, r.erro ? 404 : 200, r.erro ? { error: r.erro } : r);
    }
  }

  json(res, 404, { error: 'Rota não encontrada.' });
});

// 127.0.0.1: este serviço executa docker no host — nunca exponha na rede
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Orquestrador k6 em http://localhost:${PORT}`);
  for (const [k, c] of Object.entries(STACKS)) {
    console.log(`Stack ${k.padEnd(15)} ${fs.existsSync(c.dir) ? '✓' : '✗ (não encontrada)'} ${c.dir}`);
  }
  console.log(`Laboratório (acervo):     ${lab.LAB_DIR}`);
});
