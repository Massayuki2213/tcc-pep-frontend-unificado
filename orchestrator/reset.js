/**
 * Reset do estado dos bancos entre rodadas do benchmark.
 *
 * Por que existe: cada rodada do k6 deixa dados para trás (o setup cria pool
 * de médicos e pacientes, o teste insere atendimentos). Sem reset, a 5ª
 * repetição de uma célula roda contra um banco maior que a 1ª, e o efeito do
 * volume de dados se mistura ao efeito da arquitetura — que é justamente o
 * que o experimento quer isolar.
 *
 * Zerar antes de cada rodada faz as replicatas partirem da mesma condição, que
 * é o pressuposto de independência do teste t e da ANOVA.
 *
 * Trunca TODAS as tabelas do schema public e esvazia TODAS as collections.
 * Não derruba schema: o TypeORM roda com synchronize e as tabelas continuam lá.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/** Containers de banco de cada stack. */
const BANCOS = {
  monolito: { postgres: 'db_postgres_monolito', mongo: 'db_mongo_monolito' },
  microsservicos: { postgres: 'db_postgres_pep_ms', mongo: 'db_mongo_ms' },
};

/** Trunca tudo em public sem precisar listar tabela por tabela. */
const SQL_TRUNCATE = `DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
  END LOOP;
END $$;`;

const JS_MONGO_LIMPA =
  'db.getCollectionNames().forEach(function (c) { db.getCollection(c).deleteMany({}); });';

function lerEnv(dir) {
  const arquivo = path.join(dir, '.env');
  if (!fs.existsSync(arquivo)) return {};
  const out = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function executar(args) {
  return new Promise(resolve => {
    const p = spawn('docker', args);
    let saida = '';
    p.stdout.on('data', c => { saida += c; });
    p.stderr.on('data', c => { saida += c; });
    p.on('error', err => resolve({ ok: false, saida: err.message }));
    p.on('close', code => resolve({ ok: code === 0, saida: saida.trim() }));
  });
}

async function contarPostgres(container, user, db) {
  const r = await executar([
    'exec', container, 'psql', '-U', user, '-d', db, '-t', '-A', '-c',
    "SELECT coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables;",
  ]);
  return r.ok ? Number(r.saida.split(/\r?\n/)[0]) || 0 : null;
}

/**
 * Zera as duas bases de uma stack. Devolve o que foi feito, para o log da
 * rodada registrar a condição inicial.
 */
async function resetar(stack, dirDaStack) {
  const bancos = BANCOS[stack];
  if (!bancos) return { ok: false, erro: `Stack desconhecida: ${stack}` };

  const env = lerEnv(dirDaStack);
  const pgUser = env.POSTGRES_USER || 'root';
  const pgDb = env.POSTGRES_DB || 'pep_relacional';
  const mgUser = env.MONGO_INITDB_ROOT_USERNAME || 'root';
  const mgPass = env.MONGO_INITDB_ROOT_PASSWORD || '';
  const mgDb = env.MONGO_INITDB_DATABASE || 'pep_nao_relacional';

  const passos = [];

  const antes = await contarPostgres(bancos.postgres, pgUser, pgDb);

  const pg = await executar([
    'exec', bancos.postgres, 'psql', '-U', pgUser, '-d', pgDb, '-v', 'ON_ERROR_STOP=1', '-c', SQL_TRUNCATE,
  ]);
  passos.push({ alvo: `postgres (${bancos.postgres})`, ok: pg.ok, detalhe: pg.ok ? 'truncado' : pg.saida });

  const mongoArgs = [
    'exec', bancos.mongo, 'mongosh', '--quiet',
    '-u', mgUser, '-p', mgPass, '--authenticationDatabase', 'admin',
    mgDb, '--eval', JS_MONGO_LIMPA,
  ];
  const mg = await executar(mongoArgs);
  passos.push({ alvo: `mongo (${bancos.mongo})`, ok: mg.ok, detalhe: mg.ok ? 'collections esvaziadas' : mg.saida });

  const depois = await contarPostgres(bancos.postgres, pgUser, pgDb);

  return {
    ok: passos.every(p => p.ok),
    stack,
    linhasAntes: antes,
    linhasDepois: depois,
    passos,
  };
}

module.exports = { resetar, BANCOS };
