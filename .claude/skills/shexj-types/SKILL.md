---
name: shexj-types
description: Everything about the TypeScript types for ShExJ (`@types/shexj`, maintained in DefinitelyTyped) and how shexTest stays in step with them - what a type check of the schemas can and cannot prove, why a change here has to wait for a release there, the version gate that keeps CI green meanwhile, and how to land a change in DefinitelyTyped. Use this whenever doc/ShExJ.jsg gains or loses something, a schema uses a construct the types lack, a Dependabot PR for @types/shexj is open or red, someone mentions DefinitelyTyped, `tsc`, `test-ts` or makeTsTests.sh, or the user asks why something about types is failing or what they are supposed to do next.
---

# The TypeScript types for ShExJ

## What they are and who runs them

- The types live in DefinitelyTyped, `types/shexj/` (`index.d.ts`,
  `shexj-tests.ts`). There is no `shexj` package on npm; the package is marked
  `nonNpm` and the name is unclaimed.
- The sole listed owner is the maintainer of this repo (`ericprud`). The three
  substantive PRs so far were merged by DefinitelyTyped's bot ("🤖 Merge PR
  #… by @ericprud").
- `master` there is published automatically to npm as `@types/shexj`. The
  `package.json` says `2.1.9999`; the publisher assigns the patch number, so the
  next release after 2.1.7 is 2.1.8 whatever it contains.
- Timings from the three substantive PRs (2022-2023): **27 to 35 hours** from
  opening to merge, then **5 to 23 minutes** from merge to npm.
- Releases 2.1.5 to 2.1.7 (2023) were repository-wide reformatting by
  DefinitelyTyped staff, not changes to the types. So a new version does not
  mean the types changed.
- The header of `index.d.ts` says what it conforms to
  (`shex-test@2.2.0-alpha.1` as of 2.1.7). Update it with the types.
- Consumers include `@shexjs/parser` and `@shexjs/term`; about 5,500 downloads
  a week in 2026-10.

DefinitelyTyped's own test is `shexj-tests.ts`: hand-written fragments plus
pasted copies of two schemas from here (`kitchenSink`, `Extend3G`). It is
type-checked, never run, and only when a PR touches `types/shexj`. It cannot
run a generator over this corpus, and non-`@types` dependencies need a
maintainer-approved allow-list entry. So the corpus-wide test has to live here,
which is also where drift starts.

## What type-checking the schemas proves

Wrap each `schemas/*.json` as `const schema: Schema = {…}` and run `tsc`. (The
wrapping is necessary: importing the JSON widens `"type": "Schema"` to
`string`, and nothing would check.)

It proves the types accept everything the corpus contains - that they are not
missing a property or too strict.

It cannot see:

- **What types cannot express.** A one-conjunct `ShapeAnd`, an empty `shapes`
  array and `min: 1.5` all type-check; `ShExJ.jsg` rejects all three.
- **What the corpus does not exercise.** Two real disagreements with the JSG
  (`Shape.abstract`, optional `IriStemRange.exclusions`) passed with all 491
  schemas because none used them. They were found by reading the two grammars
  side by side; see the `changing-the-grammar` skill.

So a green type check is evidence about the types, not about the schemas -
`test-shexj-jsg` is the stronger test of a schema.

## Why a change here has to wait, and why nothing triggers on it

When ShExJ gains something, the schemas that use it are rejected by the
published types until a DefinitelyTyped PR merges and publishes, a day or two
later. Things that do **not** work for bridging that gap, so nobody rebuilds
them:

- **There is no push signal.** Neither npm nor DefinitelyTyped can notify this
  repo of a release. Anything "triggered by a release" is a poll.
- **The poll already exists.** Dependabot checks npm weekly and opens a bump
  PR; `dependabot-auto-merge.yml` merges it when `test` passes. That is already
  a merge triggered by a newly published `@types/shexj`.
- **A waiting PR cannot ride along on its own.** After the bump lands on
  `main`, the waiting PR needs a fresh CI run. Re-running a workflow reuses the
  original merge commit, so it never sees the new lockfile; and anything a
  workflow does with the default token does not start other workflows. Making
  this work needs a scheduled workflow and a personal access token.

## The design: a version-gated expected failure

Do not wait. Land the change, and record that the affected schemas are ahead
of the types as of a named version:

    'newFeature': '2.1.7'     # not accepted by @types/shexj 2.1.7 or earlier

- While the installed `@types/shexj` is 2.1.7 or older, that schema is
  **expected to fail** the type check, and the check passes.
- Once a newer version is installed - which happens in Dependabot's bump PR -
  the schema **must pass**. If the DefinitelyTyped fix is right, the bump is
  green and auto-merges. If the release did not contain the fix, the bump goes
  red and stays unmerged, which is the right signal.

Nothing is red in the meantime, and the lag in Dependabot's weekly schedule
costs nothing.

**Status (2026-10-06): designed and agreed, not yet built.** There is no type
check in `npm test` at this commit; `test-ts` was removed and this replaces it.
When it exists, this section is replaced by how to use it.

## Changing the types in DefinitelyTyped

1. Fork and clone DefinitelyTyped.
2. Edit `types/shexj/index.d.ts`. Keep the TSDoc comments; they are the reason
   the file is hand-written. Update the "Conforms to" header.
3. Add a case to `types/shexj/shexj-tests.ts` that fails without the change.
4. `pnpm install -w --filter "{./types/shexj}..."` then `pnpm test shexj`.
5. Open the PR. Expect about a day and a half to merge, then minutes to npm.
6. Leave the rest to Dependabot here.

## History

`references/history.md` has the full account of the lost `test-ts` /
`bin/makeTsTests.sh` check (2022-2026) and the evidence for it. Read it before
answering anything about why there was a four-year gap.
