# Git push prompt (reusable)

Paste the block below into a new chat when you want Claude to commit, tag,
and push frontend changes to GitHub — instead of re-explaining the setup
each time. Only run this when explicitly asked; it is NOT automatic.

```
Push the current changes in "Admin Panel/frontend" to GitHub, following the
established TripAgent workflow:

REPO: https://github.com/TRIPAGENT/TRIPAGENT-FE — private repo, org
TRIPAGENT. main is the default branch; the developer pulls from main.

AUTH: gh CLI is already installed (Homebrew) and authenticated in this
environment as GitHub user nidhi-baliga-y4 (`gh auth status` to confirm;
if it's no longer authenticated, run `gh auth login --hostname github.com
--git-protocol https --web` and hand me the one-time code + URL to
complete in a browser, then `gh auth setup-git`). Local git identity for
this repo is already set (user.name "nidhi-baliga-y4", user.email the
GitHub noreply address) — don't reconfigure unless it's missing.

HISTORY: v0 (tag) is the initial commit — a full replacement of the old
Vite/JSX advisor-panel history that used to live on main. Every push since
then is normal, additive git history on top of v0. Do NOT force-push again
without explicit new authorization — v0's force-push was a one-time,
explicitly authorized replacement of the old repo content, not a standing
permission.

VERSIONING: tags are v0, v0.1, v0.2, v0.3, ... — not strict semver, just
sequential. Not every commit gets a tag; only meaningful checkpoints
(roughly: a batch of related changes, or whenever asked). Ask me what the
next tag number should be if it's ambiguous, or just increment the last
minor number (v0.3 -> v0.4) if it's obviously the next one.

STEPS:
1. cd into "Admin Panel/frontend".
2. Run `git status` — review what changed. Never stage/commit .env.local
   or any file with real secrets (the repo's .gitignore already excludes
   .env* except .env.example — don't override that).
3. `git add -A` (or add specific files if some changes shouldn't ship
   yet — ask me if unsure), then `git commit -m "..."` with a message
   describing the actual change (check DESIGN-CHANGES.md's most recent
   entries for what changed and why, since that log is kept up to date
   alongside the code).
4. `git push origin main`.
5. If this checkpoint should be tagged: `git tag -a vX.Y -m "..."` then
   `git push origin vX.Y`.
6. Confirm back to me what was pushed (commit message, tag if any, and a
   link to the repo).

Do not run any of this until I explicitly ask in that specific chat turn —
"push this", "commit and push", "tag this as vX.Y", etc. Setting up this
reference file is not itself a standing instruction to push automatically.
```
