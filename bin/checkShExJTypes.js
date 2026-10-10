#!/usr/bin/env node

// Type-check every ShExJ test schema against the published TypeScript types.
//
//   bin/checkShExJTypes.js    check schemas/*.json against @types/shexj
//
// @types/shexj is one more hand-kept description of ShExJ, next to
// doc/ShExJ.jsg, and it lives in another repository (DefinitelyTyped), so
// nothing there can test it against this corpus. This does: each schemas/X.json
// is wrapped as `const schema: Schema = {…}` and handed to tsc. Wrapping is the
// point -- importing the JSON would widen "type": "Schema" to string and check
// nothing.
//
// A pass means the types accept everything the corpus contains. It cannot mean
// more: cardinalities and terminals ({2,}, IRIREF, INTEGER) are beyond a type
// system, and what no schema exercises is not tested. MUST_REJECT below covers
// a little of the other direction.
//
// This replaces `test-ts`, which sat in `npm test` from 2022 to 2026 calling a
// bin/makeTsTests.sh that was never committed.
//
// The gate. When ShExJ gains something, the schemas that use it are rejected
// by the published types until a DefinitelyTyped PR merges and publishes, a
// day or two later, and nothing can notify this repo when it does. Rather than
// leave CI red for that long, list those schemas in AHEAD with the newest
// @types/shexj that does NOT accept them. They are then expected to fail for
// as long as that version or an older one is installed, and required to pass
// as soon as a newer one is -- which first happens in Dependabot's PR bumping
// @types/shexj, so that PR merges itself if the new types are right and goes
// red if they are not.
//
// exit 0 if every schema does what is expected of it, 1 otherwise.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

// Schemas that use something the published types do not have yet:
//   stem of schemas/<stem>.json -> newest @types/shexj known not to accept it
// The failure message for a new schema prints the line to paste here. Add the
// DefinitelyTyped PR as a comment. An entry does nothing once a newer version
// is installed; this script says when one can be deleted.
const AHEAD = {
  // 'newFeature': '2.1.7',  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/NNNNN
};

// Documents the types must reject, each wrong in exactly one way. The first
// two were accepted by ShExJ.jsg, and so disagreed with the types, until
// 2026-10; they also show that tsc is really checking something.
const MUST_REJECT = {
  'a Shape with "abstract" (it belongs to ShapeDecl)': shapeExpr(
    {type: 'Shape', abstract: true}),
  'an IriStemRange without "exclusions" (that is an IriStem)': shapeExpr(
    {type: 'NodeConstraint', values: [{type: 'IriStemRange', stem: 'http://a.example/'}]}),
  'a ShapeDecl without "id"': {
    type: 'Schema', shapes: [{type: 'ShapeDecl', shapeExpr: {type: 'Shape'}}]},
};

function shapeExpr(shapeExpr) {
  return {type: 'Schema', shapes: [{type: 'ShapeDecl', id: 'http://a.example/S', shapeExpr}]};
}

const ROOT = path.join(__dirname, '..');
const SCHEMAS = path.join(ROOT, 'schemas');
const TYPES = path.join(ROOT, 'node_modules', '@types', 'shexj');
const TSC = path.join(ROOT, 'node_modules', '.bin', 'tsc');
const NOT_SCHEMAS = ['coverage.json', 'representationTests.json'];

const cmp = (a, b) => {
  const [x, y] = [a, b].map(v => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

// -> Map(file name without .ts -> first error tsc reported in it)
function typeCheck(sources) {
  // Outside the checkout, so a crash leaves nothing behind for git to see.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'shexj-types-'));
  try {
    for (const [name, json] of sources)
      // No newline before the JSON, so tsc's line numbers are the file's.
      fs.writeFileSync(path.join(dir, name + '.ts'),
        `import type {Schema} from "shexj"; export const schema: Schema = ${json.trimEnd()};\n`);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, module: 'node16', types: [],
        paths: {shexj: [path.join(TYPES, 'index.d.ts')]},
      },
      include: ['*.ts'],
    }));

    const run = spawnSync(TSC, ['-p', dir, '--pretty', 'false'], {cwd: dir, encoding: 'utf8'});
    if (run.error) throw run.error;
    const errors = new Map();
    let stray = '';
    for (const line of (run.stdout + run.stderr).split('\n')) {
      const m = line.match(/^(?:\S*\/)?([sr]\d+)\.ts\((\d+),\d+\): error TS\d+: (.*)$/);
      if (m) { if (!errors.has(m[1])) errors.set(m[1], {line: +m[2], text: m[3]}); }
      else if (/^\S/.test(line)) stray += line + '\n';  // continuation lines are indented
    }
    // Anything tsc said that is not about one of our files is tsc itself failing.
    if (stray || (run.status !== 0 && !errors.size))
      throw Error(`tsc exited ${run.status}:\n${stray || '(no output)'}`);
    return errors;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

function main() {
  if (!fs.existsSync(TSC) || !fs.existsSync(TYPES))
    throw Error('typescript and @types/shexj are not installed; run `npm ci`');
  const installed = require(path.join(TYPES, 'package.json')).version;
  const types = `@types/shexj ${installed}`;

  const stems = fs.readdirSync(SCHEMAS)
    .filter(f => f.endsWith('.json') && !NOT_SCHEMAS.includes(f))
    .map(f => f.slice(0, -'.json'.length)).sort();
  const rejects = Object.keys(MUST_REJECT);

  const errors = typeCheck([
    ...stems.map((stem, i) => ['s' + i, fs.readFileSync(path.join(SCHEMAS, stem + '.json'), 'utf8')]),
    ...rejects.map((what, i) => ['r' + i, JSON.stringify(MUST_REJECT[what], null, 2)]),
  ]);

  const problems = [], paste = [], waiting = [], spent = [];
  stems.forEach((stem, i) => {
    const error = errors.get('s' + i);
    const file = `schemas/${stem}.json`;
    const gate = AHEAD[stem];
    if (gate !== undefined && cmp(installed, gate) <= 0) {
      if (error) waiting.push(stem);
      else problems.push(`${file}: AHEAD says ${gate} does not accept this, but ${types} does; delete the entry`);
    } else if (error) {
      problems.push(gate === undefined
        ? `${file}:${error.line}: not accepted by ${types}: ${error.text}`
        : `${file}:${error.line}: AHEAD expected a release after ${gate} to accept this, but ${types} does not: ${error.text}`);
      paste.push(`  '${stem}': '${installed}',`);
    } else if (gate !== undefined) {
      spent.push(stem);
    }
  });
  rejects.forEach((what, i) => {
    if (!errors.has('r' + i))
      problems.push(`${types} accepts ${what}; it and doc/ShExJ.jsg now disagree`);
  });
  for (const [stem, gate] of Object.entries(AHEAD)) {
    if (!stems.includes(stem)) problems.push(`AHEAD lists '${stem}', but there is no schemas/${stem}.json`);
    if (!/^\d+\.\d+\.\d+$/.test(gate)) problems.push(`AHEAD['${stem}'] is '${gate}', not a version like '${installed}'`);
  }

  if (waiting.length)
    console.error(`waiting on a release of @types/shexj that accepts: ${waiting.join(', ')}`);
  if (spent.length)
    console.error(`AHEAD entries that ${types} has caught up with and can be deleted: ${spent.join(', ')}`);
  if (!problems.length) {
    console.error(`schemas: ${stems.length - waiting.length} of ${stems.length} type-check against ${types}` +
      (waiting.length ? `; ${waiting.length} expected not to` : ''));
    return 0;
  }

  const SHOW = 20;
  problems.slice(0, SHOW).forEach(p => console.error(p));
  if (problems.length > SHOW) console.error(`… and ${problems.length - SHOW} more`);
  console.error(`\n${problems.length} problem(s).`);
  if (paste.length) {
    console.error('If these schemas are right and the types are behind, change the types in');
    console.error('DefinitelyTyped (types/shexj) and, until that is published, add to AHEAD in');
    console.error('bin/checkShExJTypes.js:');
    paste.forEach(p => console.error(p));
  }
  console.error('See .claude/skills/shextest-shexj-types/SKILL.md.');
  return 1;
}

try {
  process.exit(main());
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
