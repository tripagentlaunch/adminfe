# Git push prompt (reusable)

Paste the block below into a new chat when you want Claude to commit, tag,
and push frontend changes to GitHub — instead of re-explaining the setup
each time. Only run this when explicitly asked; it is NOT automatic.

```
Push the current changes in "Admin Panel/frontend" to GitHub, following the
established TripAgent workflow:

REPO: https://github.com/TRIPAGENT/TRIPAGENT-FE — private repo, org
TRIPAGENT. Two branches, two different jobs (set up 2026-09-01):
  - main — stable, developer-facing. Only ever updated when the team has
    confirmed they actually want a given version pulled in. Never push
    routine/incremental work straight to main.
  - Demo — where all day-to-day iteration goes. Every v0.1, v0.2, v0.3...
    checkpoint is committed AND tagged on Demo, pushed there. This is the
    default branch to be on and push to unless told otherwise.

AUTH: gh CLI is already installed (Homebrew) and authenticated in this
environment as GitHub user nidhi-baliga-y4 (`gh auth status` to confirm;
if it's no longer authenticated, run `gh auth login --hostname github.com
--git-protocol https --web` and hand me the one-time code + URL to
complete in a browser, then `gh auth setup-git`). Local git identity for
this repo is already set (user.name "nidhi-baliga-y4", user.email the
GitHub noreply address) — don't reconfigure unless it's missing.

HISTORY: v0 (tag, on main) is the initial commit — a full replacement of
the old Vite/JSX advisor-panel history that used to live on main. Demo was
branched from main right after. Do NOT force-push without explicit new
authorization — v0's force-push was a one-time, explicitly authorized
replacement of the old repo content, not a standing permission.

OVERRIDE RULE (2026-09-02, standing): Demo can NEVER be overridden —
every push there must be a new, additive commit on top of its existing
history (plain `git push origin Demo`, fast-forward only, never `--force`,
never rebase/rewrite/amend a commit that's already pushed). The whole
point is that every prior checkpoint stays reachable so a rollback never
loses progress. main is the ONLY branch that may ever be overridden
(force-pushed/reset) — and even then, only when whatever is being pushed
to main is ALREADY a known commit/tag that exists on Demo. Never force-push
to main something that isn't traceable back to a real Demo checkpoint.

VERSIONING: tags are v0, v0.1, v0.2, v0.3, ... — not strict semver, just
sequential — and they live on Demo (v0 itself is the one exception, sitting
on main as the starting point both branches share). Not every commit gets
a tag; only meaningful checkpoints (roughly: a batch of related changes, or
whenever asked). Ask what the next tag number should be if it's ambiguous,
or just increment the last minor number (v0.3 -> v0.4) if it's obviously
the next one.

DAY-TO-DAY STEPS (Demo):
1. cd into "Admin Panel/frontend"; confirm/switch to the Demo branch
   (`git checkout Demo` — create it from main with `git checkout -b Demo
   main` only if it's somehow missing locally; it already exists on
   origin).
2. Run `git status` — review what changed. Never stage/commit .env.local
   or any file with real secrets (the repo's .gitignore already excludes
   .env* except .env.example — don't override that).
3. `git add -A` (or add specific files if some changes shouldn't ship
   yet — ask if unsure), then `git commit -m "..."` with a message
   describing the actual change (check DESIGN-CHANGES.md's most recent
   entries for what changed and why, since that log is kept up to date
   alongside the code).
4. `git push origin Demo`.
5. If this checkpoint should be tagged: `git tag -a vX.Y -m "..."` then
   `git push origin vX.Y`.
6. Confirm back what was pushed (commit message, tag if any, branch, link
   to the repo).

PROMOTING TO MAIN (only when explicitly asked, e.g. "push vX.Y to main" /
"the devs want this one"):
1. Confirm exactly which point on Demo should become the new main — by
   default the latest commit/tag there, unless told otherwise.
2. `git checkout main && git merge --ff-only Demo` (or, if history
   diverged and a fast-forward isn't possible, ask before doing anything
   else — do not force-push or rewrite main without explicit
   authorization, same rule as the original v0 replacement).
3. `git push origin main`.
4. Confirm back what main now points to.

Do not run any of this until explicitly asked in that specific chat turn —
"push this", "commit and push", "tag this as vX.Y", "push vX.Y to main",
etc. Setting up this reference file is not itself a standing instruction to
push automatically, on Demo or on main.
```
