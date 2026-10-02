/**
 * Migração única: acervo plano → uma pasta por máquina.
 *
 * Antes:  laboratorio/observacoes.json  +  laboratorio/csv/
 * Depois: laboratorio/<maquina>/observacoes.json  +  laboratorio/<maquina>/csv/
 *
 * Por que: a seção 4.6 replica os ensaios em hardwares distintos, e rodadas de
 * máquinas diferentes não podem se misturar nem como repetição do delineamento
 * nem no git. Ver o cabeçalho de lab.js.
 *
 * Roda uma vez por repositório. Depois disso é inócuo: sem o índice plano, não
 * há o que migrar.
 *
 * Uso:
 *   node orchestrator/migrar-acervo.js --dry-run
 *   node orchestrator/migrar-acervo.js --apelido notebook
 *   node orchestrator/migrar-acervo.js            # mantém o apelido gravado
 */
const fs = require('fs');
const path = require('path');
const maquina = require('./maquina');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const iAp = args.indexOf('--apelido');
const APELIDO_NOVO = iAp >= 0 && args[iAp + 1] ? args[iAp + 1] : null;

const LAB_DIR = process.env.LAB_DIR || path.resolve(__dirname, '..', 'laboratorio');
const INDICE_PLANO = path.join(LAB_DIR, 'observacoes.json');
const CSV_PLANO = path.join(LAB_DIR, 'csv');
const LOG_PLANO = path.join(LAB_DIR, 'campanha.log');

const log = (...a) => console.log(...a);

function sair(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(INDICE_PLANO)) {
    log('\n  Nada a migrar: nao existe laboratorio/observacoes.json.');
    log('  (Se o acervo ja esta em pastas por maquina, a migracao ja rodou.)\n');
    return;
  }

  let acervo;
  try {
    acervo = JSON.parse(fs.readFileSync(INDICE_PLANO, 'utf8'));
  } catch (e) {
    sair(`observacoes.json ilegivel: ${e.message}`);
  }
  if (!Array.isArray(acervo)) sair('observacoes.json nao e um array.');
  if (acervo.length === 0) {
    log('\n  Indice plano vazio — removendo e seguindo.\n');
    if (!DRY) fs.unlinkSync(INDICE_PLANO);
    return;
  }

  // Agrupa por apelido gravado. Em geral e um so, mas o script nao assume isso:
  // um acervo que ja tivesse duas maquinas se dividiria corretamente.
  const porApelido = new Map();
  for (const o of acervo) {
    const ap = o.maquina?.apelido || null;
    if (!ap) sair(`observacao ${o.id} nao tem maquina.apelido — migracao abortada para nao inventar procedencia.`);
    if (!porApelido.has(ap)) porApelido.set(ap, []);
    porApelido.get(ap).push(o);
  }

  if (APELIDO_NOVO && porApelido.size > 1) {
    sair(`--apelido so vale com uma maquina no acervo; achei ${porApelido.size}: ${[...porApelido.keys()].join(', ')}`);
  }

  log(`\n  Acervo plano: ${acervo.length} observacoes, ${porApelido.size} maquina(s).`);

  // --- Planeja ---------------------------------------------------------------
  const plano = [];
  for (const [apelido, obs] of porApelido) {
    const apelidoFinal = APELIDO_NOVO || apelido;
    const pasta = maquina.pastaDe(apelidoFinal);
    if (!pasta) sair(`apelido "${apelidoFinal}" nao produz nome de pasta valido.`);

    const destinoIdx = path.join(LAB_DIR, pasta, 'observacoes.json');
    if (fs.existsSync(destinoIdx)) {
      sair(`${pasta}/observacoes.json ja existe. Resolva a mao antes de migrar — nao vou sobrescrever acervo.`);
    }

    // Confere que todo CSV esta onde o indice diz, ANTES de mover qualquer um.
    const faltando = obs.filter(o => !fs.existsSync(path.join(LAB_DIR, o.csvRel)));
    if (faltando.length) {
      sair(`${faltando.length} CSV(s) do indice nao existem em disco (ex.: ${faltando[0].csvRel}). Migracao abortada.`);
    }

    plano.push({ apelido, apelidoFinal, pasta, obs });
    const renomeia = apelidoFinal !== apelido ? `  (apelido: "${apelido}" -> "${apelidoFinal}")` : '';
    log(`    ${obs.length} obs -> laboratorio/${pasta}/${renomeia}`);
  }

  if (DRY) {
    log('\n  --dry-run: nada foi movido.\n');
    return;
  }

  // --- Executa ---------------------------------------------------------------
  for (const { apelidoFinal, pasta, obs } of plano) {
    const dirPasta = path.join(LAB_DIR, pasta);
    fs.mkdirSync(path.join(dirPasta, 'csv'), { recursive: true });

    for (const o of obs) {
      fs.renameSync(path.join(LAB_DIR, o.csvRel), path.join(dirPasta, o.csvRel));
      // Só o apelido muda. `hostname` fica como estava: ele é a procedência
      // real da rodada e reescrevê-lo apagaria de onde o dado veio.
      if (o.maquina) o.maquina.apelido = apelidoFinal;
    }

    fs.writeFileSync(path.join(dirPasta, 'observacoes.json'), JSON.stringify(obs, null, 2), 'utf8');

    // Confere o que acabou de escrever antes de apagar o original
    const relido = JSON.parse(fs.readFileSync(path.join(dirPasta, 'observacoes.json'), 'utf8'));
    const csvsOk = relido.every(o => fs.existsSync(path.join(dirPasta, o.csvRel)));
    if (relido.length !== obs.length || !csvsOk) {
      sair(`verificacao falhou em ${pasta}: ${relido.length}/${obs.length} obs, csvs ${csvsOk ? 'ok' : 'faltando'}. O indice plano NAO foi removido.`);
    }
    log(`    ${pasta}: ${relido.length} observacoes + ${relido.length} CSVs conferidos.`);
  }

  // Fixa o apelido em disco. Sem isso o orquestrador voltaria ao hostname e
  // escreveria numa pasta diferente da que acabou de receber o acervo.
  if (plano.length === 1) {
    maquina.definirApelido(plano[0].apelidoFinal);
    log(`    apelido desta maquina fixado em ${path.relative(process.cwd(), maquina.CONFIG)}`);
  }

  // O log da campanha pertence a maquina que coletou — vai junto quando ha uma só
  if (fs.existsSync(LOG_PLANO) && plano.length === 1) {
    fs.renameSync(LOG_PLANO, path.join(LAB_DIR, plano[0].pasta, 'campanha.log'));
    log(`    campanha.log -> ${plano[0].pasta}/`);
  }

  fs.unlinkSync(INDICE_PLANO);
  // A pasta csv/ plana só sai se estiver vazia: sobrar arquivo ali significa
  // CSV que o índice não conhecia, e apagar isso em silêncio seria perda de dado.
  if (fs.existsSync(CSV_PLANO)) {
    const restante = fs.readdirSync(CSV_PLANO);
    if (restante.length === 0) {
      fs.rmdirSync(CSV_PLANO);
    } else {
      log(`\n  AVISO: laboratorio/csv/ ficou com ${restante.length} arquivo(s) que o indice nao citava.`);
      log('         Nao apaguei. Confira e remova a mao se for lixo.');
    }
  }

  log('\n  Migracao concluida.\n');
}

main();
