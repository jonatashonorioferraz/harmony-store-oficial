import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { releaseIssues } from './lib/release-assets.mjs';

const root = resolve(import.meta.dirname, '..');
const readSnapshot = async directory => {
  const [html, worker] = await Promise.all([
    readFile(resolve(directory, 'index.html'), 'utf8'),
    readFile(resolve(directory, 'service-worker.js'), 'utf8'),
  ]);
  return { html, worker };
};

async function githubSnapshot() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!eventPath || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
    throw new Error('Use npm run verify:release -- --base-dir <copia-atual-da-main>, ou execute no CI do PR.');
  }
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const sha = event.pull_request?.base?.sha;
  if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('O evento nao informa a base do PR.');
  async function readBase(path) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    const url = 'https://api.github.com/repos/' + repository + '/contents/' + path + '?ref=' + sha;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Nao foi possivel ler ' + path + ' na base do PR (HTTP ' + response.status + ').');
    const data = await response.json();
    if (data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new Error('Conteudo inesperado ao ler ' + path + ' na base do PR.');
    }
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  const [html, worker] = await Promise.all([readBase('index.html'), readBase('service-worker.js')]);
  return { html, worker };
}

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--base-dir')) throw new Error('Argumentos invalidos.');
  const base = args.length ? await readSnapshot(resolve(args[1])) : await githubSnapshot();
  const candidate = await readSnapshot(root);
  const issues = releaseIssues(base, candidate);
  if (issues.length) {
    throw new Error('A atualizacao recua ou mistura versoes ja publicadas:\n- ' + issues.join('\n- ') +
      '\nPrepare a mudanca sobre a main atual e preserve as correcoes anteriores.');
  }
  console.log('Versoes dos recursos e do cache preservam a base do PR.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
