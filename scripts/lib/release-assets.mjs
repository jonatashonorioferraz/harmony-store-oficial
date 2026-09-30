const origin = 'https://harmony.invalid';

function asset(reference, position = 0) {
  const url = new URL(reference, origin);
  if (url.origin !== origin || !/\.(?:js|css)$/.test(url.pathname)) return null;
  return { path: url.pathname.slice(1), version: url.searchParams.get('v'), position };
}

export function htmlAssets(html) {
  const assets = new Map();
  const pattern = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const entry = asset(match[2], match.index);
    if (entry) assets.set(entry.path, entry);
  }
  return assets;
}

export function workerAssets(worker) {
  const assets = new Map();
  for (const match of worker.matchAll(/(["'])(\.\/[^"']+\.(?:js|css)(?:\?[^"']*)?)\1/g)) {
    const entry = asset(match[2], match.index);
    if (entry) assets.set(entry.path, entry);
  }
  return assets;
}

function compareNumbers(a, b) {
  const left = a.split(/[.-]/).map(Number);
  const right = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function cacheVersion(worker) {
  const value = worker.match(/\bconst\s+CACHE\s*=\s*["']harmony-store-v(\d+(?:-\d+)*)-r(\d+)["']/);
  return value ? value[1] + '-' + value[2] : null;
}

export function releaseIssues(base, candidate) {
  const issues = [];
  const baseHtml = htmlAssets(base.html);
  const currentHtml = htmlAssets(candidate.html);
  const baseWorker = workerAssets(base.worker);
  const currentWorker = workerAssets(candidate.worker);
  for (const [name, previous, current] of [
    ['index.html', baseHtml, currentHtml],
    ['service-worker.js', baseWorker, currentWorker],
  ]) {
    if (!previous.size || !current.size) issues.push(name + ': nao foi possivel identificar os recursos.');
    for (const [path, before] of previous) {
      const after = current.get(path);
      if (!after || before.version === null) continue;
      if (after.version === null) {
        issues.push(name + ': ' + path + ' perdeu a versao ' + before.version + '.');
      } else if (/^\d+(?:\.\d+)*$/.test(before.version) && /^\d+(?:\.\d+)*$/.test(after.version)) {
        if (compareNumbers(after.version, before.version) < 0) {
          issues.push(name + ': ' + path + ' voltou de ' + before.version + ' para ' + after.version + '.');
        }
      } else if (after.version !== before.version) {
        issues.push(name + ': ' + path + ' precisa de uma versao numerica para comparar com a main.');
      }
    }
  }
  for (const [path, pageAsset] of currentHtml) {
    const shellAsset = currentWorker.get(path);
    if (shellAsset && shellAsset.version !== pageAsset.version) {
      issues.push(path + ': pagina e cache usam versoes diferentes.');
    }
  }
  const previousCache = cacheVersion(base.worker);
  const currentCache = cacheVersion(candidate.worker);
  if (!previousCache || !currentCache) issues.push('Nao foi possivel identificar a versao do cache principal.');
  else if (compareNumbers(currentCache, previousCache) < 0) issues.push('O cache principal voltou a uma versao anterior.');
  return issues;
}
