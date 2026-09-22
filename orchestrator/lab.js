/**
 * Laboratório de experimentos — acervo das rodadas de benchmark.
 *
 * Guarda cada rodada do k6 como uma OBSERVAÇÃO do delineamento fatorial
 * descrito no report 4: arquitetura (2 níveis) × carga (3 níveis).
 *
 * Por que uma rodada inteira vira UMA observação: o handleSummary do k6 grava
 * apenas o agregado da rodada (média, percentis, rps). Não existem medidas
 * independentes dentro de um mesmo arquivo — os percentis derivam das mesmas
 * requisições. Logo, a unidade experimental é a rodada, e a replicação vem de
 * repetir a mesma célula várias vezes. É isso que o teste t e a ANOVA exigem.
 *
 * Este módulo só ARMAZENA e CONSOLIDA. Não calcula p-valor: a inferência é
 * feita sob demanda, a partir do dataset exportado.
 *
 * Env: LAB_DIR (default ../laboratorio, ao lado de orchestrator/)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const maquina = require('./maquina');

const LAB_DIR = process.env.LAB_DIR || path.resolve(__dirname, '..', 'laboratorio');
const CSV_DIR = path.join(LAB_DIR, 'csv');
const INDEX_FILE = path.join(LAB_DIR, 'observacoes.json');

const ARQUITETURAS = ['monolito', 'microsservicos'];
const CARGAS = ['normal', 'dia-corrido', 'emergencia'];

/** Colunas numéricas do CSV do k6 — o resto é tratado como texto. */
const NUMERICAS = [
  'vus_max', 'samples', 'avg_ms', 'min_ms', 'med_ms',
  'p90_ms', 'p95_ms', 'p99_ms', 'max_ms', 'rps', 'error_rate_pct', 'slo_pass_pct',
];

// --- Persistência -----------------------------------------------------------

function garantirDirs() {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]', 'utf8');
}

function listar() {
  garantirDirs();
  try {
    const dados = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function gravar(lista) {
  garantirDirs();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(lista, null, 2), 'utf8');
}

// --- Parsing do CSV do k6 ---------------------------------------------------

/** Split de linha CSV respeitando aspas — os labels contêm vírgula. */
function separarCampos(linha) {
  const campos = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroAspas = !dentroAspas;
    } else if (c === ',' && !dentroAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map(c => c.trim());
}

function parseCsv(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  if (linhas.length < 2) return { cabecalho: [], linhas: [] };
  const cabecalho = separarCampos(linhas[0]);
  const registros = linhas.slice(1).map(l => {
    const campos = separarCampos(l);
    const obj = {};
    cabecalho.forEach((col, i) => { obj[col] = campos[i] ?? ''; });
    return obj;
  });
  return { cabecalho, linhas: registros };
}

function numero(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** O script rotula a linha consolidada ora como `label`, ora como `join`. */
function rotulo(registro) {
  return registro.label ?? registro.join ?? '';
}

function normalizarArquitetura(valor) {
  const v = String(valor || '').toLowerCase().trim();
  if (!v) return null;
  if (v.startsWith('mono')) return 'monolito';
  if (v.startsWith('micro') || v === 'ms') return 'microsservicos';
  return null;
}

function normalizarCarga(valor) {
  const v = String(valor || '').toLowerCase().trim();
  if (CARGAS.includes(v)) return v;
  // O /run recebe a carga como "1" | "2" | "3"
  if (v === '1') return 'normal';
  if (v === '2') return 'dia-corrido';
  if (v === '3') return 'emergencia';
  return null;
}

function soNumericas(registro) {
  const out = {};
  for (const col of NUMERICAS) out[col] = numero(registro[col]);
  return out;
}

/**
 * Extrai de um CSV do k6 a linha GLOBAL (a métrica-resposta da rodada) e o
 * detalhamento por Join. Sem GLOBAL não há observação utilizável.
 */
function extrair(texto) {
  const { linhas } = parseCsv(texto);
  if (linhas.length === 0) return { erro: 'CSV vazio ou ilegível.' };

  const global = linhas.find(r => rotulo(r).toUpperCase() === 'GLOBAL');
  if (!global) {
    return { erro: 'CSV sem linha GLOBAL — não dá para derivar a métrica da rodada.' };
  }

  return {
    arquitetura: normalizarArquitetura(global.system_type),
    carga: normalizarCarga(global.scenario),
    timestampRodada: global.timestamp || null,
    metricas: soNumericas(global),
    porJoin: linhas
      .filter(r => rotulo(r).toUpperCase() !== 'GLOBAL')
      .map(r => ({ label: rotulo(r), endpoint: r.endpoint || '', ...soNumericas(r) })),
  };
}

// --- Operações do acervo ----------------------------------------------------

function criar(texto, nomeArquivo, opcoes = {}) {
  const dados = extrair(texto);
  if (dados.erro) return { erro: dados.erro };

  const arquitetura = normalizarArquitetura(opcoes.arquitetura) || dados.arquitetura;
  const carga = normalizarCarga(opcoes.carga) || dados.carga;
  if (!arquitetura) {
    return { erro: 'Arquitetura indefinida: coluna system_type ausente ou desconhecida. Informe manualmente.' };
  }
  if (!carga) {
    return { erro: 'Carga indefinida: coluna scenario ausente ou desconhecida. Informe manualmente.' };
  }

  const id = crypto.randomUUID();
  const destino = path.join(CSV_DIR, `${id}.csv`);
  fs.writeFileSync(destino, texto, 'utf8');

  const obs = {
    id,
    importadoEm: new Date().toISOString(),
    arquitetura,
    carga,
    origem: opcoes.origem || 'upload',
    origemRel: opcoes.origemRel || null,
    // Carimbo de procedencia: sem ele, rodadas de maquinas diferentes viram
    // uma amostra so e a variacao entre hardwares vaza para o residuo.
    maquina: maquina.perfil(),
    arquivo: nomeArquivo,
    csvRel: `csv/${id}.csv`,
    timestampRodada: dados.timestampRodada,
    metricas: dados.metricas,
    porJoin: dados.porJoin,
    nota: opcoes.nota || '',
  };

  const lista = listar();
  lista.unshift(obs);
  gravar(lista);
  return { obs };
}

/**
 * `caminho` já vem resolvido e validado pelo servidor (que conhece o diretório
 * de resultados de cada stack). Aqui só cabe recusar o que não existe.
 */
function importarDoResults(rel, caminho) {
  if (!caminho) return { erro: 'Arquivo inválido.' };
  if (!fs.existsSync(caminho)) return { erro: 'Arquivo não encontrado.' };

  const nome = path.basename(caminho);
  // Dedup por nome do arquivo: o k6 embute system_type, cenário e timestamp,
  // então o nome é único — e isso sobrevive à mudança do formato de `rel`.
  if (listar().some(o => o.origemRel === rel || o.arquivo === nome)) {
    return { erro: 'Esta rodada já está no acervo.' };
  }
  return criar(fs.readFileSync(caminho, 'utf8'), nome, {
    origem: 'orquestrador',
    origemRel: rel,
  });
}

function atualizar(id, patch) {
  const lista = listar();
  const i = lista.findIndex(o => o.id === id);
  if (i < 0) return { erro: 'Observação não encontrada.' };

  if (patch.arquitetura !== undefined) {
    const a = normalizarArquitetura(patch.arquitetura);
    if (!a) return { erro: `Arquitetura inválida. Use: ${ARQUITETURAS.join(', ')}` };
    lista[i].arquitetura = a;
  }
  if (patch.carga !== undefined) {
    const c = normalizarCarga(patch.carga);
    if (!c) return { erro: `Carga inválida. Use: ${CARGAS.join(', ')}` };
    lista[i].carga = c;
  }
  if (patch.nota !== undefined) lista[i].nota = String(patch.nota).slice(0, 500);

  gravar(lista);
  return { obs: lista[i] };
}

function remover(id) {
  const lista = listar();
  const i = lista.findIndex(o => o.id === id);
  if (i < 0) return { erro: 'Observação não encontrada.' };
  const [removida] = lista.splice(i, 1);
  const arquivo = path.join(LAB_DIR, removida.csvRel);
  // O CSV fica sob LAB_DIR/csv e o nome vem do uuid que geramos — sem entrada do usuário
  if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  gravar(lista);
  return { removida: true };
}

function csvDaObservacao(id) {
  const obs = listar().find(o => o.id === id);
  if (!obs) return null;
  const arquivo = path.join(LAB_DIR, obs.csvRel);
  return fs.existsSync(arquivo) ? { caminho: arquivo, nome: obs.arquivo } : null;
}

/**
 * Dataset tidy: uma linha por observação, pronto para R/Python/pandas.
 * É este arquivo que alimenta o teste t, a ANOVA e o Tukey.
 */
function datasetCsv() {
  const colunas = [
    'id', 'importado_em', 'timestamp_rodada', 'arquitetura', 'carga', 'maquina',
    ...NUMERICAS, 'origem', 'arquivo', 'nota',
  ];
  const linhas = [colunas.join(',')];

  // Ordem estável por célula facilita a leitura do arquivo a olho nu
  const ordenadas = [...listar()].sort((a, b) =>
    a.arquitetura.localeCompare(b.arquitetura) ||
    CARGAS.indexOf(a.carga) - CARGAS.indexOf(b.carga) ||
    a.importadoEm.localeCompare(b.importadoEm),
  );

  for (const o of ordenadas) {
    const valores = [
      o.id, o.importadoEm, o.timestampRodada || '', o.arquitetura, o.carga,
      o.maquina?.apelido ?? '',
      ...NUMERICAS.map(c => (o.metricas?.[c] ?? '')),
      o.origem, o.arquivo, o.nota || '',
    ];
    linhas.push(valores.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  return linhas.join('\n');
}

module.exports = {
  ARQUITETURAS,
  CARGAS,
  NUMERICAS,
  LAB_DIR,
  listar,
  criar,
  importarDoResults,
  atualizar,
  remover,
  csvDaObservacao,
  datasetCsv,
};
