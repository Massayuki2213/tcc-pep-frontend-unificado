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
const hardware = require('./hardware');

/**
 * Raiz do laboratório. Dentro dela, UMA PASTA POR MÁQUINA:
 *
 *   laboratorio/notebook/observacoes.json + csv/
 *   laboratorio/desktop/observacoes.json  + csv/
 *
 * A seção 4.6 do TCC replica os ensaios em hardwares distintos, e as rodadas de
 * uma máquina não podem contar como repetição das da outra. Separar no disco,
 * e não apenas filtrar na hora da análise, resolve dois problemas: o acervo de
 * cada máquina fica completo e balanceado por construção, e — o que decide na
 * prática — o git funde os commits das duas máquinas sem conflito, porque elas
 * tocam arquivos diferentes. Num índice único, cada observação nova entra no
 * topo do mesmo array e todo merge daria conflito na linha 2.
 */
const LAB_DIR = process.env.LAB_DIR || path.resolve(__dirname, '..', 'laboratorio');

/** A pasta desta máquina — onde toda escrita cai. */
const PASTA = maquina.pasta();
const ACERVO_DIR = path.join(LAB_DIR, PASTA);

const dirDe = pasta => path.join(LAB_DIR, pasta);
const indiceDe = pasta => path.join(dirDe(pasta), 'observacoes.json');
const csvDirDe = pasta => path.join(dirDe(pasta), 'csv');

const ARQUITETURAS = ['monolito', 'microsservicos'];
const CARGAS = ['normal', 'dia-corrido', 'emergencia'];

/** Colunas numéricas do CSV do k6 — o resto é tratado como texto. */
const NUMERICAS = [
  'vus_max', 'samples', 'avg_ms', 'min_ms', 'med_ms',
  'p90_ms', 'p95_ms', 'p99_ms', 'max_ms', 'rps', 'error_rate_pct', 'slo_pass_pct',
];

/**
 * Métricas que NÃO vêm do CSV: consumo de CPU e memória, lidos do Prometheus na
 * janela da rodada. Ficam no mesmo objeto `metricas` das demais de propósito —
 * é de lá que a análise tira a métrica-resposta, então mesclá-las aqui faz o
 * teste t, a ANOVA e o Tukey valerem para consumo de recursos sem tocar em
 * analise.js.
 */
const HARDWARE = hardware.METRICAS;

/** Tudo que o dataset consolidado expõe como coluna numérica. */
const COLUNAS_METRICAS = [...NUMERICAS, ...HARDWARE];

// --- Persistência -----------------------------------------------------------

function garantirDirs(pasta = PASTA) {
  fs.mkdirSync(csvDirDe(pasta), { recursive: true });
  const idx = indiceDe(pasta);
  if (!fs.existsSync(idx)) fs.writeFileSync(idx, '[]', 'utf8');
}

/** Pastas de máquina presentes no laboratório, em ordem estável. */
function pastas() {
  try {
    return fs.readdirSync(LAB_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(indiceDe(e.name)))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** O acervo de uma máquina específica. */
function listarDe(pasta) {
  try {
    const dados = JSON.parse(fs.readFileSync(indiceDe(pasta), 'utf8'));
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

/**
 * O acervo DESTA máquina. É o padrão em todo lugar de propósito: é o único
 * conjunto que a inferência de dois fatores pode consumir sem inflar o resíduo
 * com variação entre hardwares.
 */
function listar() {
  garantirDirs();
  return listarDe(PASTA);
}

/** Todas as máquinas juntas — só para quem trata `maquina` como fator. */
function listarTodas() {
  return pastas().flatMap(listarDe);
}

function gravar(lista, pasta = PASTA) {
  garantirDirs(pasta);
  fs.writeFileSync(indiceDe(pasta), JSON.stringify(lista, null, 2), 'utf8');
}

/**
 * Em qual pasta mora uma observação. Vem do apelido gravado nela, não da
 * máquina atual: ler ou apagar a observação de outra máquina tem de funcionar.
 */
function pastaDaObs(obs) {
  return maquina.pastaDe(obs?.maquina?.apelido) || PASTA;
}

function caminhoCsv(obs) {
  return path.join(dirDe(pastaDaObs(obs)), obs.csvRel);
}

/** Acha uma observação em qualquer máquina e devolve o contexto para regravar. */
function localizar(id) {
  for (const pasta of pastas()) {
    const lista = listarDe(pasta);
    const i = lista.findIndex(o => o.id === id);
    if (i >= 0) return { pasta, lista, i };
  }
  return null;
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

/**
 * As colunas de hardware sempre existem na observação, mesmo quando a coleta
 * falhou — nulas e explícitas. Ausentes, o dataset ficaria com linhas de
 * larguras diferentes conforme o Prometheus estivesse no ar ou não.
 */
function metricasDeHardware(h) {
  const out = {};
  for (const col of HARDWARE) out[col] = h?.metricas?.[col] ?? null;
  return out;
}

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
  // Antes de gravar, e nao so no listar/gravar do fim: numa pasta de maquina
  // ainda inexistente a primeira importacao quebraria aqui.
  garantirDirs();
  const destino = path.join(csvDirDe(PASTA), `${id}.csv`);
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
    // Latência/vazão do CSV e consumo de recursos do Prometheus no mesmo objeto:
    // é `metricas` que a análise varre para achar a métrica-resposta.
    metricas: { ...dados.metricas, ...metricasDeHardware(opcoes.hardware) },
    porJoin: dados.porJoin,
    // Detalhamento por contentor e diagnóstico da coleta (janela consultada,
    // contentores ausentes). Fora de `metricas` porque não é métrica-resposta.
    hardware: opcoes.hardware || null,
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
function importarDoResults(rel, caminho, hardwareDaRodada = null) {
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
    hardware: hardwareDaRodada,
  });
}

function atualizar(id, patch) {
  const achado = localizar(id);
  if (!achado) return { erro: 'Observação não encontrada.' };
  const { pasta, lista, i } = achado;

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

  gravar(lista, pasta);
  return { obs: lista[i] };
}

function remover(id) {
  const achado = localizar(id);
  if (!achado) return { erro: 'Observação não encontrada.' };
  const { pasta, lista, i } = achado;
  const [removida] = lista.splice(i, 1);
  // O CSV fica sob <pasta da maquina>/csv e o nome vem do uuid que geramos —
  // sem entrada do usuário no caminho
  const arquivo = caminhoCsv(removida);
  if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  gravar(lista, pasta);
  return { removida: true };
}

function csvDaObservacao(id) {
  const achado = localizar(id);
  if (!achado) return null;
  const obs = achado.lista[achado.i];
  const arquivo = caminhoCsv(obs);
  return fs.existsSync(arquivo) ? { caminho: arquivo, nome: obs.arquivo } : null;
}

/**
 * Dataset tidy: uma linha por observação, pronto para R/Python/pandas.
 * É este arquivo que alimenta o teste t, a ANOVA e o Tukey.
 *
 * Exporta TODAS as máquinas, ao contrário do resto do módulo. Aqui `maquina` é
 * uma coluna como as outras, e quem for rodar a análise fora daqui precisa dela
 * como fator — exportar só a máquina atual esconderia o delineamento da 4.6.
 */
function datasetCsv() {
  const colunas = [
    'id', 'importado_em', 'timestamp_rodada', 'arquitetura', 'carga', 'maquina',
    ...COLUNAS_METRICAS, 'origem', 'arquivo', 'nota',
  ];
  const linhas = [colunas.join(',')];

  // Ordem estável por célula facilita a leitura do arquivo a olho nu
  const ordenadas = [...listarTodas()].sort((a, b) =>
    (a.maquina?.apelido ?? '').localeCompare(b.maquina?.apelido ?? '') ||
    a.arquitetura.localeCompare(b.arquitetura) ||
    CARGAS.indexOf(a.carga) - CARGAS.indexOf(b.carga) ||
    a.importadoEm.localeCompare(b.importadoEm),
  );

  for (const o of ordenadas) {
    const valores = [
      o.id, o.importadoEm, o.timestampRodada || '', o.arquitetura, o.carga,
      o.maquina?.apelido ?? '',
      ...COLUNAS_METRICAS.map(c => (o.metricas?.[c] ?? '')),
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
  HARDWARE,
  COLUNAS_METRICAS,
  LAB_DIR,
  ACERVO_DIR,
  PASTA,
  pastas,
  listar,
  listarDe,
  listarTodas,
  criar,
  importarDoResults,
  atualizar,
  remover,
  csvDaObservacao,
  datasetCsv,
};
