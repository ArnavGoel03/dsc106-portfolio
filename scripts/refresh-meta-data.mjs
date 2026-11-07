import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// Match the lab's web source extensions without scanning packages or local copies.
const sourceExtensions = new Set(['.html', '.css', '.js', '.svelte']);
const csvHeader = 'file,line,type,commit,author,date,time,timezone,datetime,depth,length';
// The lab uses two-space indentation; the child must finish within the local gate budget.
const indentationSpaces = 2;
const commandTimeout = 20_000;
const output = join(repo, 'meta/loc.csv');
const pendingOutput = join(dirname(output), `.loc-${process.pid}.csv`);
let temporaryDirectory;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    timeout: commandTimeout,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout;
}

function assertCleanSources(files) {
  if (run('git', ['status', '--porcelain=v1', '-z', '--', ...files])) {
    throw new Error('Commit tracked web source changes before refreshing metadata. Uncommitted blame hashes are invalid.');
  }
}

async function snapshotSources(files) {
  const snapshots = new Map();
  for (const file of files) {
    const content = await readFile(join(repo, file));
    const text = content.toString('utf8');
    const lineCount = text ? text.split('\n').length - Number(text.endsWith('\n')) : 0;
    if (!lineCount) throw new Error(`elocuent cannot represent an empty source file: ${file}`);
    snapshots.set(file, {
      lineCount,
      hash: createHash('sha256').update(content).digest('hex'),
    });
  }
  return snapshots;
}

function validateCSV(csv, snapshots) {
  const rows = csv.trimEnd().split('\n');
  if (rows.shift() !== csvHeader) throw new Error('Generated CSV has an unexpected header.');
  const nextLines = new Map();
  const commits = new Set();
  for (const [index, row] of rows.entries()) {
    const fields = row.split(',');
    if (fields.length !== csvHeader.split(',').length) {
      throw new Error(`CSV row ${index + 2} is malformed; elocuent does not escape commas in names.`);
    }
    const [file, line, type, commit, author, date, time, timezone, datetime, depth, length] = fields;
    const expected = snapshots.get(file);
    if (!expected) throw new Error(`CSV includes an untracked or unexpected source: ${file}`);
    const nextLine = (nextLines.get(file) || 0) + 1;
    if (!/^\d+$/.test(line) || Number(line) !== nextLine || nextLine > expected.lineCount) {
      throw new Error(`CSV line coverage is invalid for ${file}:${line}`);
    }
    nextLines.set(file, nextLine);
    const fileType = extname(file).slice(1);
    if (type !== fileType && !(fileType === 'svelte' && ['css', 'js'].includes(type))) {
      throw new Error(`CSV language is invalid for ${file}:${line}`);
    }
    if (!/^[0-9a-f]{6,40}$/i.test(commit) || /^0+$/.test(commit) || !author.trim()) {
      throw new Error(`CSV commit attribution is invalid for ${file}:${line}`);
    }
    if (![depth, length].every((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))) {
      throw new Error(`CSV numeric fields are invalid for ${file}:${line}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)
      || !/^[+-]([01]\d|2[0-3]):[0-5]\d$/.test(timezone)
      || datetime !== `${date}T${time}${timezone}`
      || !Number.isFinite(Date.parse(datetime))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error(`CSV timestamp is invalid for ${file}:${line}`);
    }
    commits.add(commit);
  }
  for (const [file, expected] of snapshots) {
    if (nextLines.get(file) !== expected.lineCount) {
      throw new Error(`CSV is missing lines from ${file}: expected ${expected.lineCount}, received ${nextLines.get(file) || 0}`);
    }
  }
  const objects = run('git', ['cat-file', '--batch-check'], {
    input: [...commits].map((commit) => `${commit}^{commit}\n`).join(''),
  }).trimEnd().split('\n');
  if (objects.length !== commits.size || objects.some((object) => !/^[0-9a-f]+ commit \d+$/.test(object))) {
    throw new Error('CSV contains a commit that does not resolve in this repository.');
  }
  return { lines: rows.length, files: snapshots.size, commits: commits.size };
}

try {
  const files = run('git', ['ls-files', '-z']).split('\0')
    .filter((file) => sourceExtensions.has(extname(file)))
    .sort();
  if (!files.length) throw new Error('No tracked web sources found.');
  // elocuent treats inputs as globs and writes CSV without escaping names.
  if (files.some((file) => /[\r\n,{}[\]*?!\\]/.test(file)
    || file.split('/').includes('node_modules') || file.startsWith('-'))) {
    throw new Error('Tracked web paths contain unsupported glob/CSV characters or a node_modules directory.');
  }
  assertCleanSources(files);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const snapshots = await snapshotSources(files);
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'dsc106-meta-refresh-'));
  const generatedOutput = join(temporaryDirectory, 'loc.csv');
  const elocuentURL = pathToFileURL(require.resolve('elocuent')).href;
  // elocuent ends its write stream without awaiting finish. A separate child
  // keeps Node alive until the stream flushes, before this process validates it.
  const childCode = `import run from ${JSON.stringify(elocuentURL)}; await run(JSON.parse(process.argv[1]));`;
  run(process.execPath, ['--input-type=module', '-e', childCode, JSON.stringify({
    input: files,
    output: generatedOutput,
    spaces: indentationSpaces,
  })]);
  const result = validateCSV(await readFile(generatedOutput, 'utf8'), snapshots);
  assertCleanSources(files);
  if (run('git', ['rev-parse', 'HEAD']).trim() !== head) {
    throw new Error('Repository HEAD changed during metadata generation; retry after commits finish.');
  }
  const currentSnapshots = await snapshotSources(files);
  if ([...snapshots].some(([file, snapshot]) => currentSnapshots.get(file).hash !== snapshot.hash)) {
    throw new Error('Web sources changed during metadata generation; retry after edits finish.');
  }
  await copyFile(generatedOutput, pendingOutput, constants.COPYFILE_EXCL);
  await rename(pendingOutput, output);
  console.log(`Refreshed ${result.lines} lines from ${result.files} tracked web files and ${result.commits} commits.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await rm(pendingOutput, { force: true });
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
