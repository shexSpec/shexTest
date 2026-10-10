#!/usr/bin/env node

// Check that every test's id and its mf:name say the same thing.
//
//   bin/checkManifestNames.js             check every */manifest.{ttl,jsonld}
//   bin/checkManifestNames.js DIR [DIR…]  check only the named directories
//
// A test is identified twice: by its IRI, <#1dot_pass> in manifest.ttl and
// "@id": "#1dot_pass" in manifest.jsonld, and by its mf:name, "1dot_pass".
// (manifest-ld.yaml has only `name: 1dot_pass`; when the two disagree,
// bin/manifest-ld-from-legacy.js keeps both there as a name and an "@id".)
// Implementations pick whichever is handy to select, skip and report tests, so
// when the two disagree, the test one harness calls X is the test another
// calls Y. Nothing else notices: a copied test with only one of the two edited
// is still a perfectly good manifest.
//
// For each directory, in both serializations:
//   - every test has exactly one name, and it equals the fragment of its id
//   - no id or name is used by more than one test
//   - the mf:entries list and the defined tests are the same set (ttl)
// and across the two:
//   - they list the same ids, in the same order, with the same names
// and in manifest-ld.yaml:
//   - the same tests, in the same order, each named once, none with an "@id"
//
// manifest.jsonld is read as plain JSON, not expanded as JSON-LD, because that
// is how its consumers read it; the strings have to match as written.
//
// exit 0 if everything agrees, 1 otherwise.

'use strict';
const fs = require('fs');
const path = require('path');
const N3 = require('n3');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const MF = 'http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#';

const dups = a => [...new Set(a.filter((x, i) => a.indexOf(x) !== i))];
const q = s => JSON.stringify(s);

// -> {base, entries: ["#id"], tests: Map("#id" -> [name])}
function readTtl(file, bad) {
  // Keep the parser's quads as emitted: a Store would merge the triples of a
  // test block that was pasted twice and hide the repeat.
  const quads = new N3.Parser().parse(fs.readFileSync(file, 'utf8'));
  const objects = (s, p) => quads
    .filter(t => t.subject.equals(s) && t.predicate.value === p)
    .map(t => t.object);

  const manifests = quads.filter(t =>
    t.predicate.value === RDF + 'type' && t.object.value === MF + 'Manifest');
  if (manifests.length !== 1)
    throw Error(`expected one mf:Manifest, found ${manifests.length}`);
  const manifest = manifests[0].subject;
  const base = manifest.value;
  const id = iri => iri.startsWith(base + '#') ? iri.slice(base.length) : `<${iri}>`;

  const entries = [];
  const firsts = new Map(), rests = new Map();
  for (const t of quads) {
    if (t.predicate.value === RDF + 'first') firsts.set(t.subject.value, t.object);
    if (t.predicate.value === RDF + 'rest') rests.set(t.subject.value, t.object);
  }
  for (let n = objects(manifest, MF + 'entries')[0];
       n && n.value !== RDF + 'nil'; n = rests.get(n.value))
    entries.push(id(firsts.get(n.value).value));

  // A test is any other IRI with a type or a name.
  const tests = new Map();
  for (const t of quads) {
    if (t.subject.termType !== 'NamedNode' || t.subject.equals(manifest)) continue;
    const isName = t.predicate.value === MF + 'name';
    if (!isName && t.predicate.value !== RDF + 'type') continue;
    const key = id(t.subject.value);
    if (!tests.has(key)) tests.set(key, []);
    if (isName) tests.get(key).push(t.object.value);
  }

  for (const d of dups(entries)) bad(`${d} is in mf:entries more than once`);
  for (const e of entries)
    if (!tests.has(e)) bad(`${e} is in mf:entries but is not defined`);
  for (const key of tests.keys())
    if (!entries.includes(key)) bad(`${key} is defined but is not in mf:entries`);
  return {base, entries, tests};
}

// -> {base, entries: ["#id"], tests: Map("#id" -> [name])}
function readJsonld(file, bad) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = [].concat(doc['@context']).map(c => c && c['@base']).find(Boolean);
  const manifests = doc['@graph'].filter(g => g['@type'] === 'mf:Manifest');
  if (manifests.length !== 1)
    throw Error(`expected one mf:Manifest, found ${manifests.length}`);

  const entries = [];
  const tests = new Map();
  manifests[0].entries.forEach((e, i) => {
    const key = e['@id'];
    if (typeof key !== 'string')
      return bad(`entries[${i}] (name ${q(e.name)}) has no @id`);
    entries.push(key);
    if (!tests.has(key)) tests.set(key, []);
    tests.get(key).push(...[].concat(e.name === undefined ? [] : e.name));
  });

  for (const d of dups(entries)) bad(`${d} is in entries more than once`);
  return {base, entries, tests};
}

// -> {entries: ["#name"]}
function readYaml(file, bad) {
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const entries = [];
  (doc.entries || []).forEach((e, i) => {
    if (typeof e.name !== 'string') return bad(`entries[${i}] has no name`);
    entries.push('#' + e.name);
    if ('@id' in e) bad(`#${e.name} also has "@id": ${q(e['@id'])}; its id and name differ in manifest.ttl`);
  });
  for (const d of dups(entries)) bad(`${d} is named more than once`);
  return {entries};
}

// The checks that are the same in either serialization.
function checkNames({tests}, bad) {
  for (const [key, names] of tests) {
    if (!key.startsWith('#'))
      bad(`${key} is not a #fragment of the manifest`);
    else if (names.length === 0)
      bad(`${key} has no name`);
    else if (names.length > 1)
      bad(`${key} has ${names.length} names: ${names.map(q).join(', ')}`);
    else if (names[0] !== key.slice(1))
      bad(`${key} is named ${q(names[0])}`);
  }
  for (const d of dups([...tests.values()].flatMap(names => [...new Set(names)])))
    bad(`the name ${q(d)} is used by more than one test`);
}

function checkDir(dir) {
  const rel = path.relative(ROOT, path.resolve(dir)) || '.';
  let count = 0;
  const reporter = file => msg => {
    console.error(`${path.join(rel, file)}: ${msg}`);
    count++;
  };

  const read = (file, reader) => {
    const bad = reporter(file);
    try {
      const m = reader(path.join(dir, file), bad);
      checkNames(m, bad);
      return m;
    } catch (e) {
      bad(e.code === 'ENOENT' ? 'missing' : e.message);
      return null;
    }
  };
  const ttl = read('manifest.ttl', readTtl);
  const jsonld = read('manifest.jsonld', readJsonld);
  const ld = (() => {
    const bad = reporter('manifest-ld.yaml');
    try { return readYaml(path.join(dir, 'manifest-ld.yaml'), bad); }
    catch (e) { bad(e.code === 'ENOENT' ? 'missing' : e.message); return null; }
  })();

  if (ttl && jsonld) {
    const bad = reporter('manifest.{ttl,jsonld}');
    if (ttl.base !== jsonld.base)
      bad(`ttl is <${ttl.base}> but jsonld @base is ${q(jsonld.base)}`);
    for (const e of ttl.entries)
      if (!jsonld.tests.has(e)) bad(`${e} is in ttl but not in jsonld`);
    for (const e of jsonld.entries)
      if (!ttl.entries.includes(e)) bad(`${e} is in jsonld but not in ttl`);
    if (ttl.entries.length === jsonld.entries.length) {
      const i = ttl.entries.findIndex((e, i) => e !== jsonld.entries[i]);
      if (i !== -1 && jsonld.tests.has(ttl.entries[i]) && ttl.entries.includes(jsonld.entries[i]))
        bad(`entries are ordered differently, starting at [${i}]: ` +
            `ttl has ${ttl.entries[i]}, jsonld has ${jsonld.entries[i]}`);
    }
    // a test without exactly one name has already been reported
    for (const [key, [name, ...more]] of ttl.tests) {
      const other = jsonld.tests.get(key) || [];
      if (!more.length && other.length === 1 && name !== undefined && name !== other[0])
        bad(`${key} is named ${q(name)} in ttl but ${q(other[0])} in jsonld`);
    }
  }

  if (ttl && ld) {
    const bad = reporter('manifest-ld.yaml');
    for (const e of ttl.entries)
      if (!ld.entries.includes(e)) bad(`${e} is in manifest.ttl but not here`);
    for (const e of ld.entries)
      if (!ttl.entries.includes(e)) bad(`${e} is here but not in manifest.ttl`);
    if (ttl.entries.length === ld.entries.length && ttl.entries.every(e => ld.entries.includes(e))) {
      const i = ttl.entries.findIndex((e, i) => e !== ld.entries[i]);
      if (i !== -1) bad(`entries are ordered differently from manifest.ttl, starting at [${i}]: ${ld.entries[i]} vs ${ttl.entries[i]}`);
    }
  }

  if (!count)
    console.error(`${rel}: ${ttl.entries.length} tests, ids and names agree`);
  return count;
}

const dirs = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(ROOT).map(d => path.join(ROOT, d)).filter(d =>
      ['manifest.ttl', 'manifest.jsonld'].some(f => fs.existsSync(path.join(d, f))));

const bad = dirs.reduce((sum, dir) => sum + checkDir(dir), 0);
if (bad) {
  console.error(`\n${bad} problem(s). A test's id and its mf:name must match;`);
  console.error('fix manifest.ttl, then regenerate the others:');
  console.error('  (cd DIR && ../bin/genJSON.js manifest.ttl > manifest.jsonld)');
  console.error('  node bin/manifest-ld-from-legacy.js DIR/manifest.ttl -o DIR/manifest-ld.yaml && npm run manifest-ld');
  process.exit(1);
}
