---
name: shextest-grammar
description: Checklist for changing what a ShEx schema may say in shexTest - editing doc/ShExJ.jsg, doc/ShExR.shex, doc/ShExV.jsg or vocab/vocab.csv, adding or removing a property or production, or adding schemas that use a new language feature. Use this whenever one of those files is edited or reviewed, when someone asks whether the grammars agree, or when a grammar check fails. The same language is written down in six places here and elsewhere, and a change to one that skips the others is the usual source of trouble.
---

# Changing the grammar

The language is described in several places that are meant to agree. They are
maintained by hand, some here and some elsewhere, and they drift. Two examples
found on 2026-10-06 by reading `ShExJ.jsg` next to the TypeScript types:

| ShExJ.jsg said | everything else said | resolution |
|---|---|---|
| `Shape { abstract:BOOL ? … }` | `abstract` belongs to `ShapeDecl` only | removed from `Shape` |
| `IriStemRange { … exclusions:[…]? }` | exclusions required, as for the Literal and Language ranges | made required: a range with no exclusions is an `IriStem` |

Both had passed every check for years, because no test schema used either and
nothing here tests that a grammar *rejects* something.

## The places

| What | Where | Maintained | Kept honest by |
|---|---|---|---|
| ShExJ grammar | `doc/ShExJ.jsg` | by hand | `test-shexj-jsg`: every `schemas/*.json` conforms |
| ShExR grammar | `doc/ShExR.shex` | by hand; the source | `vocab-check` |
| ShExR renderings | `doc/ShExR.ttl`, `doc/ShExR.ntriples` | derived: `npm run shexr` | `shexr-check` |
| ShExR as ShExJ | `doc/ShExR.json` | by hand, to keep its formatting | `shexr-check` compares it as an AST |
| Vocabulary | `vocab/vocab.csv` | by hand; the source of <https://www.w3.org/ns/shex> | `vocab-check` |
| Manifest vocabularies | `vocab/manifest-vocab.csv`, `vocab/test-vocab.csv` | by hand; describe manifests, not the language (the `shextest-vocabularies` skill) | `manifest-ld-check` |
| JSON-LD context | `doc/ShExJ-context.jsonld` | derived: `npm run vocab` | used by `mkShExR.js`, so `shexr-check` exercises it |
| Validation results | `doc/ShExV.jsg` | by hand | `test-shexv-err` |
| TypeScript types | `@types/shexj`, in DefinitelyTyped | by hand, in another repo | `test-shexj-types`; see the `shextest-shexj-types` skill |
| ShExC | the specification, not this repo | - | implementations |
| Known disagreements | `doc/syntax-deltas.html` | by hand | nobody |

`ShExV.jsg` restates some ShExJ productions (the stem ranges, for instance), so
it is a seventh copy of those.

## Before editing a production

Find the same production everywhere and compare. They should agree; where they
do not, it is either recorded in `doc/syntax-deltas.html` or it is a bug, and
the user wants to hear about it either way.

```sh
git grep -n -i 'IriStemRange\|exclusion' -- doc/ vocab/vocab.csv
sed -n '/IriStemRange/,/^}/p' node_modules/@types/shexj/index.d.ts
```

Spelling differs between them: ShExJ `exclusions` is ShExR `sx:exclusion`;
ShExJ lists are ShExR `…List1Plus` shapes; a ShExJ `X ?` is a ShExR `?`.

## Making the change

1. Edit the hand-maintained sources that need it: `ShExJ.jsg`, `ShExR.shex`,
   `vocab.csv`, `ShExV.jsg`.
2. Regenerate what is derived: `npm run vocab`, then `npm run shexr`. Hand-edit
   `ShExR.json` if `shexr-check` says it no longer matches.
3. Add schemas that use the feature, in all three renderings, with manifest
   entries (the `shextest-manifests` skill).
4. Probe the edges directly. The corpus only shows that valid things are
   accepted, so write the two smallest documents that should now be accepted
   and rejected and run them:
   ```sh
   node_modules/.bin/json-grammar doc/ShExJ.jsg probe.json; echo $?   # 0 accepts, 1 rejects
   ```
   Keep probes out of the repo (a scratch directory).
5. `npm test`.
6. If the change adds something to ShExJ, the published TypeScript types will
   not know it yet and `test-shexj-types` fails, printing lines to paste into
   the `AHEAD` table in `bin/checkShExJTypes.js`. The `shextest-shexj-types` skill has
   the whole procedure.
7. If the three syntaxes now disagree on purpose, or a recorded disagreement
   went away, update `doc/syntax-deltas.html`.

## When loosening and when tightening

Tightening a grammar (as in both examples above) can only break schemas that
used the thing removed; `npm test` answers that at once. It needs no change to
the TypeScript types if they were already that strict - check before assuming.

Loosening or adding is the case that needs the types to follow, and the one
with a waiting period.
