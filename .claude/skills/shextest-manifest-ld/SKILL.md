---
name: shextest-manifest-ld
description: Work with shexTest's manifests — each suite directory's legacy `manifest.ttl`/`manifest.jsonld` and its `manifest-ld.{yaml,jsonld,ttl}` in the ShEx manifest vocabulary: which is the source today, the bin/manifest-ld-* scripts that go between the two structures, the checks in `npm test` and CI, how an entry is written (status or schemaError instead of a type, a negotiable schemaURL, queryMap for blank nodes and literals, the Test extension's tst:parms for what actions print), and the gotchas. Use when adding or changing a test, regenerating manifests, touching the converters, or when `manifest-ld-check` or `manifest-ld-legacy-check` fails.
---

# shexTest's manifests: `manifest` and `manifest-ld`

Each suite directory (`validation`, `schemas`, `negativeSyntax`,
`negativeStructure`, `validation-contrib`; `schemas-contrib` holds only the
schemas `validation-contrib` uses) has two manifests: two resources, each
with its representations.

| resource | files | structure |
|---|---|---|
| `manifest` | `manifest.ttl` (hand-written), `manifest.jsonld` (written by `bin/genJSON.js`) | the SPARQL WG's test-manifest format: every test typed `sht:ValidationTest`, `sht:ValidationFailure`, …, its inputs in an `mf:action` node |
| `manifest-ld` | `manifest-ld.yaml` (the text), `manifest-ld.jsonld` (its JSON), `manifest-ld.ttl` (its RDF graph as Turtle); the last two written by `bin/manifest-ld.js` | the ShEx manifest vocabulary: the YAML-LD format ShEx implementations use for their own example manifests |

Implementations that read the legacy files need not change. shex.js's suites
read `manifest-ld` whenever the corpus has it.

## Which is the source

Today `manifest.ttl` is still the source. `manifest-ld.yaml` is **generated**
from it by `bin/manifest-ld-from-legacy.js`, comments and all, and the checks
hold the YAML to that. Making the YAML authoritative means writing
`manifest.ttl` with `bin/manifest-ld-to-legacy-ttl.js` and `manifest.jsonld`
with `bin/manifest-ld-to-legacy-jsonld.js` instead of `genJSON.js`, and
dropping the "is what from-legacy writes" check. Both directions are checked
lossless today, so that flip is a policy decision, not a migration.

## The scripts (`bin/`)

`bin/manifest-ld-terms.js` is the one table they share: `TERMS` (which YAML
key is which legacy predicate, where it sits — on the test or in its
`mf:action` — and how its value is written), `TYPES`/`typeOf` (the legacy type
a `status`/`schemaError` stands for), `baseOf(dir)` (the conventional base,
`https://raw.githubusercontent.com/shexSpec/shexTest/master/<dir>/manifest`),
`CONTEXTS` (the two W3C contexts), `SCOPES` (extension scopes the manifest
may bind; today the Test extension's), `withoutExtension`/`withShExC` (the
negotiable schemaURL), `printsFromLegacy`/`printsToLegacy` (the Test scope),
`parseAssociation`/`writeAssociation` (a query map's one association).

| script | does |
|---|---|
| `manifest-ld-from-legacy.js manifest.ttl -o manifest-ld.yaml` | the migration: the YAML from the Turtle's token stream (not its graph), so every comment lands where it was |
| `manifest-ld.js [--check] [dir …]` — `npm run manifest-ld`, `manifest-ld-check` | `manifest-ld.jsonld` and `manifest-ld.ttl` from the YAML, after checking that the Turtle is the graph a JSON-LD processor reads from the YAML (safe mode: a key no context defines is an error) |
| `manifest-ld-to-legacy-ttl.js manifest-ld.yaml > manifest.ttl` | the legacy Turtle back; module `toTurtle(doc, dirName)` |
| `manifest-ld-to-legacy-jsonld.js manifest-ld.yaml > manifest.jsonld` | the legacy JSON back, byte for byte what `genJSON.js` writes; module `project(doc, dirName)`, which shex.js's suites use |
| `manifest-ld-legacy-check.js [dir …]` — `npm run manifest-ld-legacy-check` | the six checks below |
| `genJSON.js manifest.ttl > manifest.jsonld` | the legacy generator, unchanged |

`npm test` and CI run `manifest-ld-check` and `manifest-ld-legacy-check`.
The legacy check, per directory: the YAML says what it says without the
legacy expression (the two contexts stacked, nothing else bound but a
carried key's prefix or a `SCOPES` scope; no `@type`, `action` or `mf:` key;
every entry named once; a status or schemaError that is one of its two
values); it is what `manifest-ld-from-legacy.js` writes from the Turtle; it
carries every comment line; `manifest-ld-to-legacy-ttl.js` writes the
Turtle's graph (canonical N-Quads equal) and `manifest-ld-to-legacy-jsonld.js`
the committed `manifest.jsonld` byte for byte; and read as RDF it says nothing
in the suite's old namespace (`https://shexspec.github.io/shexTest/ns#`), every
predicate in a vocabulary a manifest stacks. Six seconds for the five.

## Changing a test today

1. Edit `manifest.ttl`, add the schema and data files. **Never run `make` in
   `negativeSyntax/` or `negativeStructure/`**: their Makefiles rewrite
   `manifest.ttl` from the directory listing and lose the hand-written
   error-location brackets.
2. Regenerate the legacy JSON **into a file, never through a pipe** —
   `genJSON.js` calls `process.exit`, which truncates piped stdout:
   `(cd validation && ../bin/genJSON.js manifest.ttl > manifest.jsonld)`.
3. Regenerate the YAML:
   `node bin/manifest-ld-from-legacy.js validation/manifest.ttl -o validation/manifest-ld.yaml`.
4. `npm run manifest-ld`, then `npm run manifest-ld-check && npm run manifest-ld-legacy-check`.
5. For the shex.js side (reference results, the paired branch) see shex.js's
   `shextest-paired-branches` skill.

## What an entry says

- Nothing types a test. `status: conformant|nonconformant` is a validation
  test; `schemaError: syntax|structure` a schema that must be rejected, with
  `startRow`/`startColumn`/`endRow`/`endColumn` saying where; neither is a
  representation test.
- `name` is the Turtle's `<#name>`. An `@id` appears only where the Turtle's
  fragment differs from its `mf:name` (one test).
- `approval: Approved|Proposed` is the old `mf:status` (`proposed`, lowercase,
  is carried in two directories as the Turtle has it).
- Inputs are the entry's own, no `mf:action`: `schemaURL`, `dataURL`, `node`,
  `shape`. A validation test's `schemaURL` has **no extension**
  (`../schemas/1dot`): it is negotiable; readers ask for `.shex`, `.json`,
  `.ttl` in that order, the legacy writers put `.shex` back. A schema test
  names each representation outright: `shexcURL`, `shexjURL`, `shexrURL`.
- A blank-node or literal focus, or a blank-node shape, is a query map as
  text — `queryMap: "_:abcd@<http://a.example/S1>"` — because a JSON-LD
  processor relabels blank nodes and a literal is no reference.
- `trait: [Names]` are plain strings (an open vocabulary); `comment`;
  `seeAlso`, `wasDerivedFrom`, `sameSemanticsAs` (`#name` references);
  `resultURL`, `semActsURL`, `shapeExternsURL`.
- What the **Test extension** must print is its own scope: the manifest binds
  `tst: http://shex.io/extensions/Test/#` and `tst:parms: {"@context":
  https://shexspec.github.io/extensions/Test/manifest-context.jsonld}` in its
  `@context`, and an entry writes `tst:parms: {prints: [...]}`, each member
  the line as a string, or `{extension, line}` when the action was dispatched
  on another IRI in that namespace (`1dotNoCode3_pass`'s `#a`, `#b`, `#c`).
  The ShEx test vocabulary has no term for it.
- negativeStructure's seven `mf:comment` keys are carried as the Turtle wrote
  them; that manifest binds `mf:` inline.

## Vocabularies and scopes

The two contexts, `https://www.w3.org/ns/shex-manifest.jsonld` then
`https://www.w3.org/ns/shex-test.jsonld`, are generated here from
`vocab/*.csv` (the `shextest-vocabularies` skill); `manifest-ld.js` builds
them from the CSVs (`mk_vocab.js --format context`), so a CSV change shows in
the checks at once. An extension's scope context lives beside its spec in
shexSpec/extensions (`<X>/manifest-context.jsonld`); `manifest-ld.js` reads
it from a sibling `../extensions` checkout when there is one, otherwise
fetches `https://shexspec.github.io/extensions/<X>/manifest-context.jsonld` —
so CI needs it published: merge the extensions PR before the shexTest one.
Nothing extension-specific goes into the test vocabulary.

## Gotchas

- `manifest-ld-to-legacy-jsonld.js` prints a trailing blank line; the
  committed `manifest.jsonld` ends `\n\n`; the check compares bytes.
- The legacy check canonicalizes with URDNA2015, which is quick on the legacy
  graph (named subjects). Never canonicalize `manifest-ld.ttl`'s graph that
  way: its entries are blank nodes in a list, O(n²) deep iterations, minutes
  for validation. `manifest-ld.js` compares deterministic trees instead.
- JSON-LD attaches a scoped context to the key as written: bind `tst:parms`,
  not only `tst`, or the mapping's contents are dropped.
- jsonld.js leaves out an empty language where N3 gives `""`; a graph is a
  set (validation's repeated `seeAlso` value is one triple).
- The migration quotes a YAML scalar that starts with a digit (`"0.shex"`)
  and leaves the rest plain; prose is always quoted.
- Quirks kept so the Turtle regenerates exactly: the `mf:comment` keys,
  `proposed`, the one `@id`, repeated `seeAlso` members. Normalizing them is a
  change to the legacy files.
- Sizes: validation 1309 entries, schemas 484, negativeSyntax 105,
  negativeStructure 19, validation-contrib 8.
