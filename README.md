[![NPM Version](https://badge.fury.io/js/shex.png)](https://npmjs.org/package/shex)
[![ShapeExpressions Gitter chat https://gitter.im/shapeExpressions/Lobby](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/shapeExpressions/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Try the [test viewer](http://shexspec.github.io/shexTest/viewer.html).

# shexTest

## Directories:
### `schemas`

* Test schemas in ShExC (`.shex`), ShExJ (`.json`) and sometimes SHACL (`.shacl`).

The ShExC and ShExJ files with the same stem name are equivalent.
A ShExC syntax test consists of these steps:

* parse the ShExC version of the document with some base URI.
* parse the ShExJ, as JSON; evaluate the values of the following as relative IRIs:
  * values of the `start`, `inclusion`, `predicate`, and `datatype` properties.
  * shape names (keys in the `shapes` object).
  * terms in `values` properties.
* ensure that no `ValueAnd` or `ValueOr` expression contains `ValueAnd` or `ValueOr` expressions in the list of `valueExprs`.
* the two parsed products should be equivalent, with blank node substitution.


## `negativeSyntax`
These tests violate the ShEx2 grammar.

## `negativeStrucutre`
These tests should raise errors when parsed, noting the rule about nested `ValueAnd` and `ValueOr` expressions.

### `validation`

* Validation tests in a manifest (Turtle - `manifest.ttl`, [ShExJ](http://shex.io/shex-semantics/#shexj) ([obselete primer](http://shex.io/shex-primer-20170327/ShExJ)) - `manifest.json`).
* Input data in Turtle (`.ttl`).
* Validation returns a [ShapeMap](https://shexspec.github.io/shape-map/) capturing which node/shape pairs conform. The expected conformance or non-conformance is captured in the test format as a `ValidationTest` or `ValidationFailure`. 

A ShEx validator is `logic-conformant` when it returns success for the tests of type `ValidationTest` and failure for the tests of type `ValidationFailure`.
A ShEx validator is `result-conformant` (experimental) when it executes as `ValidationTest` and produces the same result structure as produced by this procedure:
* parse the result file as JSON.
* parse the ShExJ, as JSON; evaluate the values of the following as relative IRIs:
  * values of the `node`, `shape`, `subject`, `predicate`, and `object` properties.
* the two parsed products should be equivalent, with blank node substitution.
A ShEx validator is `error-conformant` (even more experimental) when it executes a `ValidationFailure` and produces the same result structure as produced by the procedure above.

#### `coverage`

One frequently wants to ask "does the test suite include X".
One way to test that is to guess by the relatively formulaic filenames and test names in `validation/manifest`.
Another is to "grep" through the JSON representations of the queries for something with the appropriate structure, e.g. using [jq](https://stedolan.github.io/jq/) to `EachOf`s that include a pattern with a `min` cardinality of 0:

    (for f in schemas/*.json; do
      jq -e '.[]|..|objects|select(.type=="EachOf").expressions[]|select(.min==0)' $f > /dev/null &&
      echo $f;
      done
    )

which yields the files which include this pattern:

    schemas/1val1IRIREFExtra1Or.json
    schemas/3circularRef1.json
    schemas/kitchenSink.json

### `validation-contrib` and `schemas-contrib`

* Validation tests that are useful across implementations but are **not attributable to the ShEx specification**: error-repair recipes (`sht:Repair`) and feasibility localization / structured error reporting (`sht:Feasibility`).
* Same manifest layout as `validation` (`manifest.ttl`, `manifest.jsonld`) and the same `.ttl` data convention; the schemas live in `schemas-contrib/` as ShExC only (no ShExJ/ShExR trio, no representation tests).
* Entries carry only `ValidationTest`/`ValidationFailure` plus traits. There are no reference results, so a validator can be checked for logic-conformance here but not result-conformance, and a conformant implementation is not required to run them at all.

## `doc`

Grammars for the three renderings of a ShEx schema, and the pieces that relate
them:

* [`ShExJ.jsg`](doc/ShExJ.jsg) — ShExJ, as a JSON Schema Grammar.
* [`ShExR.shex`](doc/ShExR.shex) — ShExR: the ShEx schema that RDF renderings of
  ShEx schemas are validated against. Hand-maintained, and the source for
  `ShExR.ttl` and `ShExR.ntriples`, which [`bin/mkShExR.js`](bin/mkShExR.js)
  derives and `npm test` keeps in sync.
* [`ShExJ-context.jsonld`](doc/ShExJ-context.jsonld) — the JSON-LD context that
  turns ShExJ into ShExR. Generated from [`vocab/vocab.csv`](vocab/), which is
  also the source of <https://www.w3.org/ns/shex>.
* [`syntax-deltas.html`](doc/syntax-deltas.html) — where ShExC, ShExJ and ShExR
  disagree about what a schema may say, with the evidence for each. Notably,
  ShExR admits a `ShapeDecl` as `start` where neither of the others can express
  one.

## Manifests: `manifest` and `manifest-ld`

Each suite directory has two manifests -- two resources, each with its representations:

* **`manifest`** is the original structure, the SPARQL WG's test-manifest format: `manifest.ttl`, and `manifest.jsonld`, which `bin/genJSON.js` writes from it. The implementations that run the suite read these, and need not change.
* **`manifest-ld`** is the same tests in the ShEx manifest vocabulary, the YAML-LD format ShEx implementations use for their own example manifests: `manifest-ld.yaml`, the text to edit, comments and all; `manifest-ld.jsonld`, its JSON, the same JSON-LD document without the comments; and `manifest-ld.ttl`, its RDF graph as Turtle. References stay relative in all three, as the YAML writes them, so each means the same wherever it is served.

Each `manifest-ld.yaml` says what its directory's `manifest.ttl` says, in that format:

``` yaml
"@context":
  - https://www.w3.org/ns/shex-manifest.jsonld
  - https://www.w3.org/ns/shex-test.jsonld
comment: "ShEx validation tests"
entries:
  ## empty {
  - name: "0_empty"
    status: conformant
    trait: [Empty]
    comment: "<S1> {  } on {  }"
    approval: Approved
    schemaURL: ../schemas/0.shex
    shape: http://a.example/S1
    dataURL: empty.ttl
    node: http://a.example/dummy
```

* Nothing types a test. A validation test is an entry with a `status`, and the status says what `sht:ValidationTest` and `sht:ValidationFailure` said: `conformant` or `nonconformant`. A schema that must be rejected says how (`schemaError: syntax` or `structure`); a representation test names the schema's three serializations (`schemaURL`, `shexjURL`, `shexrURL`).
* An entry is named (`name`), where the Turtle had both `<#name>` and `mf:name`; its inputs are its own, where the Turtle had an `mf:action` node; `approval` is what `mf:status` was, since `status` is the outcome expected.
* `node` and `shape` are IRIs. A focus node that is a blank node or a literal is said as a query map instead -- `queryMap: "_:abcd@<http://a.example/S1>"` -- because that is text: read as JSON-LD, a blank node's label would be lost, and the label is the point of those tests.
* One list replaces the Turtle's two: `entries` holds the tests themselves, in `mf:entries` order, so a test cannot be listed and not defined, or defined and not listed.
* The vocabulary is the [ShEx manifest vocabulary](https://www.w3.org/ns/shex-manifest) (`entries`, `name`, `schema`/`data`/`queryMap` with their `URL` and `Label` spellings, `comment`, and `node`, `shape`, `status` from the ShEx vocabulary), whose source is [`vocab/manifest-vocab.csv`](vocab/manifest-vocab.csv), plus the [ShEx test vocabulary](https://www.w3.org/ns/shex-test) for what a test says beyond that (`trait`, `approval`, `schemaError` and where, `shexjURL`/`shexrURL`, `sameSemanticsAs`, `resultURL`, `semActsURL`, `shapeExternsURL`, `extensionResults`), whose source is [`vocab/test-vocab.csv`](vocab/test-vocab.csv). Both are W3C namespaces, generated into w3c/ns by `vocab/mk_vocab.js`; `trait` names are plain strings. Read as JSON-LD, a manifest is an RDF graph in those vocabularies. The seven `mf:comment` keys `negativeStructure` carries across from the Turtle are the one exception: that manifest binds `mf:` in its own `@context`.

The scripts, with [`bin/manifest-terms.js`](bin/manifest-terms.js) as the one table of which key is which legacy predicate:

* `bin/ttl2yamlld.js manifest.ttl > manifest-ld.yaml` is the migration: it writes the YAML from the Turtle *heuristically* -- from the token stream, not from a graph -- so the Turtle's comments come across, each where it was.
* `bin/yaml2ttl.js manifest-ld.yaml > manifest.ttl` writes the legacy Turtle from the YAML, for the implementations that read it. Its graph is the graph of the Turtle the YAML came from, for all five manifests: nothing was lost.
* `bin/manifest-ld.js` (`npm run manifest-ld`) writes each directory's `manifest-ld.jsonld` and `manifest-ld.ttl` from its `manifest-ld.yaml`, having checked that the Turtle is the graph a JSON-LD processor reads from the YAML; `npm run manifest-ld-check` (in `npm test` and CI) says whether they are up to date.
* `bin/yaml2jsonld.js manifest-ld.yaml > manifest.jsonld` writes the `manifest.jsonld` that `bin/genJSON.js` writes from the Turtle, byte for byte.

shex.js's `packages/shex-manifest/test/TestSuiteManifest-test.js` checks all of that, and its validation and parser suites read `manifest-ld` wherever a corpus has it. It also checks that these manifests are the format of shex.js's own examples manifests:

* read as JSON-LD, each is a graph in which nothing it says is dropped;
* `@shexjs/manifest`, the reader for shex.js's examples, reads all five, and what it reads plainly is what a JSON-LD processor reads (`negativeStructure`'s seven `mf:comment` keys, carried across as they were, are the one thing that needs the processor);
* shex.js's examples runner, which knows nothing of this suite, gets the `status` each validation entry states -- for all 1239 of the 1309 that need only what an example does. The other 70 need an import, a semantic-action extension, a query map in a file, or a literal focus or blank-node shape in a query map.

Two things a reader of the graph should know. An entry is identified by its `name`, not by an IRI, so a reference from one test to another (`sameSemanticsAs: "#1dotRefLNex1"`, 23 of them) names an IRI the YAML's graph says nothing else about; `bin/yaml2ttl.js` gives each entry that IRI, `<#name>`, in the Turtle. And the two contexts are published only once w3c/ns takes them: until then `https://www.w3.org/ns/shex-manifest.jsonld` and `https://www.w3.org/ns/shex-test.jsonld` are found in a w3c/ns checkout (shex.js carries a copy of both).
