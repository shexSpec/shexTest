---
name: adding-a-check
description: How to add, change or remove an automated consistency check in shexTest - a bin/ script, an npm `test-*` script, or a step in .github/workflows/ci.yml - and how to prove it works. Use this whenever the user asks to "verify that…", "make it a CI test", "wire it into npm test", or when you find yourself writing a one-off script to check the repo that would be worth keeping. Also use it before editing ci.yml or the `test` script in package.json for any reason.
---

# Adding a check

## Where a check goes

Everything that can run locally goes in `npm test`. CI runs `npm test` and does
not list checks individually:

1. `bin/checkSomething.js`, executable, exits 1 on any problem.
2. `"test-something": "bin/checkSomething.js"` in `package.json`.
3. `&& npm run test-something` in the `test` chain.
4. One line in the comment above `- run: npm test` in `ci.yml`, saying what it
   guards. No new step.

The reason is history, not taste. For four years `npm test` could not pass
(it ended in a step whose script was never committed), CI was written to run
the working steps one by one, and that commit and three after it extended
`test` without anyone noticing. One command, run in both places, cannot rot
that way.

A CI-only step is justified only when the check cannot be part of `npm test`.
The two that exist: regenerating `manifest.jsonld` and diffing (it rewrites
tracked files), and `missing.js` (informational, must not fail).

Do not rename the `test` job; the branch ruleset and Dependabot auto-merge key
on that name.

## What a good check looks like here

- **The header comment says why.** State the rule, then the incident that
  showed it was needed. `ci-red` points people at these headers to explain a
  failure, so a header that only restates the code wastes the one place the
  reason is kept.
- **Each problem is one line: `path: what is wrong`.** End with how to fix it,
  including the command.
- **Parse, do not grep.** Turtle goes through N3.js. But read `manifest.jsonld`
  as plain JSON, because that is how its consumers read it; the strings have to
  match as written.
- **A check mode writes nothing.** Generators take `--check` (`mkShExR.js`,
  `mk_vocab.js`). Scratch files go under `os.tmpdir()` and are removed. The old
  `test-ts` left an empty `_ts/` in the checkout every time it failed.
- **Match the file you are in.** Newer scripts (`mkShExR.js`,
  `checkManifestNames.js`) are `'use strict'`, `const`, arrow functions.
  Older ones (`genJSON.js`, `checkSchemaImports.js`) are `var` and
  `function name (args)`.

## Prove that it bites

A check that passes on the current tree has shown nothing yet. Before reporting
it done:

1. Run it on the tree: it should pass, or find real problems worth reporting.
2. If the check was prompted by a bug that has been fixed, run it on the commit
   before the fix (`git show REV:path > scratch/path`). It should report exactly
   that bug.
3. For each rule the check claims, make a copy of a small real input
   (`validation-contrib/` is the smallest manifest), break that one rule, and
   confirm the message. Keep the copies in a scratch directory.
4. Run `npm test` and the CI rehearsal in the `ci-red` skill.

Tell the user which of these you did. "Passes" and "passes, and fails on these
nine broken inputs" are different claims.

## Conventions for the commit

Subjects in this repo start with what happened: `+` added, `~` changed, `-`
removed.

```
+ bin/checkManifestNames.js: test ids must match their mf:names
~ synchronize validation/manifest names to ids
- sx:negated; + ShapeDecl/abstract/imports to the vocabulary
```

The body says why, and names the commit or test that motivated it.

`main` requires the `test` check, but repository roles can bypass that, and the
maintainer does push to `main` directly. CI only runs before merge for pull
requests. Ask which they want if it is not clear; do not push without being
asked.
