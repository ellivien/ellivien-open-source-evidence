function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function historyState(states, repository) {
  if (!states.has(repository)) {
    states.set(repository, { views: new Map(), clones: new Map() });
  }
  return states.get(repository);
}

function mergeDaily(target, records) {
  for (const record of records || []) {
    if (!record?.timestamp) continue;
    target.set(record.timestamp, {
      count: count(record.count),
      uniques: count(record.uniques),
    });
  }
}

function total(target) {
  return [...target.values()].reduce((sum, record) => sum + record.count, 0);
}

function uniqueDayTotal(target) {
  return [...target.values()].reduce((sum, record) => sum + record.uniques, 0);
}

function firstRecordedDate(target) {
  return [...target.entries()]
    .filter(([, record]) => record.count > 0)
    .map(([timestamp]) => timestamp)
    .sort()[0] || null;
}

function lastDate(target) {
  return [...target.keys()].sort().at(-1) || null;
}

function publicSummary(repository, state) {
  const recordedViewsFrom = firstRecordedDate(state.views);
  const recordedClonesFrom = firstRecordedDate(state.clones);
  return {
    repository: repository.repository,
    views: count(repository.traffic?.views?.count),
    uniqueVisitors: count(repository.traffic?.views?.uniques),
    clones: count(repository.traffic?.clones?.count),
    uniqueCloners: count(repository.traffic?.clones?.uniques),
    recordedViews: total(state.views),
    recordedVisitorDays: uniqueDayTotal(state.views),
    recordedViewsFrom,
    recordedViewsThrough: lastDate(state.views),
    recordedClones: total(state.clones),
    recordedClonerDays: uniqueDayTotal(state.clones),
    recordedClonesFrom,
    recordedClonesThrough: lastDate(state.clones),
    recordedTrafficFrom: [recordedViewsFrom, recordedClonesFrom].filter(Boolean).sort()[0] || null,
    releasePackageDownloads: count(repository.releasePackageDownloadTotal),
    stars: count(repository.repositoryTotals?.stars),
    forks: count(repository.repositoryTotals?.forks),
  };
}

export function buildEvidenceIndex({ account, snapshots }) {
  const chronological = [...snapshots].sort((a, b) =>
    String(a.snapshot.capturedAt).localeCompare(String(b.snapshot.capturedAt)));
  const states = new Map();

  const entries = chronological.map(({ path, sha256, snapshot }) => {
    for (const repository of snapshot.repositories || []) {
      const state = historyState(states, repository.repository);
      // GitHub's windows overlap. A later snapshot replaces the stored value
      // for the same UTC day, so every day contributes exactly once.
      mergeDaily(state.views, repository.traffic?.views?.views);
      mergeDaily(state.clones, repository.traffic?.clones?.clones);
    }

    return {
      capturedAt: snapshot.capturedAt,
      path,
      sha256,
      repositoryCount: (snapshot.repositories || []).length,
      repositories: (snapshot.repositories || []).map(repository =>
        publicSummary(repository, historyState(states, repository.repository))),
    };
  });

  return {
    schemaVersion: 2,
    account,
    derivation: {
      recordedTraffic: 'Daily GitHub traffic records are merged by repository and UTC timestamp; overlapping days use the newest preserved report and are counted once.',
      recordedStart: 'The displayed start date is the first day with a non-zero preserved view or clone, not earlier zero-filled API padding.',
      dailyUniqueTotals: 'Visitor-days and cloner-days sum GitHub daily unique counts. A returning client on a different UTC day contributes once to each day and is not claimed as a new lifetime-unique person.',
      uniqueBoundary: 'Unique visitors and cloning clients remain rolling 14-day figures because GitHub does not expose identities that could be deduplicated across weeks.',
    },
    snapshots: entries.reverse(),
  };
}
