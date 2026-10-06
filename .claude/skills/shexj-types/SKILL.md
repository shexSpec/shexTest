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

## The type check and its gate

`bin/checkShExJTypes.js` (`npm run test-shexj-types`, part of `npm test`)
type-checks every `schemas/*.json` against the installed `@types/shexj`. It
also holds three documents the types must reject, so that some of the other
direction is covered and a `tsc` that silently checks nothing is noticed.

Rather than wait for a release, a change lands at once and records which
schemas are ahead of the types, in the `AHEAD` table at the top of the script:

```js
const AHEAD = {
  'newFeature': '2.1.7',  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/NNNNN
};
```

The version is the newest `@types/shexj` known **not** to accept that schema.

- While that version or an older one is installed, the schema is **expected to
  fail**, and the check passes.
- Once a newer one is installed - which first happens in Dependabot's bump PR -
  the schema **must pass**. If the DefinitelyTyped change is right, the bump is
  green and merges itself. If that release did not contain the fix, the bump
  goes red and stays open, which is the right signal.

Nothing is red in between, so Dependabot's weekly schedule costs nothing.

### What the maintainer does

When ShExJ gains something the published types do not have:

1. Change `doc/ShExJ.jsg`, add the schemas and manifest entries, run `npm test`.
2. The type check fails and prints one line per rejected schema, ready to
   paste. Paste them into `AHEAD`. Add the DefinitelyTyped PR as a comment once
   it exists.
3. `npm test` again: green, with a `waiting on a release…` line. Merge.
4. Change the types in DefinitelyTyped (below).
5. Nothing. Dependabot proposes the bump within a week of the release and it
   merges when green.
6. Whenever convenient, delete the entries the check lists as
   `AHEAD entries that … can be deleted`. They are inert until then.

Tightening the JSG to match what the types already say needs none of this.

### What each red message means

| Message | Where it shows up | Meaning | Do |
|---|---|---|---|
| `schemas/X.json:N: not accepted by @types/shexj V: …` | your change | X uses something the types lack, or X is wrong | if X is right, paste the printed line into `AHEAD` |
| `AHEAD says V does not accept this, but @types/shexj V does; delete the entry` | your change | the entry was never needed | delete it |
| `AHEAD expected a release after V to accept this, but @types/shexj W does not` | Dependabot's bump to W | W came out without the fix: an unrelated release (2.1.5 to 2.1.7 were), or the fix is incomplete | on `main`, raise that entry to W, then comment `@dependabot rebase` on the bump (or wait for it to rebase itself) and it goes green. Then finish the DefinitelyTyped change |
| `@types/shexj V accepts <something>; it and doc/ShExJ.jsg now disagree` | a bump, or an edit to `MUST_REJECT` | the types were loosened past the JSG | decide which is right; fix the other |
| `AHEAD lists 'X', but there is no schemas/X.json` | your change | a schema was renamed or removed | fix or delete the entry |
| `typescript and @types/shexj are not installed` | locally | no `node_modules` | `npm ci` |

A Dependabot PR for `@types/shexj` that sits open is almost always the third
row. Tell the user that in those words: the new release is not the one that
contains their change.

The gate was tested by replaying 2022: with 2.1.2 installed (before
`Shape.extends`), 22 schemas fail; listed in `AHEAD` at 2.1.2 they are expected
failures; with 2.1.3 installed they must pass, and do.

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
