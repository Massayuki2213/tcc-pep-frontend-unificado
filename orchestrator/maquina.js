/**
 * Perfil da máquina hospedeira.
 *
 * A seção 4.6 do TCC prevê replicar os ensaios em perfis de hardware distintos.
 * Isso só tem valor se cada observação souber de onde veio: misturar rodadas de
 * duas máquinas sem rótulo produz um acervo em que a variação entre máquinas
 * some dentro do erro amostral, inflando o resíduo e escondendo justamente o
 * efeito que a replicação deveria revelar.
 *
 * O perfil é capturado uma vez, na subida do orquestrador, e carimbado em toda
 * observação importada a partir dali.
 */
const os = require('os');
const { execSync } = require('child_process');

/** Lê CPU e memória da VM do Docker, que é o que de fato limita os contentores. */
function perfilDocker() {
  try {
    const saida = execSync('docker info --format "{{.NCPU}}|{{.MemTotal}}"', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [ncpu, mem] = saida.split('|');
    return {
      cpusDocker: Number(ncpu) || null,
      memoriaDockerGB: mem ? Math.round((Number(mem) / 1024 ** 3) * 100) / 100 : null,
    };
  } catch {
    // Docker fora do ar na subida do orquestrador é normal — o campo fica nulo
    // e é preenchido na próxima vez que o orquestrador subir com ele ligado.
    return { cpusDocker: null, memoriaDockerGB: null };
  }
}

let cache = null;

function perfil() {
  if (cache) return cache;
  const cpus = os.cpus();
  cache = {
    // O apelido é o que aparece na análise; use MAQUINA=... para algo legível
    // como "notebook-guilherme" em vez do hostname cru.
    apelido: process.env.MAQUINA || os.hostname(),
    hostname: os.hostname(),
    plataforma: `${os.platform()} ${os.release()}`,
    cpuModelo: cpus[0] ? cpus[0].model.trim() : null,
    cpusLogicas: cpus.length,
    memoriaGB: Math.round((os.totalmem() / 1024 ** 3) * 100) / 100,
    ...perfilDocker(),
  };
  return cache;
}

/** Linha curta para log e para o relatório. */
function resumo() {
  const p = perfil();
  return `${p.apelido} — ${p.cpusLogicas} CPU / ${p.memoriaGB} GB` +
    (p.cpusDocker ? ` (Docker: ${p.cpusDocker} CPU / ${p.memoriaDockerGB} GB)` : ' (Docker offline)');
}

module.exports = { perfil, resumo };
