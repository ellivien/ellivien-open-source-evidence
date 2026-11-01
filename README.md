# Ellivien Open-Source Evidence

Automatic, privacy-preserving GitHub evidence for Ellivien's public
repositories.

The collector discovers the account's public repositories afresh on every run,
up to a hard limit of 50. New public repositories therefore join the record
without a code change. The evidence repository excludes itself so its own
scheduled commits do not manufacture interest in the measured projects.

## Public dashboard

The readable dashboard is published from `docs/` by the dedicated
`publish-dashboard.yml` GitHub Pages workflow. Publishing uses one concurrency
lane so an overlapping older deployment cannot block a newer evidence update.
It listens for successful completion of the evidence collector because GitHub
intentionally prevents a workflow-token commit from directly triggering a
second workflow.
The raw, timestamped JSON remains the authoritative evidence.

## Automatic schedule

GitHub Actions runs every Sunday at 08:17 UTC. Each run preserves:

- rolling 14-day views and unique visitors;
- rolling 14-day full clones and unique cloning clients;
- top public referrers and popular repository paths;
- stars, forks and open issue/PR totals;
- named release assets and their cumulative download counts.

The workflow also supports a manual run, but ordinary weekly collection needs
no user action and does not require a Mac to be awake.

The public index merges the daily traffic arrays from every preserved snapshot
by repository and UTC timestamp. Overlapping Sundays therefore replace the
same date instead of adding it twice, producing growing recorded-view and
recorded-clone totals from the first day with genuine recorded activity onward.
Earlier zero-filled API padding is not presented as part of the evidence period. GitHub
does not expose identities that could support an all-time unique-person count,
so the cumulative companion measures are explicitly labelled **visitor-days**
and **cloner-days**. A returning client contributes once to every UTC day on
which it appears; this demonstrates repeated engagement without pretending to
identify lifetime-unique people. The raw snapshots and CSV still retain
GitHub's original rolling 14-day unique fields for auditability.

## One-time secret

GitHub's traffic endpoints require repository **Administration: Read-only**.
For automatic discovery of future repositories, create one fine-grained token
for the `ellivien` account with:

- repository access: **All repositories**;
- Administration: **Read-only**;
- no write permissions and no Contents permission.

Store it in this repository as the Actions secret `ACCOUNT_TRAFFIC_TOKEN`.
The token can read aggregate traffic and repository metadata. The collector
discards every private repository before making any traffic or release request.
Public release data is fetched without the token.

## Evidence boundary

- GitHub traffic is a rolling 14-day window, so weekly snapshots overlap.
- Named release downloads count requests, not installations or people.
- Unique clients are not guaranteed to be unique humans.
- Automated clients may contribute to traffic.
- The public commit history establishes what this transparent collector saved
  at each date; it does not prove why a person visited.
- If more than 50 public repositories are discovered, collection fails visibly
  instead of silently omitting projects.

No cookies, IP addresses, visitor identities or portal telemetry are collected.
