const OWNER = 'ellivien';
const EVIDENCE_REPOSITORY = 'ellivien-open-source-evidence';
const ACCENTS = ['#a98cf5', '#ef91c8', '#ff9f68', '#79ddbd', '#75baf5', '#f3cf74'];
const loadedRows = [];

const repoGrid = document.querySelector('#repo-grid');
const historyBody = document.querySelector('#history-body');
const status = document.querySelector('#status');
const lastUpdated = document.querySelector('#last-updated');
const downloadButton = document.querySelector('#download-csv');
const footerStatus = document.querySelector('#footer-status');

const number = value => new Intl.NumberFormat('en-GB').format(Number(value) || 0);
const dateTime = value => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London',
}).format(new Date(value));
const shortDate = value => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/London',
}).format(new Date(value));

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Evidence request failed with ${response.status}.`);
  return response.json();
}

function friendlyName(repository) {
  return repository.name
    .replace(/^ellivien-/, '')
    .split('-')
    .map(word => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

function metric(label, value, wide = false) {
  return `<div class="metric${wide ? ' metric--wide' : ''}"><strong>${number(value)}</strong><span>${label}</span></div>`;
}

function snapshotUrl(path) {
  return `https://github.com/${OWNER}/${EVIDENCE_REPOSITORY}/blob/main/docs/${path}`;
}

function renderCard(repository, recorded, capturedAt, snapshotPath, index) {
  const views = repository.traffic?.views || {};
  const clones = repository.traffic?.clones || {};
  const recordedFrom = recorded?.recordedTrafficFrom || recorded?.recordedViewsFrom || recorded?.recordedClonesFrom;
  const recordedSince = recordedFrom ? `since ${shortDate(recordedFrom)}` : 'since tracking began';
  return `
    <article class="repo-card" style="--accent: ${ACCENTS[index % ACCENTS.length]}">
      <div class="repo-card__top">
        <div>
          <h3 class="repo-card__name">${friendlyName(repository)}</h3>
          <span class="repo-card__time">Captured ${dateTime(capturedAt)}</span>
        </div>
        <a class="repo-card__link" href="${repository.url}" target="_blank" rel="noreferrer">Repository ↗</a>
      </div>
      <div class="metrics">
        ${metric(`recorded views · ${recordedSince}`, recorded?.recordedViews ?? views.count)}
        ${metric('unique visitors · latest 14 days', views.uniques)}
        ${metric(`recorded full clones · ${recordedSince}`, recorded?.recordedClones ?? clones.count)}
        ${metric('unique cloning clients · latest 14 days', clones.uniques)}
        ${metric('named release ZIP downloads · cumulative', repository.releasePackageDownloadTotal, true)}
      </div>
      <div class="repo-card__foot">
        <a class="repo-card__link" href="${snapshotUrl(snapshotPath)}" target="_blank" rel="noreferrer">Exact snapshot ↗</a>
        <span>${number(repository.repositoryTotals?.stars)} stars · ${number(repository.repositoryTotals?.forks)} forks</span>
      </div>
    </article>`;
}

function renderHistory(index) {
  const rows = index.snapshots.flatMap(snapshot => snapshot.repositories.map(repository => ({
    ...repository,
    capturedAt: snapshot.capturedAt,
    path: snapshot.path,
    sha256: snapshot.sha256,
  })));
  loadedRows.splice(0, loadedRows.length, ...rows);
  historyBody.innerHTML = rows.slice(0, 150).map(row => `<tr>
    <td>${shortDate(row.capturedAt)}</td>
    <td>${row.repository.replace(`${OWNER}/ellivien-`, '').replaceAll('-', ' ')}</td>
    <td>${number(row.views)}</td>
    <td>${number(row.uniqueVisitors)}</td>
    <td>${number(row.clones)}</td>
    <td>${number(row.uniqueCloners)}</td>
    <td>${number(row.recordedViews)}</td>
    <td>${number(row.recordedClones)}</td>
    <td>${number(row.releasePackageDownloads)}</td>
    <td><a href="${snapshotUrl(row.path)}" target="_blank" rel="noreferrer">JSON ↗</a></td>
  </tr>`).join('');
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv() {
  const header = ['captured_at_utc', 'repository', 'views_14d', 'unique_visitors_14d', 'clones_14d', 'unique_cloners_14d', 'recorded_views_total', 'recorded_views_from', 'recorded_views_through', 'recorded_clones_total', 'recorded_clones_from', 'recorded_clones_through', 'named_zip_downloads', 'stars', 'forks', 'source_file', 'sha256'];
  const body = loadedRows.map(row => [
    row.capturedAt, row.repository, row.views, row.uniqueVisitors, row.clones,
    row.uniqueCloners, row.recordedViews, row.recordedViewsFrom, row.recordedViewsThrough,
    row.recordedClones, row.recordedClonesFrom, row.recordedClonesThrough,
    row.releasePackageDownloads, row.stars, row.forks,
    snapshotUrl(row.path), row.sha256,
  ]);
  const csv = [header, ...body].map(row => row.map(csvCell).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`${csv}\n`], { type: 'text/csv;charset=utf-8' }));
  link.download = `ellivien-open-source-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function initialise() {
  try {
    const [latest, index] = await Promise.all([
      fetchJson('./data/latest.json'),
      fetchJson('./data/index.json'),
    ]);
    const latestEntry = index.snapshots[0];
    const recordedByRepository = new Map(latestEntry.repositories.map(repository => [repository.repository, repository]));
    repoGrid.innerHTML = latest.repositories
      .map((repository, position) => renderCard(
        repository,
        recordedByRepository.get(repository.repository),
        latest.capturedAt,
        latestEntry.path,
        position,
      ))
      .join('');
    renderHistory(index);
    lastUpdated.textContent = `Newest record: ${dateTime(latest.capturedAt)}`;
    status.className = 'status is-ready';
    status.textContent = `${latest.repositories.length} public repositories loaded · recorded totals retain each UTC day once.`;
    footerStatus.textContent = `${index.snapshots.length} account-wide snapshots preserved.`;
    downloadButton.disabled = false;
    downloadButton.addEventListener('click', downloadCsv);
  } catch (error) {
    console.error(error);
    status.className = 'status is-error';
    status.textContent = 'The evidence files could not be loaded just now. The public GitHub history remains intact.';
    lastUpdated.textContent = 'Evidence connection unavailable';
    historyBody.innerHTML = `<tr><td colspan="10"><a href="https://github.com/${OWNER}/${EVIDENCE_REPOSITORY}/tree/main/docs/data">Open the public evidence directly on GitHub.</a></td></tr>`;
  }
}

initialise();
