---
name: manifests
description: How shexTest's test manifests work and how to change them safely - adding, copying, renaming or removing a test in schemas/, validation/, validation-contrib/, negativeSyntax/ or negativeStructure/, editing manifest.ttl, or regenerating manifest.jsonld. Use this whenever a task touches a manifest.ttl or manifest.jsonld, adds a .shex/.json/.ttl test file, or a check complains about test ids, names, entries or a stale manifest.jsonld.
---

# Manifests

Five directories hold a manifest: `schemas`, `validation`, `validation-contrib`,
`negativeSyntax`, `negativeStructure`. Each has two files that say the same
thing:

- `manifest.ttl` - the source. Hand-edited.
- `manifest.jsonld` - generated from it by `bin/genJSON.js`. Never hand-edit;
  CI regenerates it and fails on a difference.

```sh
(cd validation && ../bin/genJSON.js manifest.ttl > manifest.jsonld)
```

Each directory's `Makefile` has the same rule (`make manifest.jsonld`).

## A test is named three times, and all three must agree

```turtle
<> a mf:Manifest ;
    mf:entries (
        <#1dot_pass-noOthers>            # 1. in the entries list
    ) .

<#1dot_pass-noOthers> a sht:ValidationTest ;   # 2. as the subject
    mf:name "1dot_pass-noOthers" ;             # 3. as mf:name
```

Implementations select, skip and report tests by either the id or the name, and
they read `manifest.jsonld` as plain JSON (`"@id": "#1dot_pass-noOthers"`,
`"name": "1dot_pass-noOthers"`), not as expanded JSON-LD. When the strings
differ, the test one harness calls X is the test another calls Y, and the
manifest is still perfectly valid RDF, so nothing else notices.

This is easy to get wrong because tests are made by copying a neighbour. The
one that prompted the check was `<#extends-open-or-each-each_pass-cross-each>`
with `mf:name "extends-open-or-each-each_fail-cross-each"` (fixed in c6dfca8).

`bin/checkManifestNames.js` (`npm run test-manifest-names`) enforces, for every
directory and both files:

- every test has exactly one name, equal to the fragment of its id
- no id or name is used twice (a block pasted twice is caught, even when the
  two copies are identical)
- the `mf:entries` list and the defined tests are the same set
- the ttl and the jsonld list the same ids, in the same order, with the same
  names

Run it on one directory while editing: `bin/checkManifestNames.js validation`.

## Adding or copying a test

1. Copy the nearest similar entry in `manifest.ttl`.
2. Change the subject **and** `mf:name`, to the same string.
3. Add the id to the `mf:entries` list, near its relatives.
4. Regenerate `manifest.jsonld`.
5. `npm test`.

Names often encode the expected outcome (`…_pass-…`, `…_fail-…`). When copying a
passing test to make a failing one, the type changes too
(`sht:ValidationTest` to `sht:ValidationFailure`).

The shapes of entries, for orientation - copy a real one rather than these:

```turtle
<#1dot> a sht:RepresentationTest ;          # schemas/
    mf:name "1dot" ;
    mf:status mf:Approved ;
    sx:shex <1dot.shex> ; sx:json <1dot.json> ; sx:ttl <1dot.ttl> .

<#1dot_fail-empty> a sht:ValidationFailure ;   # validation/
    mf:name "1dot_fail-empty" ;
    sht:trait sht:TriplePattern ;
    rdfs:comment "<S1> { <p1> . } on {  }" ;
    mf:status mf:Approved ;
    mf:action [ sht:schema <../schemas/1dot.shex> ; sht:shape <http://a.example/S1> ;
                sht:data <empty.ttl> ; sht:focus <http://a.example/s1> ] .
```

## Things specific to `schemas/`

- A schema has three renderings that must describe the same thing: `X.shex`
  (ShExC), `X.json` (ShExJ) and `X.ttl` (ShExR). Several entries may share a
  `.json`/`.ttl` when they differ only in ShExC spelling (`open1dotclose` uses
  `1dot.json`).
- Every file that another schema `IMPORT`s needs its own entry, or nothing ever
  round-trips its `.json` and `.ttl` against its `.shex`
  (`bin/checkSchemaImports.js`). A commented-out draft entry counts as
  "known, deferred".
- Every `X.json` must conform to `doc/ShExJ.jsg`. If the new schema uses a
  construct the grammar or the published TypeScript types do not have yet, see
  the `changing-the-grammar` and `shexj-types` skills.

## What CI checks about manifests, and what it does not

See the `ci-red` skill. In short: regeneration is diffed for `schemas`,
`validation` and `negativeSyntax` only; ids and names are checked everywhere;
nothing checks that the files an entry points at exist or that the three
renderings of a schema are equivalent (implementations' own test runs do that).
