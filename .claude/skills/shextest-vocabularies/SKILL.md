---
name: shextest-vocabularies
description: Maintain the vocabularies shexTest generates for w3c/ns — `vocab/vocab.csv` (shex), `vocab/manifest-vocab.csv` (shex-manifest) and `vocab/test-vocab.csv` (shex-test) through `vocab/mk_vocab.js` into `<name>.{ttl,jsonld,html}` in a w3c/ns checkout: the CSV columns and row types, how a term's JSON-LD typing is derived, the `--vocab/--nsdir/--check/-f context` options, owl:versionInfo citing the CSV's last commit (regenerate after any history rewrite), what belongs in each vocabulary versus an extension's scope context, and getting the files into w3c/ns. Use when changing a CSV, regenerating w3c/ns, or when `vocab-check` or shex.js's roll-up test says the files drifted.
---

# The vocabularies shexTest generates

`vocab/mk_vocab.js` is Gregg Kellogg's `mk_vocab.rb` ported, one script for
three vocabularies (its `VOCABULARIES` table):

| `--vocab` | CSV | prefix, namespace | published as |
|---|---|---|---|
| `shex` | `vocab/vocab.csv` | `shex:` `http://www.w3.org/ns/shex#` | `https://www.w3.org/ns/shex` — ShExR, the RDF form of a schema |
| `shex-manifest` | `vocab/manifest-vocab.csv` | `shexMan:` `http://www.w3.org/ns/shex-manifest#` | `https://www.w3.org/ns/shex-manifest` — what every manifest of ShEx validations shares |
| `shex-test` | `vocab/test-vocab.csv` | `shexTest:` `http://www.w3.org/ns/shex-test#` | `https://www.w3.org/ns/shex-test` — what a conformance test says beyond a manifest entry |

Each becomes `<name>.ttl`, `<name>.jsonld` (the `@context` readers use, plus
an `@graph` with the ontology) and `<name>.html` (ReSpec) in a w3c/ns
checkout, next to a `<name>.var` type map for content negotiation (a copy of
`shex.var` with the names changed; no `.htaccess` entry is needed).

## Commands (run in the shexTest checkout)

```sh
node vocab/mk_vocab.js --vocab shex-test --nsdir ../../w3c/ns          # writes the three files there
node vocab/mk_vocab.js --vocab shex-test --check --nsdir ../../w3c/ns  # compares, writes nothing; exit 1 on drift
node vocab/mk_vocab.js --vocab shex-test -f context                    # the @context alone, to stdout
npm run vocab-check                                                    # shex: vocab.csv against doc/ShExR.shex
```

`npm run vocab-manifest` / `vocab-test` are the first form for the two
manifest vocabularies.

## The CSV

Columns: `id,type,label,subClassOf,domain,range,@type,@container,ForwardMultiplicity,ReverseMultiplicity,term,comment`.
Row `type`s:

- `prefix` — `id` the prefix, `subClassOf` the namespace; becomes a context
  binding.
- `rdfs:Class`, `rdf:Property` — a class or property of this vocabulary (an
  `id` with no colon is in the vocabulary's namespace). A property's context
  definition is derived from `range`: `xsd:string` → `@language: null`;
  another `xsd:` type → `@type`; none or `rdfs:Literal` → nothing; anything
  else → `@type: @id`. The `@container` column adds one; the `@type` column
  overrides; `term` renames the JSON-LD term; `@type` of `@null` keeps it
  out of the context.
- `term` — a context term that defines no property: `id` the term,
  `subClassOf` the IRI it maps to (`shexTest:result` for `resultURL`,
  `rdfs:seeAlso`, `shex:node`), `@type`/`@container` columns its typing.
  **A term row's `range` is ignored**, which is why `status` (`shex:status`)
  has no `@language: null` while every other string term has; honour it in
  the term loop of `mk_vocab.js` if that should change.
- `rdfs:seeAlso` — an empty `id`, `subClassOf` the URL: the ontology
  header's links.

The X/XURL convention: a document-valued property (`schema`, `result`,
`shexj`) is the text; a `term` row `<x>URL` maps to the same IRI, typed
`@id`, for a reference.

## owl:versionInfo and dc:date

Both come from `git log -1 -- vocab/<csv>`: the generated files cite the
commit that last changed the CSV, as a GitHub commit URL. A history rewrite
of that commit (squash, amend, rebase) orphans the citation and
`--check --nsdir` then reports every file "not what the CSV generates".
Regenerate, and commit in w3c/ns, only once the shexTest history is final
and pushed, so the link resolves. `--date` and `--commit` override the
values.

## What belongs where

- `shex-manifest`: what manifests of ShEx validations have in common,
  whoever wrote them (shex.js's examples, this suite, other
  implementations): `entries`, `name`, `schema`/`data`/`queryMap` with their
  `URL` and `Label` spellings, `comment`, and `node`/`shape`/`status`
  borrowed from the ShEx vocabulary.
- `shex-test`: what a test says beyond that: `trait`, `approval`,
  `schemaError` and where, `shexc`/`shexj`/`shexr`, `sameSemanticsAs`,
  `result`, `semActs`, `shapeExterns`, and the `seeAlso`/`wasDerivedFrom`
  aliases.
- Anything an extension or a data backend defines — ShExMap's outputs, the
  Test extension's `prints` — is **not** a vocabulary here: it is that
  module's scope context, `<X>/manifest-context.jsonld` beside its spec in
  shexSpec/extensions (shex.js's neighborhoods keep theirs in shex.js), bound
  in a manifest as `<prefix>:parms`.
- Nothing is in this repository's own namespace,
  `https://shexspec.github.io/shexTest/ns#`.

## Publishing

w3c/ns takes PRs from a fork (`git remote add ericprud git@github.com:ericprud/ns`;
branch `manifest-refactor`); its README requires @w3c/transitions approval
for a new namespace. The HTML loads `respec-w3c-common` from w3.org, as
`shex.html` does.

## Downstream

- shex.js carries a roll-up of every context a manifest may stack
  (`packages/shex-manifest/known-contexts.json`); after a CSV change, rerun
  `node tools/rollup-manifest-contexts.js --ns ../../w3c/ns --extensions ../../shexSpec/extensions`
  there (its `shexjs-manifests` skill). Its `Manifest-test` compares the
  roll-up with a sibling w3c/ns checkout when one exists.
- `bin/manifest-ld.js` builds the two manifest contexts from the CSVs
  itself, so `npm run manifest-ld-check` sees a CSV change immediately.
