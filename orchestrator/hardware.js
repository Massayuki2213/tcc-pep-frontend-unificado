/**
 * Consumo de recursos de hardware por rodada — a quarta métrica do trabalho.
 *
 * O CSV do k6 traz latência, vazão e taxa de erro, mas não sabe nada sobre CPU
 * e memória. Sem trazer esses números para dentro da observação, o consumo de
 * recursos fica sendo painel do Grafana — ilustração, não evidência — e não
 * entra no teste t, na ANOVA nem no Tukey, que leem apenas
 * `observacao.metricas`.
 *
 * POR QUE `docker stats` E NÃO cAdvisor: no Docker Desktop (WSL2) o cAdvisor
 * enxerga apenas o cgroup raiz — devolve uma única série `id="/"`, sem rótulo
 * por contentor. Verificado: sobe `healthy`, expõe métricas, e nenhuma delas
 * separa os contentores. O `docker stats` funciona porque fala com o daemon em
 * vez de ler cgroups do host, e o orquestrador já executa `docker` aqui
 * (ver reset.js). Zero contentores novos, zero dependências.
 *
 * SISTEMA MEDIDO: somente os contentores que disputam o orçamento de 4 CPU /
 * 3 GB. Prometheus, Grafana e o próprio k6 observam o experimento em vez de
 * participar dele; somá-los inflaria o consumo com o custo de medir.
 *
 * JANELA: a rodada inteira, incluindo rampa de subida e descida. Isso dilui um
 * pouco a média em relação ao platô, mas as duas arquiteturas rodam exatamente
 * os mesmos estágios, então o viés é idêntico dos dois lados e a comparação
 * continua justa. O `max` recupera o pico, que acontece no platô.
 */
const { spawn } = require('child_process');

/** O orçamento espelhado das duas stacks, usado para converter em percentual. */
const ORCAMENTO = { cpus: 4, memoriaBytes: 3 * 1024 ** 3 };

/** De quanto em quanto tempo o amostrador pergunta ao daemon. */
const INTERVALO_MS = Number(process.env.HW_INTERVALO_MS || 2000);

/**
 * Os contentores de cada stack que estão DENTRO do orçamento — é a fronteira
 * experimental, a mesma que os `deploy.resources.limits` definem nos compose.
 * Lista explícita e não descoberta automática: o que é o sistema medido é
 * decisão do experimento, não algo a adivinhar em tempo de execução.
 */
const STACKS = {
  monolito: {
    containers: ['app_nestjs_monolito', 'db_postgres_monolito', 'db_mongo_monolito'],
  },
  microsservicos: {
    containers: [
      'api_gateway',
      'ms_medicos',
      'ms_pacientes',
      'ms_atendimentos',
      'ms_auditoria',
      'ms_consultas_laudos',
      'ms_historico_clinicos',
      'db_postgres_pep_ms',
      'db_mongo_ms',
    ],
  },
};

/** Nomes das colunas que este módulo acrescenta a `observacao.metricas`. */
const METRICAS = [
  'cpu_cores_avg', 'cpu_cores_max', 'cpu_pct_avg', 'cpu_pct_max',
  'mem_mb_avg', 'mem_mb_max', 'mem_pct_avg', 'mem_pct_max',
];

const FORMATO = '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}';

// --- Leitura do daemon ------------------------------------------------------

/**
 * Uma fotografia do consumo agora. Usa `--no-stream` para obter uma leitura e
 * sair, em vez de manter um processo preso ao terminal.
 */
function fotografar(timeoutMs = 10000) {
  return new Promise(resolve => {
    const p = spawn('docker', ['stats', '--no-stream', '--format', FORMATO]);
    let saida = '';
    const limite = setTimeout(() => { p.kill(); resolve(null); }, timeoutMs);
    p.stdout.on('data', c => { saida += c; });
    p.on('error', () => { clearTimeout(limite); resolve(null); });
    p.on('close', code => {
      clearTimeout(limite);
      resolve(code === 0 ? saida : null);
    });
  });
}

/** "203.45%" -> 2.0345 cores. O docker passa de 100% em multi-core. */
function cores(txt) {
  const n = parseFloat(String(txt).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n / 100 : null;
}

/** "512MiB / 1GiB" -> bytes do primeiro termo (uso, não limite). */
function bytes(txt) {
  const usado = String(txt).split('/')[0].trim();
  const m = usado.match(/^([\d.,]+)\s*([KMGT]?i?B)$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const mult = {
    B: 1,
    KB: 1000, KIB: 1024,
    MB: 1000 ** 2, MIB: 1024 ** 2,
    GB: 1000 ** 3, GIB: 1024 ** 3,
    TB: 1000 ** 4, TIB: 1024 ** 4,
  }[m[2].toUpperCase()];
  return mult ? n * mult : null;
}

/** Converte a saída do `docker stats` num mapa nome -> { cores, bytes }. */
function interpretar(saida, interessam) {
  const mapa = new Map();
  if (!saida) return mapa;
  for (const linha of saida.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [nome, cpu, mem] = linha.split('\t');
    if (!nome || !interessam.has(nome.trim())) continue;
    mapa.set(nome.trim(), { cores: cores(cpu), bytes: bytes(mem) });
  }
  return mapa;
}

// --- Agregação (verificada; não mudou ao trocar a fonte) --------------------

function media(ns) {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}

/**
 * Soma os contentores dentro de cada amostra antes de agregar no tempo. Tirar a
 * média de cada contentor e somar depois daria outro número: o pico do sistema
 * é a soma simultânea, não a soma dos picos individuais, que podem não
 * coincidir no tempo.
 */
function totalPorInstante(amostras, campo) {
  return amostras.map(amostra => {
    let soma = 0;
    for (const v of amostra.values()) {
      if (Number.isFinite(v[campo])) soma += v[campo];
    }
    return soma;
  });
}

function arred(n, casas) {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// --- API --------------------------------------------------------------------

/**
 * Começa a amostrar o consumo da stack. Devolve um amostrador cujo `parar()`
 * entrega as métricas da janela.
 *
 * Nunca lança: falha de coleta não pode derrubar a rodada, que é o dado caro.
 * O resultado vem com `{ erro }` e a observação nasce com as colunas de
 * hardware nulas — visível, e não silenciosamente zerado.
 */
function iniciar(stack) {
  const cfg = STACKS[stack];
  const inicio = new Date().toISOString();
  const amostras = [];
  let falhas = 0;
  let coletando = false;

  if (!cfg) {
    return { parar: async () => ({ erro: `Stack desconhecida: ${stack}` }) };
  }
  const interessam = new Set(cfg.containers);

  async function amostrar() {
    // Uma leitura lenta não pode empilhar leituras: o daemon ficaria com fila
    // de `docker stats` e o custo de medir entraria na medição.
    if (coletando) return;
    coletando = true;
    try {
      const mapa = interpretar(await fotografar(), interessam);
      if (mapa.size === 0) falhas++;
      else amostras.push(mapa);
    } catch {
      falhas++;
    } finally {
      coletando = false;
    }
  }

  amostrar();
  const timer = setInterval(amostrar, INTERVALO_MS);
  if (timer.unref) timer.unref();

  return {
    async parar() {
      clearInterval(timer);
      // Uma última leitura para não perder o fim do platô
      await amostrar();

      const fim = new Date().toISOString();
      if (amostras.length === 0) {
        return {
          erro: falhas > 0
            ? 'docker stats nao devolveu nenhum contentor da stack — o Docker esta no ar?'
            : 'nenhuma amostra coletada na janela da rodada',
        };
      }

      const cpuT = totalPorInstante(amostras, 'cores');
      const memT = totalPorInstante(amostras, 'bytes');
      const cpuAvg = media(cpuT);
      const cpuMax = Math.max(...cpuT);
      const memAvg = media(memT);
      const memMax = Math.max(...memT);
      const MB = 1024 ** 2;

      // Detalhamento por contentor, no mesmo espírito do `porJoin`: é o que
      // permite dizer DE ONDE veio o consumo — do gateway, dos serviços ou dos
      // bancos.
      const porNome = new Map();
      for (const amostra of amostras) {
        for (const [nome, v] of amostra) {
          if (!porNome.has(nome)) porNome.set(nome, { cores: [], bytes: [] });
          const acc = porNome.get(nome);
          if (Number.isFinite(v.cores)) acc.cores.push(v.cores);
          if (Number.isFinite(v.bytes)) acc.bytes.push(v.bytes);
        }
      }

      return {
        metricas: {
          cpu_cores_avg: arred(cpuAvg, 3),
          cpu_cores_max: arred(cpuMax, 3),
          cpu_pct_avg: arred((cpuAvg / ORCAMENTO.cpus) * 100, 2),
          cpu_pct_max: arred((cpuMax / ORCAMENTO.cpus) * 100, 2),
          mem_mb_avg: arred(memAvg / MB, 1),
          mem_mb_max: arred(memMax / MB, 1),
          mem_pct_avg: arred((memAvg / ORCAMENTO.memoriaBytes) * 100, 2),
          mem_pct_max: arred((memMax / ORCAMENTO.memoriaBytes) * 100, 2),
        },
        porContainer: [...porNome.entries()]
          .map(([nome, a]) => ({
            nome,
            cpu_cores_avg: arred(media(a.cores), 3),
            cpu_cores_max: a.cores.length ? arred(Math.max(...a.cores), 3) : null,
            mem_mb_avg: arred(media(a.bytes) === null ? null : media(a.bytes) / MB, 1),
            mem_mb_max: a.bytes.length ? arred(Math.max(...a.bytes) / MB, 1) : null,
          }))
          .sort((x, y) => x.nome.localeCompare(y.nome)),
        janela: { inicio, fim, amostras: amostras.length, falhas },
        containersVistos: [...porNome.keys()].sort(),
        // Contentor esperado e não visto é sinal de coleta incompleta: o
        // consumo sairia subestimado sem nada indicar que faltou alguém.
        containersAusentes: cfg.containers.filter(c => !porNome.has(c)),
      };
    },
  };
}

/** Linha curta para o log da rodada. */
function resumo(h) {
  if (!h || h.erro) return `hardware: indisponivel (${h?.erro || 'sem dados'})`;
  const m = h.metricas;
  return (
    `hardware: CPU ${m.cpu_cores_avg}/${ORCAMENTO.cpus} cores (pico ${m.cpu_cores_max}) | ` +
    `RAM ${m.mem_mb_avg} MB (pico ${m.mem_mb_max}) | ` +
    `${h.containersVistos.length} contentores, ${h.janela.amostras} amostras`
  );
}

module.exports = { ORCAMENTO, STACKS, METRICAS, INTERVALO_MS, iniciar, resumo };
