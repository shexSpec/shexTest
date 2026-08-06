# ShEx vocabulary source

`vocab.csv` is the source of truth for the ShEx vocabulary,
`http://www.w3.org/ns/shex#`. `mk_vocab.js` generates the derived files from
it.

This lives here because shexTest already carried two hand-maintained copies of
this vocabulary — `../doc/ShExJ-context.jsonld` and `../doc/ShExR.shex` — and
both had drifted from what is published at www.w3.org/ns/shex.

## History

Gregg Kellogg (RIP) wrote the original `mk_vocab.rb` plus an erubis
`template.html`, in
[shexSpec/shexspec.github.io/ns](https://github.com/shexSpec/shexspec.github.io/tree/master/ns)
(dormant since 2018). `mk_vocab.js` is a dependency-free Node port of it,
verified to reproduce the Ruby's output byte-for-byte before any new terms were
added. The template is folded into the `renderHtml` function.

The port fixes the Ruby's `dc:imports` and `http;//purl.org` typos, and folds
back the edits that had been made by hand to the generated files in w3c/ns
since 2017 (`shex:extends`, `shex:shapes` as a `@list`).

## Generated files

| file | generated? |
| --- | --- |
| `../doc/ShExJ-context.jsonld` | yes, by `npm run vocab` |
| `w3c/ns` `shex.ttl`, `shex.jsonld`, `shex.html` | yes, with `--nsdir` |
| `../doc/ShExR.shex`, `../doc/ShExR.ttl` | **no** — hand-maintained |

`mk_vocab.rb` had a fourth output format, `to_shexc`, that emitted a ShExC
sketch of ShExR from the domain/range/multiplicity columns. It is ported as
`-f shexc`, but it does not and cannot replace `../doc/ShExR.shex`: the
generated schema has no `CLOSED`, no `a [sx:Class]` type arcs and no
`…List1Plus` shapes for the `@list`-valued properties, and as of this writing
it does not parse. ShExR stays hand-maintained; `npm run vocab-check` guards
it instead (see below).

`../doc/ShExR.shex` is also mirrored into shex.js as
`packages/shex-webapp/doc/ShExRSchema.js`, which has to be updated by hand to
match.

## Updating the vocabulary

1. Edit `vocab.csv`. Columns:
   `id,type,label,subClassOf,domain,range,@type,@container,ForwardMultiplicity,ReverseMultiplicity,term,comment`
   - `type` selects the kind of row: `prefix`, `term` (context-only alias),
     `rdf:Property`, `rdfs:Class`, `rdfs:Datatype`, `owl:imports`,
     `rdfs:seeAlso`, or a class name, which makes the row an instance of it.
   - `subClassOf` doubles as subPropertyOf for properties, and as the URI for
     prefix/term/imports/seeAlso rows.
   - `@type`/`@container` override the JSON-LD context coercions otherwise
     derived from `range`; an `@type` of `@null` keeps the term out of the
     context entirely.
   - Row order does not matter; the output is sorted.
2. Commit `vocab.csv`. `dc:date` and `owl:versionInfo` come from
   `git log -1 vocab.csv`, so the commit has to exist before the files are
   generated. If the merge rewrites the sha (a squash merge will), regenerate
   afterwards so `owl:versionInfo` points at a commit that exists.
3. `npm run vocab` regenerates `../doc/ShExJ-context.jsonld`.
   Add `-- --nsdir path/to/w3c/ns` to also regenerate `shex.ttl`,
   `shex.jsonld` and `shex.html` in a [w3c/ns](https://github.com/w3c/ns)
   checkout, then raise a PR there. Those three files are published at
   <https://www.w3.org/ns/shex>; nothing else in this directory belongs in
   that repo, because that repo is the document root of www.w3.org/ns/.
4. Commit the regenerated files.

`node vocab/mk_vocab.js --help` lists the rest of the options.

## Drift check

`npm run vocab-check` reports terms that `../doc/ShExR.shex` uses but
`vocab.csv` does not define.

**It currently fails**, which is why it is not part of `npm test` yet. ShExR
uses four terms that have never existed in the published vocabulary:

    sx:ShapeDecl  sx:abstract  sx:imports  sx:negated

They arrived with the ShEx 2.1 `EXTENDS`/`abstract` work and were never added
to www.w3.org/ns/shex. Adding them changes a published W3C namespace, so it is
a deliberate decision, not a mechanical fix — hence a failing check rather than
a silent one. Once the four terms are in `vocab.csv` and the regenerated files
are merged into w3c/ns, fold `vocab-check` into the `test` script.
