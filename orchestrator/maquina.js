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
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LAB_DIR = process.env.LAB_DIR || path.resolve(__dirname, '..', 'laboratorio');
const CONFIG = path.join(LAB_DIR, 'maquina.json');

/**
 * Apelido escolhido para ESTA máquina, persistido em laboratorio/maquina.json.
 *
 * Sem isso o apelido seria o hostname, e dois problemas apareceriam: nomes
 * ilegíveis na monografia ("NOT-COMERCIAL03") e, pior, renomear a máquina faria
 * o orquestrador passar a escrever numa pasta diferente da que já tem o acervo,
 * levando a campanha a concluir que as células estão vazias e coletar tudo de
 * novo.
 *
 * O arquivo é local por natureza — identifica a máquina em que está — e por
 * isso fica fora do git. Em máquina nova, sem o arquivo, cai no hostname, que é
 * o comportamento correto: máquina nova, pasta nova.
 */
function apelidoConfigurado() {
  try {
    const { apelido } = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return typeof apelido === 'string' && apelido.trim() ? apelido.trim() : null;
  } catch {
    return null;
  }
}

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
    // O apelido é o que aparece na análise e o que nomeia a pasta do acervo.
    // Precedência: MAQUINA=... na chamada > laboratorio/maquina.json > hostname.
    apelido: process.env.MAQUINA || apelidoConfigurado() || os.hostname(),
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

/**
 * Nome de pasta derivado de um apelido.
 *
 * Cada máquina guarda o acervo dela numa pasta própria, e é daqui que sai o
 * nome. Dois motivos para isolar no disco em vez de só filtrar na análise: o
 * acervo de uma máquina nunca pode ser contado como repetição da outra, e —
 * o que decide na prática — duas máquinas escrevendo no mesmo `observacoes.json`
 * conflitam no git em toda rodada, porque cada observação nova entra no topo do
 * array. Arquivos distintos o git funde sem conflito.
 *
 * Normaliza porque o apelido padrão é o hostname, que pode trazer maiúsculas e
 * pontuação. Rejeita o que sobrar vazio ou que vire travessia de caminho.
 */
function pastaDe(apelido) {
  const s = String(apelido || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  // '.' e '..' passariam pelo filtro acima se o apelido fosse so pontos
  return s && s !== '-' ? s : null;
}

/** A pasta desta máquina. */
function pasta() {
  return pastaDe(perfil().apelido) || 'maquina-sem-nome';
}

/** Fixa o apelido desta máquina em disco e invalida o cache do perfil. */
function definirApelido(apelido) {
  if (!pastaDe(apelido)) throw new Error(`apelido "${apelido}" nao produz nome de pasta valido.`);
  fs.mkdirSync(LAB_DIR, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ apelido }, null, 2) + '\n', 'utf8');
  cache = null;
  return apelido;
}

module.exports = { perfil, resumo, pasta, pastaDe, definirApelido, CONFIG };

// CLI: nomeia esta máquina antes da primeira campanha.
//   node orchestrator/maquina.js                     → mostra o perfil
//   node orchestrator/maquina.js --apelido desktop    → fixa o nome da pasta
if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--apelido');
  if (i >= 0 && args[i + 1]) {
    definirApelido(args[i + 1]);
    console.log(`\n  apelido fixado: ${perfil().apelido}`);
    console.log(`  acervo desta maquina: laboratorio/${pasta()}/`);
    console.log(`  gravado em ${CONFIG} (fora do git, e local desta maquina)\n`);
  } else {
    console.log(`\n  ${resumo()}`);
    console.log(`  acervo: laboratorio/${pasta()}/`);
    console.log(`  apelido vem de: ${process.env.MAQUINA ? 'MAQUINA no ambiente'
      : apelidoConfigurado() ? 'laboratorio/maquina.json' : 'hostname (sem maquina.json)'}`);
    console.log('\n  Para nomear: node orchestrator/maquina.js --apelido <nome>\n');
  }
}
