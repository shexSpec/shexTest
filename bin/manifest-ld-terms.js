/* manifest-ld-terms - the correspondence between this suite's YAML-LD
 * manifests and the legacy Turtle.
 *
 * The YAML-LD manifests (manifest-ld.yaml in each suite directory) are written
 * in the ShEx manifest vocabulary (https://www.w3.org/ns/shex-manifest, the
 * one implementations' own example manifests use) and the ShEx test
 * vocabulary (https://www.w3.org/ns/shex-test: what a conformance test
 * says beyond an entry of the first; vocab/test-vocab.csv).  A key written
 * as a compact IRI (mf:comment, carried as the Turtle had it) has its
 * prefix bound in the manifest's own @context; a scope's key (tst:parms,
 * the Test extension's, SCOPES below) has its prefix and its context bound
 * there, as implementations' examples bind an extension's.  The legacy
 * manifest.ttl is the
 * SPARQL WG's test-manifest format: mf:Manifest and mf:entries, each test
 * typed sht:ValidationTest, sht:ValidationFailure, ... with its inputs in
 * an mf:action node.
 *
 * bin/manifest-ld-from-legacy.js reads this table left to right (to write the YAML from
 * the Turtle, once, with its comments); bin/manifest-ld-to-legacy-ttl.js and
 * bin/manifest-ld-to-legacy-jsonld.js read it right to left (to write the legacy files from
 * the YAML, from now on).
 *
 * What a row says: `key` in an entry is `legacy` in the Turtle, on the test
 * itself (`in: "test"`) or in its mf:action node (`"action"`).  `kind` is
 * how the value is written:
 *   iri     an IRI reference, as written (relative stays relative)
 *   negotiable
 *           a reference to the schema without its representation's
 *           extension: the Turtle's <../schemas/1dot.shex> is written
 *           ../schemas/1dot, so that a server can negotiate the
 *           representation and a reader can ask for the one it wants
 *           (shex.js tries .shex, .json and .ttl, in that order).  The
 *           suite's schemas have always been ShExC files, so the legacy
 *           writers put the .shex back (withoutExtension / withShExC, below)
 *   term    an IRI, a blank node ("_:x"), or a literal ({"@value", "@type"})
 *   names   sht: names without their namespace, as a list
 *   mfname  an mf: name without its namespace
 *   text    a string
 *   number  an integer
 *   prints  the Test extension's scope, `tst:parms: {prints: [...]}`: each
 *           member a line one of the extension's print(...) actions emits,
 *           in order -- a string when the action was dispatched on the
 *           extension's own IRI, else {extension, line} -- where the
 *           Turtle has a collection of [mf:extension <iri>; mf:prints "..."]
 *           (TEST_EXTENSION, SCOPES, printsFromLegacy and printsToLegacy)
 * A validation test's node and shape are IRIs.  A focus node that is a
 * blank node or a literal (or a shape that is a blank node) cannot be: read
 * as JSON-LD, a blank node's label is lost and a literal is not a
 * reference.  Such a test says the same thing as a query map, in ShapeMap
 * syntax, which is text: `queryMap: "_:abcd@<http://a.example/S1>"`.
 * parseAssociation / writeAssociation go between that and the Turtle's
 * sht:focus and sht:shape.
 * Several values of one predicate are a list.  A reference to another test
 * is written as the Turtle wrote it, "#name": an entry is named, and
 * <manifest>#<name> is the IRI the generated Turtle gives it.
 * A schema test names each representation of its schema outright --
 * shexcURL, shexjURL, shexrURL -- since the representations are what it
 * tests; only a validation test's schema is negotiable.
 */
"use strict";

const PREFIXES = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  mf: "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#",
  sht: "http://www.w3.org/ns/shacl/test-suite#",
  sx: "https://shexspec.github.io/shexTest/ns#",
  prov: "http://www.w3.org/ns/prov#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

const TERMS = [
  {key: "trait",            legacy: "sht:trait",           in: "test",   kind: "names"},
  {key: "comment",          legacy: "rdfs:comment",        in: "test",   kind: "text"},
  {key: "mf:comment",       legacy: "mf:comment",          in: "test",   kind: "text"},
  {key: "approval",         legacy: "mf:status",           in: "test",   kind: "mfname"},
  {key: "schemaURL",        legacy: "sht:schema",          in: "action", kind: "negotiable"},
  {key: "shape",            legacy: "sht:shape",           in: "action", kind: "term"},
  {key: "dataURL",          legacy: "sht:data",            in: "action", kind: "iri"},
  {key: "node",             legacy: "sht:focus",           in: "action", kind: "term"},
  {key: "queryMapURL",      legacy: "sht:map",             in: "action", kind: "iri"},
  {key: "semActsURL",       legacy: "sht:semActs",         in: "action", kind: "iri"},
  {key: "shapeExternsURL",  legacy: "sht:shapeExterns",    in: "action", kind: "iri"},
  {key: "resultURL",        legacy: "mf:result",           in: "test",   kind: "iri"},
  {key: "tst:parms",        legacy: "mf:extensionResults", in: "test",   kind: "prints"},
  {key: "wasDerivedFrom",   legacy: "prov:wasDerivedFrom", in: "test",   kind: "iri"},
  {key: "seeAlso",          legacy: "rdfs:seeAlso",        in: "test",   kind: "iri"},
  {key: "sameSemanticsAs",  legacy: "mf:sameSemanticsAs",  in: "test",   kind: "iri"},
  {key: "shexcURL",         legacy: "sx:shex",             in: "test",   kind: "iri"},
  {key: "shexjURL",         legacy: "sx:json",             in: "test",   kind: "iri"},
  {key: "shexrURL",         legacy: "sx:ttl",              in: "test",   kind: "iri"},
  {key: "startRow",         legacy: "mf:startRow",         in: "test",   kind: "number"},
  {key: "startColumn",      legacy: "mf:startColumn",      in: "test",   kind: "number"},
  {key: "endRow",           legacy: "mf:endRow",           in: "test",   kind: "number"},
  {key: "endColumn",        legacy: "mf:endColumn",        in: "test",   kind: "number"},
];

/** the legacy type of a test, and what says it in the YAML: a validation
 * test's expected status; a schema test's expected rejection, or none */
const TYPES = [
  {legacy: "sht:ValidationTest",     sort: "validation", says: {status: "conformant"}},
  {legacy: "sht:ValidationFailure",  sort: "validation", says: {status: "nonconformant"}},
  {legacy: "sht:NegativeSyntax",     sort: "schema",     says: {schemaError: "syntax"}},
  {legacy: "sht:NegativeStructure",  sort: "schema",     says: {schemaError: "structure"}},
  {legacy: "sht:RepresentationTest", sort: "schema",     says: {}},
];

/** an entry's legacy type */
function typeOf (entry) {
  if ("status" in entry)
    return TYPES.find(t => t.says.status === entry.status);
  if ("schemaError" in entry)
    return TYPES.find(t => t.says.schemaError === entry.schemaError);
  return TYPES.find(t => t.legacy === "sht:RepresentationTest");
}

/** the suite's conventional base: where genJSON.js has always said a
 * manifest lives, whatever checkout or branch it was read from */
const baseOf = (dirName) => `https://raw.githubusercontent.com/shexSpec/shexTest/master/${dirName}/manifest`;

/** the YAML's two contexts: the manifest vocabulary, then the test vocabulary */
const CONTEXTS = ["https://www.w3.org/ns/shex-manifest.jsonld", "https://www.w3.org/ns/shex-test.jsonld"];

/** a validation test's schema is named without its representation's
 * extension (kind `negotiable`, above).  The suite's schemas have always
 * been ShExC files: the Turtle's .shex comes off in the YAML... */
const SHEXC = ".shex";
function withoutExtension (iri) {
  if (!iri.endsWith(SHEXC))
    throw new Error(`a validation test's sht:schema is expected to be a ShExC file, not ${JSON.stringify(iri)}`);
  return iri.slice(0, -SHEXC.length);
}
/** ...and goes back on in the Turtle and in the legacy JSON */
function withShExC (ref) {
  if (/\.(?:shex|json|ttl)$/.test(ref))
    throw new Error(`a validation test's schemaURL names the schema without its representation's extension, not ${JSON.stringify(ref)}`);
  return ref + SHEXC;
}

/** the Test extension, http://shex.io/extensions/Test/, whose print(...)
 * lines the suite's semantic-action tests expect.  What those actions must
 * print is the extension's to say, so its manifest vocabulary is a scope
 * the manifest binds, the way implementations' examples bind an
 * extension's: in the @context, `tst: http://shex.io/extensions/Test/#` and,
 * beside it, `tst:parms: {"@context": <the scope's context>}`; in an entry,
 * `tst:parms: {prints: [...]}` where the Turtle has mf:extensionResults */
const TEST_EXTENSION = "http://shex.io/extensions/Test/";
const SCOPES = {
  tst: {namespace: "http://shex.io/extensions/Test/#",
        context: "https://shexspec.github.io/extensions/Test/manifest-context.jsonld"},
};

/** the Turtle's results, each {extension, prints}, as the scope's prints:
 * a line printed by the extension's own IRI is a string; one printed by
 * another IRI in its namespace (the suite's #a, #b, #c) keeps that IRI */
function printsFromLegacy (results) {
  return results.map(r => {
    if (!r.extension.startsWith(TEST_EXTENSION))
      throw new Error(`an mf:extension of ${r.extension} has no place in the Test extension's scope`);
    return r.extension === TEST_EXTENSION ? r.prints : {extension: r.extension, line: r.prints};
  });
}
/** ...and back, from the entry's `tst:parms` mapping */
function printsToLegacy (parms, where) {
  if (!parms || Object.keys(parms).join() !== "prints" || !Array.isArray(parms.prints))
    throw new Error(`${where}: tst:parms wants {prints: [...]}, not ${JSON.stringify(parms).slice(0, 60)}`);
  return parms.prints.map(p => typeof p === "string" ? {extension: TEST_EXTENSION, prints: p}
                          : {extension: p.extension, prints: p.line});
}

/** one ShapeMap association as its node and shape: {node, shape}, each
 * {iri} | {bnode} | {value, datatype?, language?}; shape null for START */
function parseAssociation (text) {
  const m = /^([\s\S]*)@(<[^>]*>|_:[\w.-]+|START)\s*$/.exec(text.trim());
  if (!m)
    throw new Error("not a single node@shape association: " + JSON.stringify(text));
  const term = (t) => {
    let l;
    if (/^<[^>]*>$/.test(t))
      return {iri: t.slice(1, -1)};
    if (/^_:[\w.-]+$/.test(t))
      return {bnode: t};
    if ((l = /^("(?:[^"\\]|\\.)*")(?:\^\^<([^>]*)>|@([A-Za-z]+(?:-[A-Za-z0-9]+)*))?$/.exec(t)))
      return Object.assign({value: JSON.parse(l[1])}, l[2] !== undefined ? {datatype: l[2]} : {}, l[3] !== undefined ? {language: l[3]} : {});
    throw new Error("not a node: " + JSON.stringify(t));
  };
  return {node: term(m[1].trim()), shape: m[2] === "START" ? null : term(m[2])};
}

/** ...and back: the association as ShapeMap text */
function writeAssociation ({node, shape}) {
  const term = (t) => "iri" in t ? `<${t.iri}>` : "bnode" in t ? t.bnode
        : JSON.stringify(t.value) + (t.language ? "@" + t.language : t.datatype ? `^^<${t.datatype}>` : "");
  return term(node) + "@" + (shape === null ? "START" : term(shape));
}

module.exports = {PREFIXES, TERMS, TYPES, typeOf, baseOf, CONTEXTS, withoutExtension, withShExC,
                  TEST_EXTENSION, SCOPES, printsFromLegacy, printsToLegacy, parseAssociation, writeAssociation};
