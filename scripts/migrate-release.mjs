import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Release only immutable committed SQL and its matching migration runner.
// Parallel workers may have unfinished migrations in the working directory.
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
assert.ok(process.argv.length <= 3, 'Usage: node scripts/migrate-release.mjs [git-ref]');
const git = args => execFileSync('git', args, { encoding:'utf8' }).trim();
const revision = git(['rev-parse','--verify','--end-of-options',`${process.argv[2] ?? 'HEAD'}^{commit}`]);
assert.match(revision,/^[0-9a-f]{40}$/);
const root = git(['rev-parse','--show-toplevel']);
const temp = await mkdtemp(join(tmpdir(),'company-human-release-migrations-'));
try {
  await mkdir(join(temp,'src')); await mkdir(join(temp,'migrations'));
  await writeFile(join(temp,'package.json'),'{"type":"module"}');
  await symlink(join(root,'node_modules'),join(temp,'node_modules'));
  const read = path => execFileSync('git',['-C',root,'show',`${revision}:${path}`]);
  await writeFile(join(temp,'src','migrate.ts'),read('packages/database/src/migrate.ts'));
  const files = git(['-C',root,'ls-tree','-r','--name-only',revision,'packages/database/migrations']).split('\n');
  assert.ok(files.length > 0);
  for (const path of files) {
    assert.match(path,/^packages\/database\/migrations\/\d{4}_[a-z0-9_]+\.sql$/);
    await writeFile(join(temp,'migrations',path.split('/').at(-1)),read(path));
  }
  const { runMigrations } = await import(pathToFileURL(join(temp,'src','migrate.ts')).href);
  console.log(JSON.stringify({revision,applied:await runMigrations(process.env.DATABASE_URL)}));
} finally { await rm(temp,{recursive:true,force:true}); }
