import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const owner = String(process.env.TRACKED_OWNER || 'ellivien').trim();
const trackerRepository = String(process.env.TRACKER_REPOSITORY || `${owner}/ellivien-open-source-evidence`).trim().toLowerCase();
const trafficToken = String(process.env.ACCOUNT_TRAFFIC_TOKEN || '').trim();
const maxRepositories = Number.parseInt(process.env.MAX_REPOSITORIES || '50', 10);

if (!trafficToken) {
  throw new Error('ACCOUNT_TRAFFIC_TOKEN is required. Use a fine-grained token with Administration: read-only and no write permissions.');
}
if (!/^[A-Za-z0-9-]+$/.test(owner)) {
  throw new Error('TRACKED_OWNER must be one GitHub account name.');
}
if (!Number.isInteger(maxRepositories) || maxRepositories < 1 || maxRepositories > 50) {
  throw new Error('MAX_REPOSITORIES must be an integer from 1 to 50.');
}

async function github(path, { authenticated = true } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ellivien-open-source-evidence',
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (authenticated) headers.Authorization = `Bearer ${trafficToken}`;
  const response = await fetch(`${API_BASE}${path}`, { headers, signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.message === 'string' ? `: ${body.message}` : '';
    throw new Error(`GitHub API ${response.status} for ${path}${detail}`);
  }
  return body;
}

async function discoverPublicRepositories() {
  const discovered = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(`/user/repos?affiliation=owner&visibility=all&sort=full_name&direction=asc&per_page=100&page=${page}`);
    discovered.push(...batch);
    if (batch.length < 100) break;
  }
  const publicRepositories = discovered
    .filter(repository => repository.owner?.login?.toLowerCase() === owner.toLowerCase())
    .filter(repository => repository.private === false)
    .filter(repository => repository.full_name?.toLowerCase() !== trackerRepository)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (publicRepositories.length > maxRepositories) {
    throw new Error(`Discovered ${publicRepositories.length} public repositories; the transparent limit is ${maxRepositories}.`);
  }
  return publicRepositories;
}

async function collectReleaseEvidence(repository) {
  const releases = await github(`/repos/${repository.full_name}/releases?per_page=100&page=1`, { authenticated: false });
  return {
    cappedAtFirst100: releases.length === 100,
    releases: releases.map(release => ({
      tagName: release.tag_name,
      name: release.name,
      draft: release.draft,
      prerelease: release.prerelease,
      publishedAt: release.published_at,
      url: release.html_url,
      assets: release.assets.map(asset => ({
        name: asset.name,
        size: asset.size,
        contentType: asset.content_type,
        downloadCount: asset.download_count,
        updatedAt: asset.updated_at,
        downloadUrl: asset.browser_download_url,
      })),
    })),
  };
}

async function collectRepository(repository) {
  const [views, clones, referrers, popularPaths, releaseEvidence] = await Promise.all([
    github(`/repos/${repository.full_name}/traffic/views?per=day`),
    github(`/repos/${repository.full_name}/traffic/clones?per=day`),
    github(`/repos/${repository.full_name}/traffic/popular/referrers`),
    github(`/repos/${repository.full_name}/traffic/popular/paths`),
    collectReleaseEvidence(repository),
  ]);
  const releases = releaseEvidence.releases;
  return {
    repository: repository.full_name,
    name: repository.name,
    description: repository.description,
    url: repository.html_url,
    createdAt: repository.created_at,
    updatedAt: repository.updated_at,
    pushedAt: repository.pushed_at,
    archived: repository.archived,
    fork: repository.fork,
    repositoryTotals: {
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      openIssuesAndPullRequests: repository.open_issues_count,
    },
    traffic: { views, clones, topReferrers: referrers, popularPaths },
    releases,
    releasesCappedAtFirst100: releaseEvidence.cappedAtFirst100,
    releaseAssetDownloadTotal: releases.reduce((total, release) => total + release.assets.reduce((sum, asset) => sum + asset.downloadCount, 0), 0),
    releasePackageDownloadTotal: releases.reduce((total, release) => total + release.assets.filter(asset => /\.zip$/i.test(asset.name)).reduce((sum, asset) => sum + asset.downloadCount, 0), 0),
  };
}

async function collectInBatches(repositories, size = 5) {
  const collected = [];
  for (let index = 0; index < repositories.length; index += size) {
    collected.push(...await Promise.all(repositories.slice(index, index + size).map(collectRepository)));
  }
  return collected;
}

function publicSummary(repository) {
  return {
    repository: repository.repository,
    views: repository.traffic.views.count,
    uniqueVisitors: repository.traffic.views.uniques,
    clones: repository.traffic.clones.count,
    uniqueCloners: repository.traffic.clones.uniques,
    releasePackageDownloads: repository.releasePackageDownloadTotal,
    stars: repository.repositoryTotals.stars,
    forks: repository.repositoryTotals.forks,
  };
}

const repositories = await discoverPublicRepositories();
const capturedAt = new Date().toISOString();
const evidence = await collectInBatches(repositories);
const snapshot = {
  schemaVersion: 2,
  capturedAt,
  account: owner,
  source: {
    provider: 'GitHub REST API',
    aggregateOnly: true,
    trafficWindowDays: 14,
    repositoryDiscovery: 'All owner repositories are listed, then private repositories and the evidence repository are discarded before collection.',
    note: 'Counts may include automated clients and do not identify people.',
  },
  discovery: {
    publicRepositoriesTracked: evidence.length,
    maximumRepositories: maxRepositories,
    excludedRepositories: [trackerRepository],
  },
  repositories: evidence,
};

const serialised = `${JSON.stringify(snapshot, null, 2)}\n`;
const digest = createHash('sha256').update(serialised).digest('hex');
const stamp = capturedAt.replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
const relativeSnapshotPath = `data/snapshots/${stamp}.json`;
const snapshotPath = join(ROOT, 'docs', relativeSnapshotPath);
const latestPath = join(ROOT, 'docs', 'data', 'latest.json');
const indexPath = join(ROOT, 'docs', 'data', 'index.json');

mkdirSync(dirname(snapshotPath), { recursive: true });
writeFileSync(snapshotPath, serialised, { flag: 'wx' });
writeFileSync(`${snapshotPath}.sha256`, `${digest}  ${stamp}.json\n`, { flag: 'wx' });
writeFileSync(latestPath, serialised);

let index = { schemaVersion: 1, account: owner, snapshots: [] };
try {
  index = JSON.parse(readFileSync(indexPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
index.snapshots = [{
  capturedAt,
  path: relativeSnapshotPath,
  sha256: digest,
  repositoryCount: evidence.length,
  repositories: evidence.map(publicSummary),
}, ...index.snapshots.filter(entry => entry.path !== relativeSnapshotPath)];
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(JSON.stringify({ capturedAt, repositories: evidence.map(publicSummary), snapshot: relativeSnapshotPath, sha256: digest }, null, 2));
