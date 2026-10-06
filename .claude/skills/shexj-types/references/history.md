# The lost type check, 2022-2026

Established on 2026-10-06 from git, npm and DefinitelyTyped. Evidence first,
inference marked as such.

## What was in the repo

`630f48b` "+ npm run test" (2022-08-28) replaced
`"test": "echo no tests for tests"` with a chain ending in `test-ts`:

    rm -rf _ts && mkdir -p _ts/schemas
    && for f in $(ls schemas/*.json | egrep -v '(coverage|representationTests).json');
       do sh bin/makeTsTests.sh _ts $f; done
    && tsc --noEmit _ts/schemas/*.ts && rm -r _ts

The same commit added `@types/shexj ^2.1.2` and touched only `doc/ShExJ.jsg`,
`doc/ShExR.shex`, `package.json` and `package-lock.json`. It added no script
and no `typescript` dependency.

`bin/makeTsTests.sh` was never committed:

- no path matching `*makeTs*` in any commit on any branch;
- the string occurs in two commits only, `630f48b` (the line above) and
  `0f45c51` (a CI comment about it);
- no `.sh` or `.ts` file has ever been added to the repo;
- none of the five commits either side of `630f48b` adds a script, and across
  every branch from late June to October 2022 the only file added outside the
  test directories was `package-lock.json`;
- `shex-test@2.2.0-alpha.1`, the last version on npm, was published nine days
  earlier (2022-08-19) and its tarball has no such file;
- a filename search of the maintainer's machine found nothing.

So `npm test` could not pass anywhere but the working directory it was written
in, from the day it was written.

## What happened next

- `0f45c51` (2026-07-16) added CI. It ran the working steps individually, with
  a comment that `test-ts` was broken, and appended `test-schema-imports` to
  `test` in front of the broken step.
- `2a1310d` and `5866f25` (2026-08-06) appended `vocab-check` and `shexr-check`
  the same way. `7f5c8a9` (2026-10-06) did it again with `test-manifest-names`.
- 2026-10-06: `test-ts` removed, CI changed to call `npm test`.

## What the script was for (inference)

The dates line up:

| When (UTC) | What |
|---|---|
| 2022-08-19 02:15 | `shex-test@2.2.0-alpha.1` published |
| 2022-08-19 05:01 | DefinitelyTyped PR #61808 opened, "upgrade shexj to shex-test@2.2.0-alpha.1" - `@types/shexj` 2.1.2 |
| 2022-08-21 07:48 | PR #61839, "shexj: add Shape.extends", which also adds an `Extend3G` test - 2.1.3 |
| 2022-08-28 | `630f48b` adds `test-ts` here |
| 2023-01-15 | PR #63920, "add names for shexj value types" - 2.1.4 |

The likely story: the script wrapped each schema as a typed constant so that
`tsc` could check the upgraded types against the whole corpus, it found that
2.1.2 lacked `Shape.extends`, and it stayed an untracked file. Nothing in the
history states this.

## The reconstruction

On 2026-10-06 the check was rebuilt as a throwaway: one generated `.ts` per
schema, `import type {Schema} from "shexj"; const schema: Schema = <json>`,
then `tsc`. All 491 schemas type-checked against `@types/shexj` 2.1.7 in about
a second (TypeScript 7).

Probes written at the same time, to learn what the check can see:

| Document | Types | ShExJ.jsg (then) |
|---|---|---|
| `"type": "Schemas"` | reject | reject |
| `ShapeDecl` without `id` | reject | reject |
| unknown `nodeKind` | reject | reject |
| `Shape` with `abstract` | reject | **accept** - fixed in the JSG |
| `IriStemRange` without `exclusions` | reject | **accept** - fixed in the JSG |
| `ShapeAnd` with one conjunct | **accept** | reject |
| `"shapes": []` | **accept** | reject |
| `min: 1.5`, predicate not an IRI | **accept** | reject |

The last three are inexpressible in TypeScript's type system, not bugs.
