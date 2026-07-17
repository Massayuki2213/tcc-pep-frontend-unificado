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
 *        BACKEND_DIR (default ../tcc-pep-backend-monolito, resolvido a partir deste arquivo)
 *
 * Endpoints:
 *   GET  /health            → { ok: true }
 *   GET  /scenarios         → scripts e cargas disponíveis
 *   GET  /status            → estado da rodada atual + tail do log
 *   GET  /results           → lista os CSVs de k6-scripts/results/
 *   GET  /results/download?file=<rel> → baixa um CSV
 *   POST /run               → { script: "cenario-emergencia", carga: "1" | "2" | "3" }
 *   POST /stop              → interrompe a rodada em andamento
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3333);
const BACKEND_DIR =
  process.env.BACKEND_DIR ||
  path.resolve(__dirname, '..', '..', 'tcc-pep-backend-monolito');

const K6_CONTAINER_NAME = 'k6_run_orchestrator';
const MAX_LOG_LINES = 400;
const RESULTS_DIR = path.join(BACKEND_DIR, 'k6-scripts', 'results');

// Whitelist — nada vindo do request vira argumento de shell além destes valores
const SCRIPTS = {
  'cenario-emergencia': '/scripts/cenario-emergencia.js',
  'cenario-mono-ms': '/scripts/cenario-mono-ms.js',
};
const CARGAS = ['1', '2', '3'];

const state = {
  running: false,
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

function startRun(script, carga) {
  state.running = true;
  state.script = script;
  state.carga = carga;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.exitCode = null;
  state.log = [`[orquestrador] iniciando ${script} (carga ${carga})...`];

  // Remove resto de rodada anterior abortada (best-effort)
  spawn('docker', ['rm', '-f', K6_CONTAINER_NAME]).on('close', () => {
    const args = [
      'compose', 'run', '--rm', '--name', K6_CONTAINER_NAME, 'k6',
      'run', '--out', 'experimental-prometheus-rw',
      '-e', `SCENARIO=${carga}`,
      SCRIPTS[script],
    ];
    appendLog(`[orquestrador] docker ${args.join(' ')}`);
    proc = spawn('docker', args, { cwd: BACKEND_DIR });

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
  if (!fs.existsSync(RESULTS_DIR)) return [];
  const out = [];
  for (const cenario of fs.readdirSync(RESULTS_DIR)) {
    const dir = path.join(RESULTS_DIR, cenario);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const arquivo of fs.readdirSync(dir)) {
      if (!arquivo.endsWith('.csv')) continue;
      const st = fs.statSync(path.join(dir, arquivo));
      out.push({
        cenario,
        arquivo,
        rel: `${cenario}/${arquivo}`,
        tamanhoBytes: st.size,
        modificadoEm: st.mtime.toISOString(),
      });
    }
  }
  // Mais recentes primeiro
  return out.sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm));
}

function baixarResultado(res, rel) {
  // Anti path-traversal: resolve e exige que o alvo fique dentro de RESULTS_DIR
  const alvo = path.resolve(RESULTS_DIR, rel || '');
  if (!alvo.startsWith(path.resolve(RESULTS_DIR) + path.sep) || !alvo.endsWith('.csv')) {
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
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
    return json(res, 200, { ok: true, backendDir: BACKEND_DIR });
  }

  if (req.method === 'GET' && pathname === '/results') {
    return json(res, 200, listarResultados());
  }

  if (req.method === 'GET' && pathname === '/results/download') {
    return baixarResultado(res, searchParams.get('file'));
  }

  if (req.method === 'GET' && req.url === '/scenarios') {
    return json(res, 200, {
      scripts: Object.keys(SCRIPTS),
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
    const { script, carga } = await readBody(req);
    if (!SCRIPTS[script]) {
      return json(res, 400, { error: `Script inválido. Use: ${Object.keys(SCRIPTS).join(', ')}` });
    }
    if (!CARGAS.includes(String(carga))) {
      return json(res, 400, { error: 'Carga inválida. Use: 1, 2 ou 3.' });
    }
    startRun(script, String(carga));
    return json(res, 202, { started: true, script, carga });
  }

  if (req.method === 'POST' && req.url === '/stop') {
    const stopped = stopRun();
    return json(res, stopped ? 200 : 409, stopped
      ? { stopped: true }
      : { error: 'Nenhuma rodada em andamento.' });
  }

  json(res, 404, { error: 'Rota não encontrada.' });
});

// 127.0.0.1: este serviço executa docker no host — nunca exponha na rede
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Orquestrador k6 em http://localhost:${PORT}`);
  console.log(`Backend (docker compose): ${BACKEND_DIR}`);
});
