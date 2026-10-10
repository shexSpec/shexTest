---
name: shextest-manifests
description: How shexTest's test manifests work and how to change them safely - adding, copying, renaming or removing a test in schemas/, validation/, validation-contrib/, negativeSyntax/ or negativeStructure/, editing manifest.ttl, or regenerating manifest.jsonld. Use this whenever a task touches a manifest.ttl or manifest.jsonld, adds a .shex/.json/.ttl test file, or a check complains about test ids, names, entries or a stale manifest.jsonld.
---

# Manifests

Five directories hold a manifest: `schemas`, `validation`, `validation-contrib`,
`negativeSyntax`, `negativeStructure`. Each has two manifests that say the
same thing:

- **`manifest`**, the original: `manifest.ttl`, hand-edited and still the
  source, and `manifest.jsonld`, generated from it by `bin/genJSON.js`.
- **`manifest-ld`** (since #91, 2026-10): `manifest-ld.yaml`, the same tests
  in the ShEx manifest vocabulary, generated from `manifest.ttl` by
  `bin/manifest-ld-from-legacy.js`, and its `manifest-ld.{jsonld,ttl}` from
  `bin/manifest-ld.js`. The `shextest-manifest-ld` skill covers that
  structure, its scripts and its checks; this one covers the legacy files and
  test naming.

After any edit to `manifest.ttl`, regenerate all of it, in this order:

```sh
(cd validation && ../bin/genJSON.js manifest.ttl > manifest.jsonld)   # into a file, never a pipe
node bin/manifest-ld-from-legacy.js validation/manifest.ttl -o validation/manifest-ld.yaml
npm run manifest-ld
```

CI regenerates and fails on any difference. Two traps from the
`shextest-manifest-ld` skill: `genJSON.js` calls `process.exit`, which
truncates a pipe, so always redirect to the file; and never run `make` in
`negativeSyntax/` or `negativeStructure/`, whose Makefiles rewrite
`manifest.ttl` from the directory listing and lose the hand-written
error-location brackets.

## A test is named four times, and all must agree

```turtle
<> a mf:Manifest ;
    mf:entries (
        <#1dot_pass-noOthers>            # 1. in the entries list
    ) .

<#1dot_pass-noOthers> a sht:ValidationTest ;   # 2. as the subject
    mf:name "1dot_pass-noOthers" ;             # 3. as mf:name
```

```yaml
  - name: 1dot_pass-noOthers                   # 4. in manifest-ld.yaml
```

In the YAML an entry is named, not identified. When the Turtle's id and name
disagree, `manifest-ld-from-legacy.js` keeps both, as a `name` plus an `"@id"`
with a note, so an `"@id"` in a `manifest-ld.yaml` is that same mismatch,
carried into the file that is meant to become the source.

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
- `manifest-ld.yaml` lists the same tests in the same order, each named once,
  and no entry carries an `"@id"`

Run it on one directory while editing: `bin/checkManifestNames.js validation`.

## Adding or copying a test

1. Copy the nearest similar entry in `manifest.ttl`.
2. Change the subject **and** `mf:name`, to the same string.
3. Add the id to the `mf:entries` list, near its relatives.
4. Regenerate `manifest.jsonld`, `manifest-ld.yaml` and `manifest-ld.{jsonld,ttl}`
   as above.
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
  the `shextest-grammar` and `shextest-shexj-types` skills.

## What CI checks about manifests, and what it does not

See the `shextest-ci-red` skill. In short: `manifest.jsonld` regeneration is
diffed for `schemas`, `validation` and `negativeSyntax` only; the `manifest-ld`
files are checked everywhere, both ways; ids and names are checked everywhere;
nothing checks that the files an entry points at exist or that the three
renderings of a schema are equivalent (implementations' own test runs do that).
