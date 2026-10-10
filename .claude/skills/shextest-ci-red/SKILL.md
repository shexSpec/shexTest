---
name: shextest-ci-red
description: Diagnose why shexTest is red and say what to do about it - a failing `npm test`, a failed GitHub Actions run, or a Dependabot PR that has not auto-merged. Use this whenever a check fails, whenever the user asks "why is CI red", "what broke", "why didn't that merge" or "is this safe to push", and before telling the user that a change to manifests, schemas, doc/ShExJ.jsg, doc/ShExR.*, vocab/ or package.json is green. Use it even if the failure looks obvious; several of these checks fail for reasons that are not in the diff.
---

# Why is shexTest red?

The user maintains this repo in bursts, months apart, and wants to be told
**which** check failed, **why** it exists, and the **one thing to do**. Lead
with that. Quote the failing line. Say whether the cause is the change in hand
or something that moved upstream (a new release of a dependency).

## How CI is put together

`.github/workflows/ci.yml` has one job, named `test`. The name matters: the
"Require CI on main" ruleset requires a status check called `test`, and
`dependabot-auto-merge.yml` relies on that to hold Dependabot PRs until it
passes. Renaming the job silently un-gates `main`.

The job runs, in order:

1. `npm ci`
2. **manifest.jsonld matches manifest.ttl** - CI only. Regenerates
   `manifest.jsonld` in `schemas`, `validation` and `negativeSyntax` and fails
   on any `git diff`.
3. **`npm test`** - everything else. CI calls the same command a contributor
   runs so the two cannot drift apart. They did once: see "History" below.
4. `node missing.js` - informational, cannot fail the job.

## Reproduce first

```sh
npm ci && npm test          # stops at the first failing script
gh run view --log-failed    # for a run on GitHub
```

`npm test` is an `&&` chain, so the last `> shex-test@… <script>` banner printed
is the script that failed.

## The checks

| Script | Guards | Red looks like | Fix |
|---|---|---|---|
| CI step 2 | `manifest.jsonld` is generated from `manifest.ttl` | `manifest.jsonld is stale` | `(cd DIR && ../bin/genJSON.js manifest.ttl > manifest.jsonld)` and commit |
| `test-shexj-jsg` | every `schemas/*.json` conforms to `doc/ShExJ.jsg` | `errors: [ Error: Testing "shapes": …` | the schema or the grammar is wrong; see the `shextest-grammar` skill |
| `test-shexj-types` | every `schemas/*.json` type-checks against the installed `@types/shexj`, except those listed as ahead of it | `schemas/X.json:N: not accepted by @types/shexj V` or a line about `AHEAD` | the `shextest-shexj-types` skill has a table of these messages |
| `test-shexv-val`, `test-shexv-err` | `validation/*.{val,err}` conform to `doc/ShExV.jsg` | same shape of error | fix the result file or the grammar |
| `test-schema-imports` | every `schemas/*.shex` IMPORT target has its own manifest entry | a name under `MISSING manifest entry` or `BROKEN reference` | add the entry to `schemas/manifest.ttl`, regenerate |
| `test-manifest-names` | a test's id and its `mf:name` are the same string, in both serializations, in all five manifest dirs | `validation/manifest.ttl: #x is named "y"` | see the `shextest-manifests` skill |
| `manifest-ld-check` | `manifest-ld.{jsonld,ttl}` are what `manifest-ld.yaml` says | a file named as not what would be written | `npm run manifest-ld` and commit |
| `manifest-ld-legacy-check` | `manifest-ld.yaml` is what `manifest.ttl` says, and the legacy files are derivable from it (six checks per dir) | `validation: 3 of 6 checks fail` and which | after editing `manifest.ttl`: `node bin/manifest-ld-from-legacy.js DIR/manifest.ttl -o DIR/manifest-ld.yaml && npm run manifest-ld`; the `shextest-manifest-ld` skill has the rest |
| `vocab-check` | `vocab/vocab.csv` defines every `sx:` term `doc/ShExR.shex` uses | `doc/ShExR.shex uses N term(s) absent from vocab.csv` | correct ShExR.shex, or add the term to vocab.csv and `npm run vocab` |
| `shexr-check` | `doc/ShExR.{json,ttl,ntriples}` match `doc/ShExR.shex` | `doc/ShExR.ttl is not what doc/ShExR.shex generates` | `npm run shexr` and commit; `ShExR.json` is hand-edited to match |

Each script's header comment gives the incident that motivated it. Read it
before explaining a failure; it is usually the "why" the user is asking for.

`test-shexj-types` is the one check that can go red because of a release
elsewhere rather than a change here. The `shextest-shexj-types` skill explains it and
its Dependabot PRs.

## Output that looks like a failure and is not

- `checkSchemaImports` prints a `KNOWN/DEFERRED` list (five entries in
  2026-10). Those have commented-out draft entries in `schemas/manifest.ttl` and
  do not fail the check.
- `node missing.js` prints three `extends-…` schemas that validation tests
  reference but `schemas/manifest` does not list. Known and informational.
- `npm ci` prints an audit summary.
- `manifest-ld-legacy-check` takes several seconds; `manifest-ld` fetches the
  Test extension's context from shexspec.github.io unless a sibling
  `../extensions` checkout exists, so it needs the network (and that context
  published).

## Known weak spots

Say these out loud when they are relevant, rather than letting a green run
imply more than it proves.

- **`test-shexv-val` checks nothing.** There are no `validation/*.val` files
  (they were removed in 8d5b0b3, 2023), so the glob is empty. Only the three
  `.err` files are checked.
- **Step 2 skips two directories.** `negativeStructure` and
  `validation-contrib` are not regenerated. The workflow comment says
  `negativeStructure` is excluded because its jsonld lacks
  `Cycle2ExtendsNegation`; that is out of date. On 2026-10-06 both directories
  regenerated to identical files, so the exclusion could be lifted.
  `test-manifest-names` does cover both for ids, order and names.
- **Almost nothing tests that a grammar rejects anything.** The fixtures are
  positive, apart from three must-reject documents for the TypeScript types in
  `bin/checkShExJTypes.js`. A JSG production that is too permissive passes
  every check.

## Dependabot PR open and unmerged

The auto-merge workflow only *enables* auto-merge; GitHub merges once `test`
passes. So an old open Dependabot PR means `test` failed on it. Read the failed
step as above; for `@types/shexj` it usually means the new release does not
contain a change this repo is waiting for (the `shextest-shexj-types` skill). Dependabot
checks npm weekly, so a bump can also simply not have been proposed yet.

## Before saying "this is green"

A local `npm test` is not the whole job. Rehearse the job when the change
touches a manifest, the workflow or `package.json`:

```sh
git clone -q . "$SCRATCH/ci" && cd "$SCRATCH/ci"
git -C "$OLDPWD" diff | git apply        # carry uncommitted work across
npm ci
for d in schemas validation negativeSyntax; do (cd $d && ../bin/genJSON.js manifest.ttl > manifest.jsonld); done
git diff --exit-code -- '*/manifest.jsonld'
npm test && node missing.js
```

CI runs Node 20 on Ubuntu. Say so if you only ran it elsewhere.

## History

`npm test` was broken from 2022-08-28 (630f48b) until 2026-10: it ended in a
`test-ts` step that called `bin/makeTsTests.sh`, a script that was never
committed. When CI arrived (0f45c51, 2026-07-16) it ran the other steps one by
one to avoid it, and three later commits extended `test` without noticing it
could not pass. That is why CI now calls `npm test` and nothing else, and
`test-shexj-types` is what `test-ts` was meant to be. The details are in
`shextest-shexj-types/references/history.md`.
