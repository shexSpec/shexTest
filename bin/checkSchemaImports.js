#!/usr/bin/env node

/* checkSchemaImports - every schemas/*.shex IMPORT target should have its
 * own RepresentationTest entry in schemas/manifest.ttl, so that any
 * implementation's shex/json/ttl round-trip tests exercise it. Without
 * that entry, nothing ever parses (or cross-checks) the imported file's
 * json/ttl siblings, and they can silently drift from the .shex (this is
 * exactly how start2RefS2.json/.ttl went stale: it was only ever reached
 * by resolving IMPORT statements, which assume ShExC and never touch the
 * other representations).
 *
 * A target that already has a commented-out draft entry in manifest.ttl
 * (`# <#stem> a sht:RepresentationTest ...`, typically left at
 * mf:Proposed) is reported separately as KNOWN/DEFERRED rather than
 * MISSING: someone already found it and it needs real attention (e.g. the
 * schema is a fragment whose valueExpr references a shape declared in
 * another, unimported schema -- ShExR.shex has no production for a bare,
 * unresolved external shapeExpr reference), not a fresh "nobody noticed"
 * gap.  Approving (or removing) that comment naturally moves the stem
 * out of this list.
 *
 * install and run (from schemas/, or pass the dir as argv[2]):
 *   ../bin/checkSchemaImports.js
 * exit 0 if nothing is newly missing (deferred entries don't fail the
 * check); exit 1 if any import target has no manifest entry at all, so
 * this is safe to wire into `npm test` / CI.
 */

var fs = require('fs');
var path = require('path');

var schemasDir = process.argv[2] || '.';
var manifestTtl = fs.readFileSync(path.join(schemasDir, 'manifest.ttl'), 'utf8');
var manifest = JSON.parse(fs.readFileSync(path.join(schemasDir, 'manifest.jsonld'), 'utf8'));
var entries = manifest['@graph'][0].entries;

// stems with an active (uncommented) manifest entry
var covered = {};
entries.forEach(function (e) {
  ['shex', 'json', 'ttl'].forEach(function (k) {
    if (e[k]) covered[path.basename(e[k], path.extname(e[k]))] = true;
  });
});

// stems with a commented-out draft entry, e.g. "# <#foo> a sht:RepresentationTest"
var deferred = {};
var draftRe = /^#\s*<#([^>]+)>\s+a\s+sht:RepresentationTest/gm;
var m;
while ((m = draftRe.exec(manifestTtl))) {
  deferred[m[1]] = true;
}

var allShex = fs.readdirSync(schemasDir).filter(function (f) { return f.slice(-5) === '.shex'; });
var importRe = /^\s*IMPORT\s*<([^>]*)>/gm;

// target stem -> Set-like object of importer stems
var missing = {};
var deferredHits = {};
var brokenRefs = {};

allShex.forEach(function (file) {
  var stem = path.basename(file, '.shex');
  var text = fs.readFileSync(path.join(schemasDir, file), 'utf8');
  var im;
  importRe.lastIndex = 0;
  while ((im = importRe.exec(text))) {
    // import targets are bare relative IRIs like <start2RefS2>; the last
    // path segment is the stem, matching how the parser resolves them
    // against the schema's base
    var target = im[1].split('/').pop();
    if (!fs.existsSync(path.join(schemasDir, target + '.shex'))) {
      (brokenRefs[target] = brokenRefs[target] || []).push(stem);
    } else if (covered[target]) {
      // fine
    } else if (deferred[target]) {
      (deferredHits[target] = deferredHits[target] || []).push(stem);
    } else {
      (missing[target] = missing[target] || []).push(stem);
    }
  }
});

function report (title, map) {
  var keys = Object.keys(map);
  console.log(title + (keys.length ? '' : ' (none)'));
  keys.forEach(function (target) {
    console.log('  ' + target + '  imported by: ' + map[target].join(', '));
  });
}

report('MISSING manifest entry (needs one):', missing);
report('\nKNOWN/DEFERRED (commented draft entry already in manifest.ttl):', deferredHits);
report('\nBROKEN reference (no such .shex file on disk):', brokenRefs);

var failed = Object.keys(missing).length > 0 || Object.keys(brokenRefs).length > 0;
process.exit(failed ? 1 : 0);
