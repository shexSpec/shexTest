#!/usr/bin/env node
/* yaml2ttl - write a suite manifest's legacy Turtle from its YAML-LD.
 *
 *   cd validation && ../bin/yaml2ttl.js manifest-ld.yaml > manifest.ttl
 *
 * manifest-ld.yaml is the text people edit: the manifest in the ShEx manifest
 * vocabulary, the format implementations use for their own examples.  The
 * Turtle -- the SPARQL WG's test-manifest format, with sht: types and an
 * mf:action node per test -- is what implementations of the suite have
 * always read, so it is still written, from the YAML, by putting back what
 * the YAML does without (bin/manifest-terms.js is the table):
 *
 * - the type a test's `status` (or `schemaError`, or neither) stands for;
 * - <#name> and mf:name, both from `name`;
 * - the mf:action node, around the entry's schemaURL, shape, dataURL, node;
 * - mf:status, from `approval`;
 * - the mf:entries collection, in the entries' order;
 * - the @base the suite's manifests have always declared.
 *
 * That this loses nothing is checked, not assumed: the graph of the Turtle
 * written here is the graph of the Turtle the YAML was converted from
 * (shex.js, packages/shex-manifest/test/TestSuiteManifest-test.js).
 *
 * As a module, `toTurtle(doc, dirName)` takes the parsed YAML and the name
 * of the suite directory it is in.
 */
"use strict";

const {PREFIXES, TERMS, typeOf, baseOf, parseAssociation} = require("./manifest-terms.js");

const string = (s) => '"' + String(s).replace(/[\\"\n\r\t]/g, c => ({"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"})[c]) + '"';
const iri = (v) => `<${v}>`;
const asArray = (v) => Array.isArray(v) ? v : [v];

/** a parsed association's node or shape, as Turtle */
const term = (t) => "iri" in t ? iri(t.iri) : "bnode" in t ? t.bnode
      : string(t.value) + (t.language ? "@" + t.language : t.datatype ? "^^" + iri(t.datatype) : "");

function object (value, row) {
  switch (row.kind) {
  case "iri":    return asArray(value).map(iri).join(", ");
  case "term":   return asArray(value).map(iri).join(", ");
  case "names":  return asArray(value).map(n => "sht:" + n).join(" , ");
  case "mfname": return "mf:" + value;
  case "text":   return asArray(value).map(string).join(", ");
  case "number": return String(value);
  default: throw new Error("cannot write a " + row.kind);
  }
}

function toTurtle (doc, dirName) {
  if (!doc || !Array.isArray(doc.entries))
    throw new Error("expected a manifest with `entries`");
  const used = new Set(["rdf", "rdfs", "mf", "sht"]);
  const out = [];
  const blocks = [];
  const ids = [];

  for (const entry of doc.entries) {
    if (typeof entry.name !== "string")
      throw new Error("an entry needs a name: " + JSON.stringify(entry).slice(0, 80));
    const id = entry["@id"] || "#" + entry.name;
    ids.push(id);
    const type = typeOf(entry);
    if (!type)
      throw new Error(`${entry.name}: no legacy type for status ${JSON.stringify(entry.status)} / schemaError ${JSON.stringify(entry.schemaError)}`);
    const lines = [`mf:name ${string(entry.name)}`];
    const action = [];
    let actionAt = -1;
    for (const [key, value] of Object.entries(entry)) {
      if (["@id", "name", "status", "schemaError"].includes(key))
        continue;
      if (key === "queryMap") {
        // the focus and shape a query map says, where node and shape could not
        const {node, shape} = parseAssociation(value);
        if (actionAt === -1) {
          actionAt = lines.length;
          lines.push(null);
        }
        if (shape !== null)
          action.push(`      sht:shape ${term(shape)}`);
        action.push(`      sht:focus ${term(node)}`);
        continue;
      }
      const rows = TERMS.filter(r => r.key === key && r.in !== "ext" && (!r.only || r.only === type.sort));
      if (rows.length !== 1)
        throw new Error(`${entry.name}: no legacy predicate for "${key}"`);
      const row = rows[0];
      used.add(row.legacy.split(":")[0]);
      if (row.kind === "list") {
        const members = value.map(member => {
          const inner = Object.entries(member).map(([k, v]) => {
            const r = TERMS.find(r => r.key === k && r.in === "ext");
            if (!r)
              throw new Error(`${entry.name}: no legacy predicate for "${k}" in ${key}`);
            return `        ${r.legacy} ${object(v, r)}`;
          });
          return "      [\n" + inner.join(" ;\n") + "\n      ]";
        });
        lines.push(`${row.legacy} (\n${members.join("\n")}\n    )`);
      } else if (row.in === "action") {
        if (actionAt === -1) {
          actionAt = lines.length;
          lines.push(null);              // the action node goes where its first member was
        }
        action.push(`      ${row.legacy} ${object(value, row)}`);
      } else {
        lines.push(`${row.legacy} ${object(value, row)}`);
      }
    }
    if (actionAt !== -1)
      lines[actionAt] = "mf:action [\n" + action.join(" ;\n") + "\n    ]";
    blocks.push(`${iri(id)} a ${type.legacy} ;\n    ` + lines.join(" ;\n    ") + "\n    .");
  }

  out.push(`@base ${iri(baseOf(dirName))} .`);
  for (const prefix of Object.keys(PREFIXES))
    if (used.has(prefix))
      out.push(`@prefix ${prefix}: ${iri(PREFIXES[prefix])} .`);
  out.push("");
  out.push("# GENERATED from manifest-ld.yaml by bin/yaml2ttl.js; edit that, not this.");
  out.push("");
  out.push("<> a mf:Manifest ;");
  if ("comment" in doc)
    out.push(`    rdfs:comment ${string(doc.comment)} ;`);
  out.push("    mf:entries (");
  ids.forEach(id => out.push(`        ${iri(id)}`));
  out.push("    ) .");
  out.push("");
  blocks.forEach(b => out.push(b, ""));
  return out.join("\n");
}

module.exports = {toTurtle};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error("usage: yaml2ttl.js manifest-ld.yaml > manifest.ttl");
    process.exit(1);
  }
  const Path = require("path");
  const doc = require("js-yaml").load(require("fs").readFileSync(args[0], "utf8"));
  process.stdout.write(toTurtle(doc, Path.basename(Path.dirname(Path.resolve(args[0])))));
}
