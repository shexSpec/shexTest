#!/usr/bin/env node

// Regenerate the RDF renderings of ShExR from doc/ShExR.shex.
//
//   bin/mkShExR.js            rewrite doc/ShExR.ttl and doc/ShExR.ntriples
//   bin/mkShExR.js --check    verify all three renderings, write nothing
//
// doc/ShExR.shex is the hand-maintained source: the schema that ShExR
// documents -- RDF renderings of ShEx schemas -- are validated against. The
// other three files in doc/ are the same schema in other syntaxes and had all
// drifted from it at some point (ShExR.ntriples by nine years), so they are
// derived here instead of hand-synced.
//
// ShExC -> ShExJ is the parser; ShExJ -> RDF is plain JSON-LD expansion using
// doc/ShExJ-context.jsonld, since a ShExJ document plus that context *is* an
// ShExR document. That means this also exercises the context, which is itself
// generated from vocab/vocab.csv.
//
// doc/ShExR.json is checked but never rewritten: it is hand-formatted, and
// reformatting it would bury a real change in noise. --check compares it as an
// abstract syntax tree, so formatting is free to differ but content is not.

'use strict';
const fs = require('fs');
const path = require('path');
const N3 = require('n3');
const jsonld = require('jsonld');
const parser = require('@shexjs/parser');

const DOC = path.join(__dirname, '..', 'doc');
const BASE = 'http://www.w3.org/ns/shex';
const PREFIXES = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  sx: 'http://www.w3.org/ns/shex#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

const read = f => fs.readFileSync(path.join(DOC, f), 'utf8');

// Deep key-sorted stringify, so two ASTs compare regardless of key order.
const sorted = o =>
  Array.isArray(o) ? o.map(sorted)
  : (o && typeof o === 'object')
    ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorted(o[k])]))
  : o;
const canon = o => JSON.stringify(sorted(JSON.parse(JSON.stringify(o))), null, 1);

function ntriples(quads) {
  return new Promise((resolve, reject) => {
    const writer = new N3.Writer(null, {format: 'N-Triples'});
    quads.forEach(q => writer.addQuad(q));
    writer.end((e, result) => e ? reject(e) : resolve(result));
  });
}

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

// N3.Writer labels every blank node and spells out rdf:first/rdf:rest, which
// turns this file into 265 list triples nobody can read. The ShExR graph is a
// tree -- every blank node is referenced exactly once -- so nest them as [ ]
// and collapse the lists to ( ), the way the file was written by hand.
function turtle(quads) {
  const bySubject = new Map();   // subject -> [quad]
  const refs = new Map();        // bnode -> times used as an object
  for (const q of quads) {
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, []);
    bySubject.get(q.subject.value).push(q);
    if (q.object.termType === 'BlankNode')
      refs.set(q.object.value, (refs.get(q.object.value) || 0) + 1);
  }

  const iri = v => {
    for (const [p, ns] of Object.entries(PREFIXES))
      if (v.startsWith(ns) && /^[A-Za-z_][\w.-]*$/.test(v.slice(ns.length)))
        return `${p}:${v.slice(ns.length)}`;
    return `<${v}>`;
  };
  const literal = t => {
    const d = t.datatype && t.datatype.value;
    if (d === XSD + 'boolean' || d === XSD + 'integer') return t.value;
    if (t.language) return `${JSON.stringify(t.value)}@${t.language}`;
    if (!d || d === XSD + 'string') return JSON.stringify(t.value);
    return `${JSON.stringify(t.value)}^^${iri(d)}`;
  };

  const listOf = b => {                       // rdf:first/rdf:rest -> [terms] or null
    const items = [];
    let cur = b;
    while (cur !== RDF + 'nil') {
      const qs = bySubject.get(cur);
      if (!qs) return null;
      const first = qs.find(q => q.predicate.value === RDF + 'first');
      const rest = qs.find(q => q.predicate.value === RDF + 'rest');
      if (!first || !rest || qs.length !== 2) return null;
      items.push(first.object);
      if (rest.object.termType === 'NamedNode' && rest.object.value === RDF + 'nil') break;
      if (rest.object.termType !== 'BlankNode') return null;
      cur = rest.object.value;
    }
    return items;
  };

  const term = (t, indent) => {
    if (t.termType === 'Literal') return literal(t);
    if (t.termType === 'NamedNode')
      return t.value === RDF + 'nil' ? '()' : iri(t.value);
    // blank node: inline it if it is used exactly once, else fall back to a label
    if (refs.get(t.value) !== 1 || !bySubject.has(t.value)) return `_:${t.value}`;
    const items = listOf(t.value);
    if (items) return `( ${items.map(i => term(i, indent)).join(' ')} )`;
    return `[ ${predObjs(bySubject.get(t.value), indent + '  ')} ]`;
  };

  const predObjs = (qs, indent) => {
    // rdf:type first, as `a`, then the rest in a stable order
    const ordered = [...qs].sort((x, y) => {
      const rank = q => q.predicate.value === RDF + 'type' ? '' : q.predicate.value;
      return rank(x) < rank(y) ? -1 : rank(x) > rank(y) ? 1 : 0;
    });
    return ordered.map(q => {
      const p = q.predicate.value === RDF + 'type' ? 'a' : iri(q.predicate.value);
      return `${p} ${term(q.object, indent)}`;
    }).join(`;\n${indent}`);
  };

  // Roots are the subjects nothing points at: the anonymous Schema node and
  // the named ShapeDecls. Everything else is reached by nesting. Order by the
  // rendered subject, never by blank node label -- labels are assigned by
  // whichever parser produced the quads, so sorting on them would make this
  // output depend on where the graph came from rather than on what it says.
  const label = s =>
    bySubject.get(s)[0].subject.termType === 'BlankNode' ? '[]' : iri(s);
  const roots = [...bySubject.keys()].filter(s => !refs.get(s))
    .sort((a, b) => label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0);

  const prefixes = Object.entries(PREFIXES)
    .map(([p, ns]) => `PREFIX ${p}: <${ns}>`).join('\n');
  const body = roots.map(s =>
    `${label(s)} ${predObjs(bySubject.get(s), '  ')} .`).join('\n\n');

  return `${prefixes}\n\n${body}\n`;
}

async function build() {
  const shexj = parser.construct(BASE, {}).parse(read('ShExR.shex'));

  const ctx = JSON.parse(read('ShExJ-context.jsonld'))['@context'];
  const doc = Object.assign({'@context': ctx}, JSON.parse(JSON.stringify(shexj)));
  const nquads = await jsonld.toRDF(doc, {format: 'application/n-quads', base: BASE});
  const quads = new N3.Parser({format: 'N-Quads'}).parse(nquads);

  return {
    shexj,
    ttl: turtle(quads),
    ntriples: await ntriples(quads),
  };
}

(async () => {
  const check = process.argv.includes('--check');
  const {shexj, ttl, ntriples} = await build();
  let bad = 0;

  // ShExR.json is compared as an AST -- content must match, formatting need not.
  const json = JSON.parse(read('ShExR.json'));
  delete json['@context'];
  if (canon(json) !== canon(shexj)) {
    console.error('doc/ShExR.json does not match doc/ShExR.shex');
    bad++;
  }

  for (const [file, text] of [['ShExR.ttl', ttl], ['ShExR.ntriples', ntriples]]) {
    const target = path.join(DOC, file);
    if (check) {
      if (fs.readFileSync(target, 'utf8') !== text) {
        console.error(`doc/${file} is not what doc/ShExR.shex generates`);
        bad++;
      }
    } else {
      fs.writeFileSync(target, text);
      console.error(`wrote doc/${file}`);
    }
  }

  if (bad) {
    console.error(`\n${bad} file(s) out of sync with doc/ShExR.shex.`);
    console.error('Run bin/mkShExR.js and commit the result; for ShExR.json,');
    console.error('hand-edit it to match (it is deliberately not regenerated).');
    process.exit(1);
  }
  if (check) console.error('doc/ShExR.{json,ttl,ntriples} all match doc/ShExR.shex');
})().catch(e => { console.error(e.stack || e); process.exit(1); });
