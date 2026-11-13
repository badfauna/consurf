[![Support on Ko-Fi](https://img.shields.io/badge/support-buy_me_a_coffee-blue)](https://ko-fi.com/getnuki)
[![Bluesky followers](https://img.shields.io/bluesky/followers/consurf.bsky.social)](https://bsky.app/profile/consurf.bsky.social)


# Consurf Open Data

Structured dataset of furry conventions and their editions (events), published by [Consurf](https://consurf.net).

This data is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].

[![CC BY-SA 4.0][cc-by-sa-image]][cc-by-sa]

This repository provides machine-readable JSON intended for:
- Developers
- Researchers
- Data analysts
- Archival purposes

**New here? Read [How to use](How%20to%20use.md)** for a one-time download example and a
script that keeps a local copy current using only each release's changes.

---

## Dataset contents

```
data/
  conventions/<slug>.json   one file per convention, with all of its events, venues and prices
  index.json                every convention file with its sha256 hash
schema/
  convention.schema.json    JSON Schema for data/conventions/*.json
  index.schema.json         JSON Schema for data/index.json
  changes.schema.json       JSON Schema for the changes.json release asset
```

All files are UTF-8 encoded JSON with LF line endings. Schemas use
[JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema), and every data file
references its schema in `$schema`, so editors and validators pick it up automatically.

> **Upgrading from the flat files?** `conventions.json`, `events.json`, `venues.json`,
> `schema.json` and `metadata.json` were replaced by this layout in schema version 2.
> Events now live inside their convention, venues and prices inside their event,
> `$ref` was renamed to `url`, and `startDate`/`endDate` are plain dates (`YYYY-MM-DD`).
> Older releases keep the flat files.

---

## Update frequency and releases

The dataset is refreshed automatically **every Monday at 07:00 UTC**. A release is only
published when something changed.

- Releases are tagged `YYYY.MM.DD` (with a `.2`, `.3`, ... suffix for a second run on the same day).
- Each release has two assets:
  - **`changes.json`**: the convention files added, modified or removed since the previous release.
  - **`consurf-open-data-<tag>.zip`**: the full dataset at that release.

### Reading only what changed

`changes.json` looks like this:

```json
{
  "$schema": "https://raw.githubusercontent.com/badfauna/consurf/main/schema/changes.schema.json",
  "schemaVersion": 2,
  "release": "2026.11.09",
  "previousRelease": "2026.11.02",
  "commit": "e86974bf4d83d8aa7ac27c8ef4a4ec358439ce3e",
  "generatedAt": "2026-11-09T07:00:12.743Z",
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

A typical ingestion loop:

```sh
# 1. Latest release's change list
gh release download --repo badfauna/consurf --pattern changes.json
# or: curl -sL https://github.com/badfauna/consurf/releases/latest/download/changes.json

# 2. Download only the files you care about, pinned to that release
TAG=$(jq -r .release changes.json)
for path in $(jq -r '.added[].path, .modified[].path' changes.json); do
  curl -sfL "https://raw.githubusercontent.com/badfauna/consurf/$TAG/$path" -o "$(basename "$path")"
done
```

Skipped a few releases? Compare your stored hashes with `data/index.json` instead: any entry
whose `sha256` differs from yours changed, and any slug you have that is missing from the index
was removed. The `sha256` is computed over the exact bytes of the file.

Convention files are keyed by slug. If a convention is renamed, its old slug appears under
`removed` and the new one under `added`, both with the same `id`.

---

## Data model

### data/conventions/&lt;slug&gt;.json

Sample (shortened):

```json
{
  "$schema": "https://raw.githubusercontent.com/badfauna/consurf/main/schema/convention.schema.json",
  "schemaVersion": 2,
  "id": "cmgiswmgh0029iae077034cq9",
  "slug": "aquatifur",
  "name": "AquatiFur",
  "shortName": "AQF",
  "description": "AquatiFur, or AQF, is a furry fandom convention located in the heart of Wisconsin...",
  "blueskyHandle": "aquatifur.com",
  "moreInformation": "https://t.me/+EOvXNt_-kBA4MGFh",
  "codeOfConduct": null,
  "hostCountry": "USA",
  "minAge": null,
  "website": "https://aquatifur.com/",
  "url": "https://consurf.net/conventions/aquatifur",
  "lastModified": "2026-10-21T18:02:11.000Z",
  "events": [
    {
      "id": "cmhpe4z2p00bjian0qe23ca09",
      "slug": "aquatifur-2026",
      "name": "AquatiFur",
      "url": "https://consurf.net/aquatifur-2026",
      "address": "Chula Vista Resort, 2501 River Rd, Wisconsin Dells, WI 53965, United States",
      "country": "USA",
      "isCancelled": false,
      "startDate": "2026-04-17",
      "endDate": "2026-04-19",
      "timezone": "America/Chicago",
      "attendeeCount": 1472,
      "fursuiterCount": null,
      "vendorCount": null,
      "charityRaised": 8260.23,
      "charityName": "Wildlife rescue",
      "guestsOfHonor": ["Guest Name"],
      "sources": ["https://example.org/report"],
      "createdAt": "2026-01-12T16:29:47.458Z",
      "venues": [
        { "id": "cmlq7szdk0003o601k3gezqpc", "name": "Chula Vista Resort", "address": "2501 River Rd", "isMain": true }
      ],
      "prices": [
        { "priceType": "Standard", "amount": 65, "currency": "USD", "rateCutoff": null }
      ]
    }
  ]
}
```

Notes
- A convention is the recurring brand (Anthrocon); events are its yearly editions (Anthrocon 2025, 2026, ...).
- Events are ordered by `startDate`; the main venue (`isMain`, the venue hosting or closest to the event) comes first.
- `startDate` and `endDate` are local calendar dates. Do not shift them by `timezone`.
- `country` and `hostCountry` use **ISO 3166-1 alpha-3**; `currency` uses **ISO 4217**.
- `charityRaised` is in the host country's currency.
- `priceType` is free text written by contributors (`Standard`, `Sponsor`, `Day Pass`, ...), not a fixed list of codes.
- `rateCutoff` is when a price stops being available (`null` if it has no deadline).
- `lastModified` is when the convention or any of its events last changed on Consurf.
- Attendance numbers are on-site reports, not ticket sales.

### Validating

Any JSON Schema 2020-12 validator works. With Node and [Ajv](https://ajv.js.org)
(`npm install ajv ajv-formats`):

```js
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync('schema/convention.schema.json', 'utf8')));

const doc = JSON.parse(readFileSync('data/conventions/anthrocon.json', 'utf8'));
console.log(validate(doc) ? 'valid' : ajv.errorsText(validate.errors));
```

Python users can use [`jsonschema`](https://pypi.org/project/jsonschema/) with `Draft202012Validator`.

---

## Contributions

This repository contains generated data, automatically extracted from the Consurf.net database.
Pull requests changing `data/` or `schema/` will be overwritten by the next sync.

Issues related to:
- Incorrect data
- Missing events

Should be patched via the main Consurf platform, by [creating an account](https://consurf.net/login) and contributing it yourself. Help is always appreciated!

## Contact
You can reach out to the admins via [our Bluesky](https://bsky.app/profile/consurf.bsky.social), or by emailing us at `bark@consurf.net`

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
[cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
[cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg
