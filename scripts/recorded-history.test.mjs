import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceIndex } from './recorded-history.mjs';

function repository(name, { views, clones }) {
  return {
    repository: `ellivien/${name}`,
    traffic: {
      views: {
        count: views.reduce((sum, day) => sum + day.count, 0),
        uniques: 1,
        views,
      },
      clones: {
        count: clones.reduce((sum, day) => sum + day.count, 0),
        uniques: 1,
        clones,
      },
    },
    releasePackageDownloadTotal: 2,
    repositoryTotals: { stars: 0, forks: 0 },
  };
}

function day(timestamp, count) {
  return { timestamp: `${timestamp}T00:00:00Z`, count, uniques: 1 };
}

test('overlapping GitHub days are counted once using the newest report', () => {
  const index = buildEvidenceIndex({
    account: 'ellivien',
    // Deliberately newest-first, matching the stored public index.
    snapshots: [
      {
        path: 'new.json', sha256: 'new',
        snapshot: {
          capturedAt: '2026-11-08T08:17:00Z',
          repositories: [repository('example', {
            views: [day('2026-11-01', 4), day('2026-11-02', 5)],
            clones: [day('2026-11-01', 3), day('2026-11-02', 2)],
          })],
        },
      },
      {
        path: 'old.json', sha256: 'old',
        snapshot: {
          capturedAt: '2026-11-01T08:17:00Z',
          repositories: [repository('example', {
            views: [day('2026-10-31', 2), day('2026-11-01', 3)],
            clones: [day('2026-10-31', 1), day('2026-11-01', 1)],
          })],
        },
      },
    ],
  });

  assert.equal(index.snapshots[0].repositories[0].recordedViews, 11);
  assert.equal(index.snapshots[0].repositories[0].recordedClones, 6);
  assert.equal(index.snapshots[0].repositories[0].recordedViewsFrom, '2026-10-31T00:00:00Z');
  assert.equal(index.snapshots[0].repositories[0].recordedViewsThrough, '2026-11-02T00:00:00Z');
  assert.equal(index.snapshots[1].repositories[0].recordedViews, 5);
});

test('a future repository begins its own recorded history automatically', () => {
  const index = buildEvidenceIndex({
    account: 'ellivien',
    snapshots: [{
      path: 'only.json', sha256: 'only',
      snapshot: {
        capturedAt: '2026-11-08T08:17:00Z',
        repositories: [repository('future-repository', {
          views: [day('2026-11-07', 7)],
          clones: [day('2026-11-07', 3)],
        })],
      },
    }],
  });

  assert.equal(index.snapshots[0].repositories[0].repository, 'ellivien/future-repository');
  assert.equal(index.snapshots[0].repositories[0].recordedViews, 7);
  assert.equal(index.snapshots[0].repositories[0].recordedClones, 3);
});
