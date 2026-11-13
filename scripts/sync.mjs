#!/usr/bin/env node
//
//   Consurf open data sync
//
//   ⠀ ⢯⠙⠲⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀
//   ⠀⠀⠸⡆⠀⠀⠈⠳⣄⠀⠀⠀⠀⠀⠀⠀
//   ⠀⠀⠀⡇⠀⠀⠀⠀⠈⢳⡀⠀⠀⠀⠀⠀
//   ⠀⠀⢰⠇⠀⠀⠀⠀⠀⠈⢷⠀⠀⠀⠀⠀
//   ⣀⡴⠒⢾⡀⣀⡴⠒⢦⣀⢀⡼⠓⢦⣀
//   ⣩⠴⠒⢶⣉⣉⡴⠒⢦⣉⣉⡴⠒⠶⣌
//   ⠁⠀⠀⠀⠈⠁⠀⠀⠀⠈⠁⠀⠀⠀⠈
//
//   node scripts/sync.mjs write <snapshot.json>
//     Writes schema/*.schema.json, data/conventions/<slug>.json and data/index.json
//     from a Consurf snapshot, deletes files of conventions no longer published,
//     and validates everything against the schemas. Exits non-zero on any error.
//
//   node scripts/sync.mjs manifest --release <tag> --commit <sha>
//                                  [--previous <tag>] --out <changes.json> --notes <notes.md>
//     Compares data/conventions at <previous> (or nothing) with HEAD and writes the
//     release manifest (changes.json) plus release notes.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMA_DIR = 'schema';
const CONVENTIONS_DIR = 'data/conventions';
const INDEX_PATH = 'data/index.json';
const SCHEMA_FILES = {
  convention: 'convention.schema.json',
  index: 'index.schema.json',
  changes: 'changes.schema.json',
};
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const conventionPath = (slug) => `${CONVENTIONS_DIR}/${slug}.json`;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

const loadValidators = () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const read = (name) => JSON.parse(readFileSync(join(SCHEMA_DIR, SCHEMA_FILES[name]), 'utf8'));
  return {
    convention: ajv.compile(read('convention')),
    index: ajv.compile(read('index')),
    changes: ajv.compile(read('changes')),
    errorsText: (errors) => ajv.errorsText(errors, { separator: '; ' }),
  };
};

const assertValid = (validators, kind, value, label) => {
  const validate = validators[kind];
  if (!validate(value)) {
    fail(`${label} is not a valid ${kind} document: ${validators.errorsText(validate.errors)}`);
  }
};

function write(snapshotPath) {
  if (!snapshotPath) fail('Usage: sync.mjs write <snapshot.json>');

  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (error) {
    fail(`Could not read snapshot: ${error.message}`);
  }
  if (!snapshot?.schemas || !Array.isArray(snapshot.conventions)) {
    fail('Snapshot is missing "schemas" or "conventions"');
  }
  if (snapshot.conventions.length === 0) {
    // Guard against wiping the dataset because of an upstream glitch
    fail('Snapshot contains no conventions; refusing to publish an empty dataset');
  }

  // 1. Schemas first, so everything below is validated against what we publish
  mkdirSync(SCHEMA_DIR, { recursive: true });
  for (const [name, file] of Object.entries(SCHEMA_FILES)) {
    if (!snapshot.schemas[name]) fail(`Snapshot is missing the "${name}" schema`);
    writeFileSync(join(SCHEMA_DIR, file), serialize(snapshot.schemas[name]));
  }
  const validators = loadValidators();

  // 2. One file per convention, validated before anything touches the disk
  const seen = new Set();
  for (const convention of snapshot.conventions) {
    const label = `Convention "${convention?.slug ?? convention?.id ?? '?'}"`;
    assertValid(validators, 'convention', convention, label);
    // Slugs become file names: never trust them beyond the schema
    if (!SLUG_PATTERN.test(convention.slug)) fail(`${label} has an unsafe slug`);
    if (seen.has(convention.slug)) fail(`${label} appears more than once`);
    seen.add(convention.slug);
  }

  mkdirSync(CONVENTIONS_DIR, { recursive: true });
  const entries = [];
  for (const convention of snapshot.conventions) {
    const path = conventionPath(convention.slug);
    const content = serialize(convention);
    writeFileSync(path, content);
    entries.push({
      id: convention.id,
      slug: convention.slug,
      name: convention.name,
      path,
      sha256: sha256(content),
      lastModified: convention.lastModified,
    });
  }

  // 3. Remove conventions that are no longer published (or were renamed)
  let removed = 0;
  for (const file of readdirSync(CONVENTIONS_DIR)) {
    if (file.endsWith('.json') && !seen.has(file.slice(0, -'.json'.length))) {
      rmSync(join(CONVENTIONS_DIR, file));
      removed += 1;
    }
  }

  // 4. Index with content hashes
  const index = {
    $schema: snapshot.schemas.index.$id,
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    conventions: entries,
  };
  assertValid(validators, 'index', index, INDEX_PATH);
  writeFileSync(INDEX_PATH, serialize(index));

  console.log(`Wrote ${entries.length} conventions, removed ${removed} stale files.`);
}

function manifest(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      release: { type: 'string' },
      previous: { type: 'string', default: '' },
      commit: { type: 'string' },
      out: { type: 'string' },
      notes: { type: 'string' },
    },
  });
  if (!values.release || !values.commit || !values.out || !values.notes) {
    fail('Usage: sync.mjs manifest --release <tag> --commit <sha> [--previous <tag>] --out <file> --notes <file>');
  }

  const previous = values.previous || null;
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const byPath = new Map(index.conventions.map((entry) => [entry.path, entry]));

  // Status of every convention file between the previous release and HEAD
  const statusLines = previous
    ? git('diff', '--no-renames', '--name-status', previous, 'HEAD', '--', CONVENTIONS_DIR)
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t'))
    : index.conventions.map((entry) => ['A', entry.path]);

  const added = [];
  const modified = [];
  const removed = [];
  for (const [status, path] of statusLines) {
    const slug = path.slice(CONVENTIONS_DIR.length + 1, -'.json'.length);
    if (status === 'D') {
      // Recover the id from the file as it was in the previous release
      const old = JSON.parse(git('show', `${previous}:${path}`));
      removed.push({ id: old.id, slug, path });
      continue;
    }
    const entry = byPath.get(path);
    if (!entry) fail(`${path} changed but is missing from ${INDEX_PATH}`);
    const item = { id: entry.id, slug, path, sha256: entry.sha256 };
    (status === 'A' ? added : modified).push(item);
  }
  const bySlug = (a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  added.sort(bySlug);
  modified.sort(bySlug);
  removed.sort(bySlug);

  const changes = {
    $schema: JSON.parse(readFileSync(join(SCHEMA_DIR, SCHEMA_FILES.changes), 'utf8')).$id,
    schemaVersion: index.schemaVersion,
    release: values.release,
    previousRelease: previous,
    commit: values.commit,
    generatedAt: index.generatedAt,
    summary: {
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      total: index.conventions.length,
    },
    added,
    modified,
    removed,
  };
  assertValid(loadValidators(), 'changes', changes, 'changes.json');
  writeFileSync(values.out, serialize(changes));

  const nameOf = (item) => byPath.get(item.path)?.name ?? item.slug;
  const list = (items, withName = true) =>
    items.length === 0
      ? '_None_'
      : items.map((item) => `- \`${item.slug}\`${withName ? ` ${nameOf(item)}` : ''}`).join('\n');
  const notes = [
    `Open data snapshot generated ${index.generatedAt}.`,
    '',
    `**${added.length}** added, **${modified.length}** modified, **${removed.length}** removed, **${index.conventions.length}** conventions in total.`,
    previous ? `Compared with \`${previous}\`.` : 'First release of this layout.',
    '',
    'The machine-readable list is in the `changes.json` asset. Download only the',
    '`data/conventions/<slug>.json` files you need from this tag, or the zip for everything.',
    '',
    `### Added\n${list(added)}`,
    '',
    `### Modified\n${list(modified)}`,
    '',
    `### Removed\n${list(removed, false)}`,
    '',
  ].join('\n');
  writeFileSync(values.notes, notes);

  console.log(`Manifest: ${added.length} added, ${modified.length} modified, ${removed.length} removed.`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'write') write(rest[0]);
else if (command === 'manifest') manifest(rest);
else fail('Usage: sync.mjs <write|manifest> ...');

