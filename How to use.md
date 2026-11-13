# How to use the Consurf open data

This guide shows two ways to consume the dataset:

1. [**One-time pull**](#1-one-time-pull): download everything once and work with it locally.
2. [**Deltas only**](#2-keeping-a-copy-up-to-date-with-deltas): keep a local copy current by applying each
   release's `changes.json`, downloading only the conventions that changed.

The examples use `curl`, `unzip` and `jq` for the shell, and Node.js 18 or newer (built-in
`fetch`) for scripts. No GitHub token is needed: every URL below is public.

---

## What you are working with

```
data/conventions/<slug>.json   one convention with all its events, venues and prices
data/index.json                every convention file, with its id and sha256 hash
schema/*.schema.json           JSON Schemas (draft 2020-12) for all of the above
```

Each release (tagged `YYYY.MM.DD`) also publishes two assets:

| Asset | What it is |
|---|---|
| `changes.json` | The convention files added, modified or removed since the previous release |
| `consurf-open-data-<tag>.zip` | The full dataset at that release |

Useful URLs (replace `<tag>` and `<path>`):

| What | URL |
|---|---|
| Latest `changes.json` | `https://github.com/badfauna/consurf/releases/latest/download/changes.json` |
| `changes.json` of a release | `https://github.com/badfauna/consurf/releases/download/<tag>/changes.json` |
| One file at a release | `https://raw.githubusercontent.com/badfauna/consurf/<tag>/<path>` |
| Latest release metadata | `https://api.github.com/repos/badfauna/consurf/releases/latest` |

Always download files **at a release tag**, not from `main`, so everything you read comes from
the same snapshot.

---

## The convention `id` is the reference to use

Every convention has an `id` (for example `cmgiswmgh0029iae077034cq9`). It is a universal, immutable registry entry for that convention:

- It is assigned once, when the convention is first registered on Consurf, and **never changes**.
- It is **never reused**, even if a convention is removed from the dataset.
- The `slug` (and so the file name) and the `name` **can change**, for example when a convention rebrands.

Use the `id` as the unique key for a convention in your own database, links and joins. Treat the slug as a readable label and a file location, not as an identity. When a convention is renamed, a release lists its old slug under `removed` and its new slug under `added`, **both with the same `id`**. If you key by `id`, a rename is just an update.

---

## 1. One-time pull

### Option A: the release zip (shell)

```sh
# Find the latest release tag
TAG=$(curl -s https://api.github.com/repos/badfauna/consurf/releases/latest | jq -r .tag_name)

# Download and unpack the full dataset at that release
curl -sfLO "https://github.com/badfauna/consurf/releases/download/$TAG/consurf-open-data-$TAG.zip"
unzip -q "consurf-open-data-$TAG.zip" -d consurf-data

# How many conventions, and a quick look at one
jq '.conventions | length' consurf-data/data/index.json
jq '{id, name, hostCountry, events: (.events | length)}' consurf-data/data/conventions/anthrocon.json
```

Or clone it: `git clone --depth 1 --branch "$TAG" https://github.com/badfauna/consurf.git`.

### Option B: work with it in Node

After unpacking the zip, load every convention keyed by `id`. This example lists events in the
next 90 days with their main venue and cheapest listed price:

```js
// upcoming.mjs  (run from the folder that contains data/)
import { readFileSync } from 'node:fs';

const index = JSON.parse(readFileSync('data/index.json', 'utf8'));

// Key everything by the immutable convention id
const conventions = new Map(
  index.conventions.map((entry) => [entry.id, JSON.parse(readFileSync(entry.path, 'utf8'))]),
);

const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

const upcoming = [...conventions.values()]
  .flatMap((con) => con.events.map((event) => ({ con, event })))
  .filter(({ event }) => !event.isCancelled && event.startDate >= today && event.startDate <= horizon)
  .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate));

for (const { con, event } of upcoming) {
  const venue = event.venues.find((v) => v.isMain)?.name ?? event.address ?? 'TBA';
  const cheapest = [...event.prices].sort((a, b) => a.amount - b.amount)[0];
  const price = cheapest ? `${cheapest.amount} ${cheapest.currency} (${cheapest.priceType})` : 'n/a';
  console.log(`${event.startDate}  ${con.name} (${con.id})  ${venue}  ${price}`);
}
```

```sh
node upcoming.mjs
```

> `startDate` and `endDate` are local calendar dates (`YYYY-MM-DD`). Compare them as strings, and
> do not shift them by `timezone`.
>
> `priceType` is free text written by contributors (`Standard`, `Sponsor`, `Day Pass`, ...), not a
> fixed list of codes. Don't match on exact values. Each price has its own `currency`.

---

## 2. Keeping a copy up to date with deltas

Every release's `changes.json` lists what changed since the release before it. Its
`previousRelease` field points to that release. Following that chain back from the latest release
to the last one you applied gives you everything that changed, even if you skipped several weeks.

A `changes.json` looks like this:

```json
{
  "release": "2026.11.16",
  "previousRelease": "2026.11.09",
  "summary": { "added": 0, "modified": 1, "removed": 1, "total": 290 },
  "added": [],
  "modified": [
    { "id": "cmgiswmgk004niae01ihwtn8w", "slug": "abando", "path": "data/conventions/abando.json", "sha256": "c27f85..." }
  ],
  "removed": [
    { "id": "cmgiswmgr0093iae0pwyixzwc", "slug": "zoniecon", "path": "data/conventions/zoniecon.json" }
  ]
}
```

### Quick check from the shell

```sh
curl -sfL https://github.com/badfauna/consurf/releases/latest/download/changes.json -o changes.json
jq -r '"\(.release) (since \(.previousRelease)): \(.summary)"' changes.json
jq -r '.added[], .modified[] | "\(.id)  \(.path)"' changes.json   # files to download
jq -r '.removed[] | .id' changes.json                              # ids to delete
```

Using only the latest `changes.json` is enough if you check every week. If you might miss a
release, use the script below, which walks the chain.

### A complete delta sync in Node

The script keeps a local store with one file per convention **named by `id`**, plus a `state.json` that remembers the last release applied. Run it on a schedule (for example, every Monday after 07:00 UTC). The first run, or any run where the chain can't reach your last release, does a full sync instead.

```js
// sync-consurf.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'https://github.com/badfauna/consurf';
const RAW = 'https://raw.githubusercontent.com/badfauna/consurf';
const STORE = 'consurf-store';                 // <id>.json files live here
const STATE = join(STORE, 'state.json');       // { "release": "<last applied tag>" }

const getJson = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

// Download one convention file at a tag; check its hash when we know it
const download = async (tag, path, sha256) => {
  const res = await fetch(`${RAW}/${tag}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const text = await res.text();
  if (sha256 && createHash('sha256').update(text).digest('hex') !== sha256) {
    throw new Error(`Hash mismatch for ${path}`);
  }
  return JSON.parse(text);
};

const save = (convention) =>
  writeFileSync(join(STORE, `${convention.id}.json`), JSON.stringify(convention, null, 2));

async function fullSync(tag) {
  const index = await download(tag, 'data/index.json');
  rmSync(STORE, { recursive: true, force: true });
  mkdirSync(STORE, { recursive: true });
  for (const entry of index.conventions) save(await download(tag, entry.path, entry.sha256));
  console.log(`Full sync: ${index.conventions.length} conventions at ${tag}`);
}

async function main() {
  mkdirSync(STORE, { recursive: true });
  const applied = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')).release : null;

  const latest = await getJson(`${REPO}/releases/latest/download/changes.json`);
  if (!latest) throw new Error('No release found');
  if (latest.release === applied) return console.log(`Already at ${applied}`);

  // Walk back from the latest release until we reach the one we already applied
  const chain = [latest];
  while (applied && chain.at(-1).previousRelease && chain.at(-1).previousRelease !== applied) {
    const previous = await getJson(`${REPO}/releases/download/${chain.at(-1).previousRelease}/changes.json`);
    if (!previous) break; // reached a release without changes.json
    chain.push(previous);
  }

  if (!applied || chain.at(-1).previousRelease !== applied) {
    await fullSync(latest.release);
  } else {
    // Net effect per id, oldest release first; a later action overrides an earlier one
    const actions = new Map(); // id -> { type: 'upsert', path } | { type: 'remove' }
    for (const changes of chain.reverse()) {
      for (const item of changes.removed) actions.set(item.id, { type: 'remove' });
      for (const item of [...changes.added, ...changes.modified]) {
        actions.set(item.id, { type: 'upsert', path: item.path });
      }
    }

    // Hashes are only valid for the latest release, so check them against its index
    const index = await download(latest.release, 'data/index.json');
    const hashes = new Map(index.conventions.map((e) => [e.id, e.sha256]));

    for (const [id, action] of actions) {
      if (action.type === 'remove') {
        rmSync(join(STORE, `${id}.json`), { force: true });
        continue;
      }
      const current = index.conventions.find((e) => e.id === id);
      save(await download(latest.release, current?.path ?? action.path, hashes.get(id)));
    }
    console.log(`Applied ${chain.length} release(s) up to ${latest.release}: ${actions.size} convention(s) touched`);
  }

  writeFileSync(STATE, JSON.stringify({ release: latest.release }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

```sh
node sync-consurf.mjs
# Full sync: 291 conventions at 2026.11.16
node sync-consurf.mjs
# Already at 2026.11.16
```

How it treats each case:

- **Modified convention:** re-downloaded and overwritten at `consurf-store/<id>.json`.
- **Renamed convention:** the old slug is removed and the new slug added under the same `id`, so the
  net result is one updated file. Nothing is deleted.
- **Removed convention:** its `<id>.json` is deleted.
- **Skipped releases:** the chain is replayed oldest first, and only the final state of each
  convention is downloaded.
- **Broken chain** (very old state, or a release without `changes.json`): it falls back to a full
  sync.

### Without following the chain

`data/index.json` lists the `sha256` of every file at each release. Keep the hashes you
downloaded, compare them with the latest index, and fetch the files whose hash differs. Any `id`
you hold that is missing from the index has been removed.

---

## Validating what you ingest

Every file names its schema in `$schema`. Validate before you store, with any JSON Schema
draft 2020-12 validator. In Node with Ajv (`npm install ajv ajv-formats`):

```js
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schema = await (await fetch('https://raw.githubusercontent.com/badfauna/consurf/main/schema/convention.schema.json')).json();
const validate = ajv.compile(schema);

const doc = JSON.parse(readFileSync('consurf-store/cmgiswmgh0029iae077034cq9.json', 'utf8'));
if (!validate(doc)) console.error(ajv.errorsText(validate.errors));
```

Every document carries `schemaVersion`. If it changes, the layout changed in a breaking way:
read the release notes before ingesting it.

---

## Attribution

The data is licensed [CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/). When you
reuse it, credit Consurf.net and share derived datasets under the same license. To fix wrong or
missing data, edit it on [consurf.net](https://consurf.net). This repository is regenerated
weekly and changes made here are overwritten.
