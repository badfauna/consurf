# Consurf Open Data

Structured dataset of furry conventions and its iterations (events) published by Consurf.

This data is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].

This repository provides machine-readable JSON datasets intended for:
- Developers
- Researchers
- Data analysts
- Archival purposes

---

## Dataset Contents

The `/data/` directory contains the latest snapshot:

- `conventions.json`
- `events.json`
- `venues.json`
- `schema.json`
- `metadata.json`

All files are UTF-8 encoded JSON.

---

## Update Frequency

This dataset is updated **monthly** but more frequent updates can happen once datasets drift too much.

Updates are:
- Tagged using the format: `YYYY.MM.DD`

## Data Model

### conventions.json

Contains convention-level metadata.

Sample:
```json
[
  {
    "id": "cmgiswmgh0029iae077034cq9",
    "slug": "aquatifur",
    "name": "AquatiFur",
    "shortName": "AQF",
    "description": "AquatiFur, or AQF, is a furry fandom convention located in the heart of Wisconsin - the “Waterpark Capital of the World” - at the Chula Vista Resort!",
    "blueskyHandle": "aquatifur.com",
    "moreInformation": "https://t.me/+EOvXNt_-kBA4MGFh",
    "codeOfConduct": null,
    "hostCountry": "USA",
    "minAge": null,
    "website": "https://aquatifur.com/",
    "$ref": "https://consurf.net/conventions/aquatifur"
  }
]
```

### events.json

Contains individual events belonging to conventions. For example, Anthrocon is a convention, and years 2024, 2025, 2026, etc are events.

Sample:
```json
[
  {
    "id": "cmhpe4z2p00bjian0qe23ca09",
    "slug": "megaplex-2015",
    "name": "Megaplex",
    "address": "Marriott Orlando Airport Lakeside, 7499 Augusta National Drive, Orlando, FL 32822, United States of America",
    "country": "USA",
    "conventionId": "cmgiswmgi0032iae0c9606lxd",
    "isCancelled": false,
    "startDate": "2015-07-31T00:00:00.000Z",
    "endDate": "2015-08-02T00:00:00.000Z",
    "timezone": "America/New_York",
    "attendeeCount": 1472,
    "fursuiterCount": null,
    "charityRaised": 8260.23,
    "vendorCount": null,
    "createdAt": "2026-01-12T16:29:47.458Z",
    "$ref": "https://consurf.net/megaplex-2015"
  }
]
```
Notes
- `charityRaised` values are in the [country currency](https://www.xe.com/en-ca/currency/)
- All dates are in zone-neutral, do not correct dates when applying time zone, uses **ISO 8601**
- `country` uses **ISO 3166-1 Alpha-3**
- Attendance numbers are on-site reports, not ticket sales

### venues.json

Contains venues associated to an event. Multiple venues can belong to a single event as some have overflow hotels. The main venue is flagged in the `isMain`, that is the venue attached or closest to where the event happens.

Sample:
```json
[
  {
    "id": "cmlq7szdk0003o601k3gezqpc",
    "eventId": "cmkt7ceks0022qg01alxs51o3",
    "name": "Novotel Melbourne Preston",
    "address": "215 Bell St Preston VIC 3072",
    "isMain": true
  }
]
```

### schema.json & metadata.json

Contain validation schema and extra information about the dataset.

## Contributions

This repository contains generated data, automatically extracted from Consurf.net database.

Issues related to:
- Incorrect data
- Missing events

Should be patched via the main Consurf platform, by [creating an account](https://consurf.net/login) and contributing it yourself. Help is always appreciated!

## Contact
You can reach out to the admins via [our Bluesky](https://bsky.app/profile/consurf.bsky.social), or by emailing us at `social@consurf.net`

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
[cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
[cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg
