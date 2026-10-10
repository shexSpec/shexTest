#!/usr/bin/env node
/* manifest-ld-to-legacy-jsonld - write the manifest.jsonld that bin/genJSON.js writes
 * from the legacy Turtle, from manifest-ld.yaml instead.
 *
 *   cd validation && ../bin/manifest-ld-to-legacy-jsonld.js manifest-ld.yaml > manifest.jsonld
 *
 * manifest.jsonld is the legacy manifest as JSON: each test with its @id,
 * its sht: @type and its inputs under `action`.  Consumers that have not
 * moved to manifest-ld read it, so it is still written -- from the YAML,
 * putting back what the YAML does without (bin/manifest-ld-terms.js), in
 * genJSON's own spelling, byte for byte: each validation test's keys in
 * genJSON's order with an (often empty) extensionResults; traits sorted; a
 * reference within the manifest's directory by its name there, a schema
 * always from the suite's root; a literal focus with its datatype spelled
 * out.  What genJSON never copied (wasDerivedFrom, seeAlso, a schema
 * test's comment) is not copied here either: it is in the YAML.
 *
 * As a module, `project(doc, dirName)` takes the parsed YAML and the name
 * of the suite directory it is in.
 */
"use strict";

const {typeOf, baseOf, withShExC, printsToLegacy, parseAssociation} = require("./manifest-ld-terms.js");

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

function project (doc, dirName) {
  const base = baseOf(dirName);
  const dirPath = base.replace(/manifest$/, "");
  const basePath = dirPath.replace(/[^/]*\/$/, "");
  const abs = v => new URL(v, base).href;
  /** genJSON's spellings: a reference within the manifest's directory by its
   * name there, another within the suite as ../dir/name, anything else whole */
  const rel = v => {
    if (typeof v !== "string" || v.startsWith("_:"))
      return v;
    const a = abs(v);
    return a.startsWith(dirPath) ? a.slice(dirPath.length) : a.startsWith(basePath) ? "../" + a.slice(basePath.length) : a;
  };
  /** ...except a schema (or its semActs, its externs), always from the suite's root */
  const fromRoot = v => "../" + abs(v).slice(basePath.length);
  /** a parsed association's node or shape, in genJSON's spelling */
  const term = t => "iri" in t ? rel(t.iri) : "bnode" in t ? t.bnode
        : Object.assign({"@value": t.value}, t.language ? {"@language": t.language} : {}, {"@type": t.datatype || XSD_STRING});
  const set = (target, key, source, from, convert = rel) => {
    if (from in source)
      target[key] = convert(source[from]);
  };
  const asIs = v => v;
  const sorted = t => t.slice().sort();
  const status = v => "mf:" + v;
  return {
    "@context": [{"@base": base}, "../context.jsonld"],
    "@graph": [{
      "@id": "",
      "@type": "mf:Manifest",
      "rdfs:comment": doc.comment,
      entries: doc.entries.map(e => {
        const type = typeOf(e);
        const out = {"@id": e["@id"] || "#" + e.name, "@type": type.legacy};
        if (type.sort === "schema") {
          set(out, "name", e, "name", asIs);
          set(out, "trait", e, "trait", sorted);
          set(out, "status", e, "approval", status);
          set(out, "shex", e, "shexcURL");
          set(out, "json", e, "shexjURL");
          set(out, "ttl", e, "shexrURL");
          for (const k of ["startRow", "startColumn", "endRow", "endColumn"])
            set(out, k, e, k, asIs);
          return out;
        }
        out.action = {};
        out.extensionResults = [];
        set(out, "name", e, "name", asIs);
        set(out, "trait", e, "trait", sorted);
        set(out, "comment", e, "comment", asIs);
        set(out, "status", e, "approval", status);
        set(out.action, "schema", e, "schemaURL", v => fromRoot(withShExC(v)));   // the YAML's schemaURL is negotiable: no .shex
        const said = "queryMap" in e ? parseAssociation(e.queryMap) : null;
        if (said === null)
          set(out.action, "shape", e, "shape");
        else if (said.shape !== null)
          out.action.shape = term(said.shape);
        set(out.action, "data", e, "dataURL");
        set(out.action, "map", e, "queryMapURL");
        if (said === null)
          set(out.action, "focus", e, "node");
        else
          out.action.focus = term(said.node);
        set(out.action, "semActs", e, "semActsURL", fromRoot);
        set(out.action, "shapeExterns", e, "shapeExternsURL", fromRoot);
        set(out, "result", e, "resultURL");
        if ("tst:parms" in e)   // the Test extension's scope, as the legacy results
          out.extensionResults = printsToLegacy(e["tst:parms"], e.name);
        return out;
      }),
    }],
  };
}

module.exports = {project};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error("usage: manifest-ld-to-legacy-jsonld.js manifest-ld.yaml > manifest.jsonld");
    process.exit(1);
  }
  const Path = require("path");
  const doc = require("js-yaml").load(require("fs").readFileSync(args[0], "utf8"));
  console.log(JSON.stringify(project(doc, Path.basename(Path.dirname(Path.resolve(args[0])))), null, "  ") + "\n");
}
