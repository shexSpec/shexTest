#!/usr/bin/env node
/* manifest-ld - write a suite directory's manifest-ld.jsonld and
 * manifest-ld.ttl from its manifest-ld.yaml.
 *
 *   bin/manifest-ld.js                    every directory with a manifest-ld.yaml
 *   bin/manifest-ld.js validation ...     those directories
 *   bin/manifest-ld.js --check [dir ...]  write nothing; exit 1 if a file is not
 *                                         what would be written
 *
 * `manifest-ld` is one resource -- the directory's tests in the ShEx manifest
 * vocabulary -- with three representations:
 *
 *   manifest-ld.yaml    the text to edit, comments and all
 *   manifest-ld.jsonld  the YAML's JSON: the same JSON-LD document, without
 *                       the comments
 *   manifest-ld.ttl     its RDF graph as Turtle: the manifest a blank node,
 *                       its entries a list of blank nodes, each attribute in
 *                       the order the YAML gives it
 *
 * (`manifest`, the original structure, is manifest.ttl and manifest.jsonld:
 * bin/genJSON.js, bin/manifest-ld-to-legacy-ttl.js and bin/manifest-ld-to-legacy-jsonld.js write those.)
 *
 * All three leave references as the YAML wrote them, relative, so each means
 * the same wherever it is served.  The Turtle is written from the YAML
 * through the JSON-LD contexts it stacks -- generated here from vocab/*.csv,
 * which is what w3c/ns publishes at https://www.w3.org/ns/shex-manifest.jsonld
 * and https://www.w3.org/ns/shex-test.jsonld -- and before anything is
 * written it is checked to be the graph a JSON-LD processor reads from the
 * YAML (the same tree; the processor in safe mode, so a key no context
 * defines is an error rather than dropped).  A scope a manifest binds for
 * an extension (validation's `tst:parms`, the Test extension's) is read
 * from a sibling shexSpec/extensions checkout, or fetched from where it is
 * published.
 */
"use strict";

const Fs = require("fs");
const Path = require("path");
const ChildProcess = require("child_process");
const Yaml = require("js-yaml");
const N3 = require("n3");
const jsonld = require("jsonld");

const ROOT = Path.join(__dirname, "..");
const {namedNode, literal} = N3.DataFactory;
const XSD = "http://www.w3.org/2001/XMLSchema#";
const asArray = (v) => Array.isArray(v) ? v : [v];

/** the contexts a manifest-ld stacks, by URL, from the CSVs they are generated from */
const CONTEXTS = Object.fromEntries(Object.entries({
  "https://www.w3.org/ns/shex-manifest.jsonld": "shex-manifest",
  "https://www.w3.org/ns/shex-test.jsonld": "shex-test",
}).map(([url, vocab]) => [url, JSON.parse(ChildProcess.execFileSync(
  process.execPath, [Path.join(ROOT, "vocab", "mk_vocab.js"), "--vocab", vocab, "--format", "context"],
  {encoding: "utf8"}))]));

/** the scope contexts a manifest binds (`p:parms: {"@context": url}` in its
 * @context), by URL: an extension's, published beside its spec at
 * https://shexspec.github.io/extensions/<X>/manifest-context.jsonld.  Read
 * from a sibling shexSpec/extensions checkout when there is one (ahead of
 * publication, or offline), else fetched */
async function loadScopes (contextList) {
  const scopes = {};
  for (const c of asArray(contextList)) {
    if (c === null || typeof c !== "object")
      continue;
    for (const def of Object.values(c)) {
      const url = def !== null && typeof def === "object" && typeof def["@context"] === "string" ? def["@context"] : null;
      if (url === null || url in scopes)
        continue;
      const published = /^https:\/\/shexspec\.github\.io\/extensions\/([^/]+)\/manifest-context\.jsonld$/.exec(url);
      const checkout = published && Path.join(ROOT, "..", "extensions", published[1], "manifest-context.jsonld");
      if (checkout && Fs.existsSync(checkout)) {
        scopes[url] = JSON.parse(Fs.readFileSync(checkout, "utf8"));
      } else {
        const response = await fetch(url);
        if (!response.ok)
          throw Error(`${url}: ${response.status} ${response.statusText}`);
        scopes[url] = await response.json();
      }
    }
  }
  return scopes;
}

/** what a manifest's @context defines: each term's IRI, @type, @container
 * and property-scoped @context, and the prefixes (a term whose IRI ends in
 * a gen-delim).  `term(key, local)` looks `key` up among `local`, the terms
 * in force: the manifest's, or inside a scope's key (`tst:parms`) that
 * scope's over them (`within(def, local)`), the outer names staying
 * visible inside, as in any lexical scope */
function contextOf (contextList, where, scopes) {
  const defs = {};
  for (const c of asArray(contextList)) {
    const ctx = typeof c === "string" ? (CONTEXTS[c] || {})["@context"] : c;
    if (!ctx)
      throw Error(`${where}: a context this script does not know: ${c}`);
    Object.assign(defs, ctx);
  }
  const prefixes = {};
  for (const [k, v] of Object.entries(defs))
    if (typeof v === "string" && /^[a-z][a-z0-9+.-]*:\/\/.*[#/:]$/i.test(v))
      prefixes[k] = v;
  const expand = (s) => {
    const i = s.indexOf(":");
    return i > 0 && s.slice(0, i) in prefixes ? prefixes[s.slice(0, i)] + s.slice(i + 1) : s;
  };
  const term = (key, local = defs) => {
    const d = local[key];
    if (d === undefined)
      return key.includes(":") && key.slice(0, key.indexOf(":")) in prefixes ? {iri: expand(key)} : null;
    if (typeof d === "string")
      return {iri: expand(d)};
    return {iri: expand(d["@id"] || key), type: d["@type"] && d["@type"].startsWith("@") ? d["@type"] : d["@type"] && expand(d["@type"]),
            container: d["@container"], scope: d["@context"]};
  };
  const within = (def, local = defs) => {
    if (def.scope === undefined)
      return local;
    const ctx = typeof def.scope === "string" ? (scopes[def.scope] || {})["@context"] : def.scope["@context"] || def.scope;
    if (!ctx)
      throw Error(`${where}: a scope context this script did not load: ${JSON.stringify(def.scope)}`);
    return Object.assign({}, local, ctx);
  };
  return {term, within, prefixes};
}

/** the YAML's document as Turtle */
function toTurtle (doc, where, scopes) {
  const {term, within, prefixes} = contextOf(doc["@context"], where, scopes);

  // the predicates the document uses, so the Turtle declares just their prefixes
  const predicates = new Set();
  const scan = (v, local) => {
    if (Array.isArray(v))
      return v.forEach(member => scan(member, local));
    if (v === null || typeof v !== "object")
      return;
    for (const [key, value] of Object.entries(v)) {
      if (key === "@context" || key === "@id")
        continue;
      const def = term(key, local);
      if (def === null)
        throw Error(`${where}: "${key}" is defined by no context`);
      predicates.add(def.iri);
      scan(value, within(def, local));
    }
  };
  scan(doc);
  const used = Object.entries(prefixes)
        .filter(([, ns]) => [...predicates].some(iri => iri.startsWith(ns) && !/[#/:]/.test(iri.slice(ns.length))))
        .sort(([a], [b]) => a < b ? -1 : 1);
  const writer = new N3.Writer({prefixes: Object.fromEntries(used)});
  const named = [];                                 // statements of entries that have an @id, written last

  const object = (def, v, local) => {
    if (v !== null && typeof v === "object")
      return node(v, local);
    if (typeof v === "string")
      return def.type === "@id" ? namedNode(v) : def.type ? literal(v, namedNode(def.type)) : literal(v);
    if (typeof v === "number")
      return literal(String(v), namedNode(def.type && def.type !== "@id" ? def.type : XSD + (Number.isInteger(v) ? "integer" : "double")));
    if (typeof v === "boolean")
      return literal(String(v), namedNode(XSD + "boolean"));
    throw Error(`${where}: no RDF for ${JSON.stringify(v)}`);
  };
  const properties = (obj, local) => {
    const out = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key === "@id")
        continue;
      const def = term(key, local);
      const inner = within(def, local);
      const objects = def.container === "@list" ? [writer.list(asArray(value).map(v => object(def, v, inner)))]
            : asArray(value).map(v => object(def, v, inner));
      objects.forEach(o => out.push({predicate: namedNode(def.iri), object: o}));
    }
    return out;
  };
  const node = (obj, local) => {
    if (typeof obj["@id"] !== "string")
      return writer.blank(properties(obj, local));
    const subject = namedNode(obj["@id"]);
    named.push(...properties(obj, local).map(p => [subject, p.predicate, p.object]));
    return subject;
  };

  // the manifest: its own attributes in a blank node, which has the entries
  const top = Object.assign({}, doc);
  delete top["@context"];
  delete top.entries;
  writer.addQuad(writer.blank(properties(top)), namedNode(term("entries").iri), writer.list(doc.entries.map(e => node(e))));
  named.forEach(([s, p, o]) => writer.addQuad(s, p, o));
  let text;
  writer.end((e, r) => { if (e) throw e; text = r; });
  return "# GENERATED from manifest-ld.yaml by bin/manifest-ld.js; edit that, not this.\n\n" + text;
}

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/** a tree-shaped graph, written so that two graphs are isomorphic exactly
 * when they are written the same: from each root (a subject nothing points
 * at), a node as its predicates' sorted objects, a list as an array, a
 * literal as its value, datatype and language.  A manifest is such a tree --
 * the manifest node, its list of entries, theirs of extension results --
 * and checking it this way is linear, where URDNA2015 takes O(n^2) deep
 * iterations to tell the list nodes apart when the entries are blank nodes
 * (nine minutes for validation's 1309).  A blank node reached twice is not
 * a tree, and an error. */
function treeOf (quads) {
  const id = (t) => t.termType + " " + t.value;
  const bySubject = new Map();
  const pointedAt = new Set();
  for (const q of quads) {
    if (!bySubject.has(id(q.subject)))
      bySubject.set(id(q.subject), []);
    bySubject.get(id(q.subject)).push(q);
    if (q.object.termType !== "Literal")
      pointedAt.add(id(q.object));
  }
  const visited = new Set();
  const write = (t) => {
    if (t.termType === "Literal")
      return [t.value, t.datatype.value, t.language || ""];   // jsonld leaves out an empty language
    if (t.termType === "NamedNode" && t.value === RDF + "nil")
      return [];
    const qs = bySubject.get(id(t));
    if (qs === undefined)
      return t.termType === "NamedNode" ? {"@id": t.value} : {};
    if (visited.has(id(t)))
      throw Error(`not a tree: ${t.value} is reached twice`);
    visited.add(id(t));
    const first = qs.find(q => q.predicate.value === RDF + "first");
    const rest = qs.find(q => q.predicate.value === RDF + "rest");
    if (t.termType === "BlankNode" && qs.length === 2 && first && rest)
      return [write(first.object)].concat(write(rest.object));
    const node = t.termType === "NamedNode" ? {"@id": t.value} : {};
    const byPredicate = {};
    for (const q of qs)
      (byPredicate[q.predicate.value] = byPredicate[q.predicate.value] || []).push(JSON.stringify(write(q.object)));
    for (const p of Object.keys(byPredicate).sort())
      node[p] = byPredicate[p].sort();
    return node;
  };
  const roots = [...bySubject.keys()].filter(k => !pointedAt.has(k))
        .map(k => JSON.stringify(write(bySubject.get(k)[0].subject))).sort();
  if (visited.size !== bySubject.size)
    throw Error("not a tree: a cycle no root reaches");
  return roots.join("\n");
}

/** the graph a JSON-LD processor reads from the YAML, and the Turtle's, are one */
async function sameGraph (doc, turtle, dir, scopes) {
  const base = `http://manifest-ld.invalid/${dir}/manifest-ld`;
  const documentLoader = async (url) => {
    const document = CONTEXTS[url] || scopes[url];
    if (document === undefined)
      throw Error(`${dir}: a context this script does not know: ${url}`);
    return {contextUrl: null, documentUrl: url, document};
  };
  // a graph is a set: a value written twice (validation's seeAlso does) is one triple
  const distinct = (quads) => [...new Map(quads.map(q => [JSON.stringify([q.subject.termType, q.subject.value,
    q.predicate.value, q.object.termType, q.object.value, q.object.datatype && q.object.datatype.value,
    q.object.language || ""]), q])).values()];
  const fromYaml = distinct(await jsonld.toRDF(doc, {base, documentLoader, safe: true}));
  const fromTurtle = distinct(new N3.Parser({baseIRI: base}).parse(turtle));
  if (fromYaml.length !== fromTurtle.length || treeOf(fromYaml) !== treeOf(fromTurtle))
    throw Error(`${dir}: manifest-ld.ttl would not be the graph of manifest-ld.yaml`);
  return fromYaml.length;
}

async function main () {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  let dirs = args.filter(a => a !== "--check");
  if (args.some(a => a.startsWith("-") && a !== "--check")) {
    console.error("usage: manifest-ld.js [--check] [dir ...]");
    process.exit(1);
  }
  if (dirs.length === 0)
    dirs = Fs.readdirSync(ROOT).filter(d => Fs.existsSync(Path.join(ROOT, d, "manifest-ld.yaml"))).sort();
  let stale = 0;
  for (const dir of dirs) {
    const name = Path.basename(Path.resolve(ROOT, dir));
    const yamlFile = Path.join(ROOT, name, "manifest-ld.yaml");
    const doc = Yaml.load(Fs.readFileSync(yamlFile, "utf8"));
    const json = JSON.stringify(doc, null, 2) + "\n";
    const scopes = await loadScopes(doc["@context"]);
    const turtle = toTurtle(doc, name, scopes);
    const triples = await sameGraph(doc, turtle, name, scopes);
    for (const [file, text] of [["manifest-ld.jsonld", json], ["manifest-ld.ttl", turtle]]) {
      const target = Path.join(ROOT, name, file);
      const current = Fs.existsSync(target) ? Fs.readFileSync(target, "utf8") : null;
      if (check) {
        if (current !== text) {
          console.error(`${name}/${file} ${current === null ? "is missing" : "is not what manifest-ld.yaml generates"}`);
          ++stale;
        }
      } else if (current !== text) {
        Fs.writeFileSync(target, text);
        console.error(`wrote ${name}/${file}`);
      }
    }
    if (!check)
      console.error(`${name}: ${doc.entries.length} entries, ${triples} triples`);
  }
  process.exit(stale ? 1 : 0);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
