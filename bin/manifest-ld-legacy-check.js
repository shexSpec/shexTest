#!/usr/bin/env node
/* manifest-ld-legacy-check - is each suite directory's manifest-ld.yaml what its
 * manifest.ttl says, and are the legacy files derivable from it?
 *
 *   bin/manifest-ld-legacy-check.js                 every directory with a manifest-ld.yaml
 *   bin/manifest-ld-legacy-check.js validation ...  those directories
 *
 * The hand-written manifest.ttl is still the source: manifest-ld.yaml is
 * written from it by bin/manifest-ld-from-legacy.js, and manifest.jsonld by
 * bin/genJSON.js.  For each directory this checks that
 *
 * - the YAML says what it says without the legacy expression: it stacks
 *   the two W3C contexts and binds nothing else but the prefix of a key
 *   carried as the Turtle wrote it (negativeStructure's mf:comment) or an
 *   extension's scope (SCOPES in bin/manifest-ld-terms.js); no entry has a
 *   type, an action node or an mf: key; every entry is named, no name
 *   twice; a status is conformant or nonconformant, a schemaError syntax
 *   or structure;
 * - the YAML is what bin/manifest-ld-from-legacy.js writes from the Turtle, and carries
 *   every comment line of the Turtle;
 * - bin/manifest-ld-to-legacy-ttl.js writes from the YAML the graph the Turtle is (their
 *   canonical N-Quads are equal), and bin/manifest-ld-to-legacy-jsonld.js writes the
 *   committed manifest.jsonld byte for byte, so whoever reads either
 *   legacy file runs the tests the YAML lists, in its order;
 * - read as RDF (manifest-ld.ttl, the YAML's graph, which bin/manifest-ld.js
 *   --check keeps current) it says nothing in the suite's old namespace,
 *   https://shexspec.github.io/shexTest/ns#, and every predicate is one of
 *   the two W3C vocabularies', the ShEx vocabulary's, rdfs', prov's, rdf's,
 *   an extension scope's, or mf's, for the carried comments.
 *
 * `npm run manifest-ld-legacy-check`, in `npm test` and CI.  That shex.js reads these
 * manifests as it reads its own examples is checked there
 * (packages/shex-manifest/test/TestSuiteManifest-test.js).
 */
"use strict";

const Fs = require("fs");
const Path = require("path");
const Url = require("url");
const ChildProcess = require("child_process");
const Yaml = require("js-yaml");
const N3 = require("n3");
const jsonld = require("jsonld");
const {PREFIXES, typeOf, baseOf, CONTEXTS, SCOPES} = require("./manifest-ld-terms.js");
const {toTurtle} = require("./manifest-ld-to-legacy-ttl.js");
const {project} = require("./manifest-ld-to-legacy-jsonld.js");

const ROOT = Path.join(__dirname, "..");
const OLD_NAMESPACE = "https://shexspec.github.io/shexTest/ns#";
const NAMESPACES = [
  "http://www.w3.org/ns/shex-manifest#", "http://www.w3.org/ns/shex-test#", "http://www.w3.org/ns/shex#",
  PREFIXES.rdfs, PREFIXES.prov, PREFIXES.rdf, PREFIXES.mf,
].concat(Object.values(SCOPES).map(s => s.namespace));

/** a Turtle document's graph as canonical N-Quads */
async function canonical (turtle, base) {
  const writer = new N3.Writer({format: "N-Quads"});
  writer.addQuads(new N3.Parser({baseIRI: base}).parse(turtle));
  const nquads = await new Promise((resolve, reject) => writer.end((e, r) => e ? reject(e) : resolve(r)));
  return jsonld.canonize(nquads, {algorithm: "URDNA2015", inputFormat: "application/n-quads"});
}

/** the checks, in order; each throws with what is wrong */
const CHECKS = {
  "says what it says without the legacy expression" ({doc}) {
    const context = doc["@context"];
    if (!Array.isArray(context) || JSON.stringify(context.slice(0, 2)) !== JSON.stringify(CONTEXTS))
      throw Error(`the @context is expected to start with ${CONTEXTS.join(" then ")}`);
    for (const binding of context.slice(2)) {
      if (binding === null || typeof binding !== "object")
        throw Error(`the @context stacks ${JSON.stringify(binding)}: only the two vocabularies are stacked`);
      for (const [key, value] of Object.entries(binding)) {
        const scope = /^([^:]+):parms$/.exec(key);
        const ok = scope ? scope[1] in SCOPES && JSON.stringify(value) === JSON.stringify({"@context": SCOPES[scope[1]].context})
              : key in SCOPES ? value === SCOPES[key].namespace
              : key in PREFIXES && value === PREFIXES[key];
        if (!ok)
          throw Error(`the @context binds ${key}: ${JSON.stringify(value)}, neither the prefix of a carried key nor an extension's scope`);
      }
    }
    if (!Array.isArray(doc.entries))
      throw Error("no entries list");
    const names = new Set();
    doc.entries.forEach((entry, i) => {
      const where = `entry ${i}` + (typeof entry.name === "string" ? ` (${entry.name})` : "");
      for (const key of ["@type", "action", "mf:name", "mf:action", "mf:status"])
        if (key in entry)
          throw Error(`${where} has ${key}: the legacy expression`);
      if (typeof entry.name !== "string")
        throw Error(`${where} has no name`);
      if (names.has(entry.name))
        throw Error(`${where}: the name is used twice`);
      names.add(entry.name);
      if (!typeOf(entry))
        throw Error(`${where}: status ${JSON.stringify(entry.status)} / schemaError ${JSON.stringify(entry.schemaError)} is no kind of test`);
    });
  },

  "is what bin/manifest-ld-from-legacy.js writes from manifest.ttl" ({dir, yamlText}) {
    const written = ChildProcess.execFileSync(process.execPath, [Path.join(__dirname, "manifest-ld-from-legacy.js"), Path.join(dir, "manifest.ttl")],
                                              {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    if (written !== yamlText)
      throw Error("not what bin/manifest-ld-from-legacy.js writes from manifest.ttl: regenerate it");
  },

  "carries every comment line of manifest.ttl" ({ttl, yamlText}) {
    const comments = ttl.split("\n").map(l => /^\s*(#.*?)\s*$/.exec(l)).filter(Boolean).map(m => m[1]);
    const yamlLines = new Set(yamlText.split("\n").map(l => l.trim()));
    // the one comment that changes: an editor's mode line, which said N3
    const carried = c => yamlLines.has(c) || yamlLines.has(c.replace(/(-\*-.*\bmode:\s*)n3\b/, "$1yaml"));
    const lost = comments.filter(c => !carried(c));
    if (lost.length)
      throw Error(`${lost.length} comment line(s) of the Turtle are not in the YAML, the first ${JSON.stringify(lost[0])}`);
  },

  async "generates manifest.ttl's graph (bin/manifest-ld-to-legacy-ttl.js)" ({name, doc, ttl}) {
    const [fromYaml, fromTurtle] = await Promise.all([toTurtle(doc, name), ttl].map(text => canonical(text, baseOf(name))));
    if (fromYaml !== fromTurtle) {
      const a = fromYaml.split("\n").length, b = fromTurtle.split("\n").length;
      throw Error(a !== b ? `${a} triples from the YAML, ${b} in manifest.ttl` : "the same number of triples, a different graph");
    }
  },

  "generates manifest.jsonld byte for byte (bin/manifest-ld-to-legacy-jsonld.js)" ({dir, name, doc}) {
    const derived = JSON.stringify(project(doc, name), null, "  ") + "\n\n";   // as the script prints it
    const committed = Fs.readFileSync(Path.join(dir, "manifest.jsonld"), "utf8");
    if (derived !== committed)
      throw Error("manifest.jsonld is not what bin/manifest-ld-to-legacy-jsonld.js writes from the YAML"
                  + (derived.trim() === committed.trim() ? " (only the trailing whitespace differs)" : ""));
  },

  "says nothing in the suite's old namespace; its predicates are the vocabularies'" ({dir}) {
    const base = Url.pathToFileURL(Path.join(dir, "manifest-ld")).href;
    const quads = new N3.Parser({baseIRI: base}).parse(Fs.readFileSync(Path.join(dir, "manifest-ld.ttl"), "utf8"));
    const old = quads.flatMap(q => [q.predicate, q.object]).find(t => t.termType === "NamedNode" && t.value.startsWith(OLD_NAMESPACE));
    if (old)
      throw Error(`${old.value} is in the suite's old namespace`);
    const stranger = quads.map(q => q.predicate.value).find(p => !NAMESPACES.includes(p.replace(/[^#/]*$/, "")));
    if (stranger)
      throw Error(`the predicate ${stranger} is in no vocabulary a manifest stacks`);
  },
};

async function main () {
  const args = process.argv.slice(2);
  if (args.some(a => a.startsWith("-"))) {
    console.error("usage: manifest-ld-legacy-check.js [dir ...]");
    process.exit(1);
  }
  const dirs = args.length ? args : Fs.readdirSync(ROOT).filter(d => Fs.existsSync(Path.join(ROOT, d, "manifest-ld.yaml"))).sort();
  let failures = 0;
  for (const d of dirs) {
    const name = Path.basename(Path.resolve(ROOT, d));
    const dir = Path.join(ROOT, name);
    const yamlText = Fs.readFileSync(Path.join(dir, "manifest-ld.yaml"), "utf8");
    const subject = {dir, name, yamlText, ttl: Fs.readFileSync(Path.join(dir, "manifest.ttl"), "utf8"), doc: Yaml.load(yamlText)};
    const wrong = [];
    for (const [check, run] of Object.entries(CHECKS)) {
      try {
        await run(subject);
      } catch (e) {
        wrong.push(`${check}: ${e.message}`);
      }
    }
    failures += wrong.length;
    console.log(wrong.length ? `${name}: ${wrong.length} of ${Object.keys(CHECKS).length} checks fail\n  ` + wrong.join("\n  ")
                : `${name}: ${subject.doc.entries.length} entries, ${Object.keys(CHECKS).length} checks pass`);
  }
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
