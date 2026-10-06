---
name: repo-history
description: How to answer "when did this show up", "was there ever a file called…", "who added this and why" or "has this always been broken" for shexTest, using git history plus the two places history leaks out of the repo - npm tarballs and DefinitelyTyped. Use this for any question about the past of a script, check, dependency or grammar rule here, and before concluding that something "never existed".
---

# Finding out what happened

Answer with evidence and say which parts are inference. The maintainer often
asks these questions to decide whether to delete something, so "never existed
in any commit on any branch" and "I did not find it" must not be confused.

## In git

```sh
# when did a string enter or leave? (all branches)
git log --all --format='%h %ad %an | %s' --date=short -S'test-ts' -- package.json

# how did one line evolve?
git log --format='--- %h %ad %s' --date=short -L'/"test":/,+1:package.json'

# was a file ever added, under any name like this?
git log --all --diff-filter=A --name-only --format='--- %h %ad %s' --date=short -- '*makeTs*' '*.sh' 'bin/*'

# N commits either side of a commit
git log -6 --name-status REV                                        # it and 5 ancestors
git log --reverse --ancestry-path --name-status REV..origin/main | head -60   # descendants

# everything added on any branch in a window (side branches hide from the above)
git log --all --since=2022-06-25 --until=2022-10-31 --diff-filter=A --name-only
```

`-S` finds commits that change the *number* of occurrences; use `-G` for a
regex over changed lines. "Five commits either side" is ambiguous across
merges, so also do the date-window search over `--all`.

Subjects are prefixed `+` (added), `~` (changed), `-` (removed), which makes
`git log --oneline -- path` quick to skim.

## Outside git

**npm.** `npm publish` ships the working directory, tracked or not, so a
tarball can contain a file git never saw.

```sh
npm view shex-test time --json                 # versions and publish dates
mkdir empty && cd empty && npm pack shex-test@2.2.0-alpha.1 && tar tzf *.tgz
```

List the tarball; do not run anything from it. Note that `package.json` has a
`"file"` key, not `"files"`, so there is no allow-list: on 2026-10-06
`npm pack --dry-run` listed 2044 files (the repo tracks 2046), `.github/`
among them.

**DefinitelyTyped**, for the TypeScript types:

```sh
gh api 'repos/DefinitelyTyped/DefinitelyTyped/commits?path=types/shexj&per_page=40' \
  --jq '.[] | "\(.sha[0:8]) \(.commit.author.date[0:10]) \(.commit.author.name) | \(.commit.message | split("\n")[0])"'
gh api repos/DefinitelyTyped/DefinitelyTyped/pulls/61808 --jq '.title, .created_at, .merged_at'
npm view @types/shexj time --json
```

Lining up dates across the three (a shex-test release, a DefinitelyTyped PR
hours later, a commit here the next week) is often what explains a change.

**The maintainer's machine**: `mdfind -name makeTsTests` finds untracked files
by name. An old checkout or backup is the only place an uncommitted script
survives.

## Already established - do not redo

- `test-ts` and `bin/makeTsTests.sh`: see
  `.claude/skills/shexj-types/references/history.md`.
- No `.sh` or `.ts` file has ever been committed on any branch (as of
  2026-10-06).
- `validation/*.val` files were removed in 8d5b0b3 (2023-03-14); the
  `test-shexv-val` script still globs for them and matches nothing.
