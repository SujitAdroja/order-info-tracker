---
name: review-before-ship
description: Required before any git commit, git push, merge, or production deploy in the KeepTrack project. Checks the work, shows the owner a review (changes, risks, test results, proposed commit message), and waits for their explicit approval of each step. Use whenever work is ready to commit, push, merge or deploy, or when the owner asks to "commit", "push", "ship", "merge" or "deploy".
---

# Review before commit, push, merge or deploy

The project owner reviews every change before it leaves the working tree. **Nothing is
committed, pushed, merged or deployed until the owner explicitly approves that exact step
in this conversation.** If in doubt, stop and ask.

## Rules

1. **No approval, no action.** Each of these needs its own explicit "yes" to the review
   you showed:
   - `git commit`
   - `git push`
   - merging (`git merge`, merging a pull request, rebasing onto `main`)
   - production deploys (`vercel deploy --prod`) and production database migrations
2. **Approval covers only what was shown.** If anything changes after approval (a fix, a
   formatting pass, an extra file), review again before acting.
3. **Approval doesn't carry over.** Approving a commit doesn't approve the push; approving
   one push doesn't approve the next one.
4. **Silence, "looks good so far" or a question isn't approval.** Wait for a clear go-ahead
   such as "approve", "commit it", "yes, push".
5. **Never** use `--force`, `--no-verify`, amend a pushed commit, or rewrite history
   unless the owner asks for that specifically.

## Steps

### 1. Check the work

Run these from the project root and note the results for the review:

```bash
npx prettier --write .
npx eslint .
npx tsc --noEmit
npx vitest run
```

- If app code, routes, or UI changed, also run the browser suite (it takes ~10 minutes, so
  run it in the background):
  `rm -f .next-e2e/dev/lock && npx playwright test --reporter=list`
- Run `npm run build` when config, routes, or server code changed.
- If something fails, fix it or report it in the review; never hide a failure.

### 2. Collect what's changing

```bash
git status --short
git diff --stat
git diff            # read it; summarise, don't paste it all
git log origin/main..HEAD --oneline   # commits not yet pushed
```

Then check for anything that needs special attention:

- **Secrets:** `.env`, `.env.local`, keys or tokens must never be staged. `.env*` is
  git-ignored except `.env.example`; confirm with `git status --short --ignored` if unsure,
  and grep the diff for `re_`, `whsec_`, `sk-ant-`, `BEGIN PRIVATE KEY`.
- **New dependencies** in `package.json`: say what each is for.
- **Database migrations** (`drizzle/*.sql`): production also needs
  `npx drizzle-kit migrate` with the Neon `DATABASE_URL_UNPOOLED`, which is a separate
  approval.
- **Production-facing changes:** env vars, `vercel.json`, cron, auth, email sending.

### 3. Show the review and ask

Present this to the owner (plain language, short):

```
## Review: <one-line summary>

**What changed**
- <area>: <what and why> (files…)

**Checks**
- Lint ✅ · Types ✅ · Unit tests 241/241 ✅ · Browser tests 48/48 ✅ (or what failed)

**Needs your attention**
- <new dependency / migration / env var / risk>, or "Nothing unusual"

**Proposed commit message**
<subject line>

<body>

**After approval I will:** commit → (push to origin/main) → (deploy / migrate)
```

Then ask with the AskUserQuestion tool, one decision at a time. Offer options like:

- "Approve commit only"
- "Approve commit and push"
- "Approve commit, push and deploy" (only when a deploy is relevant)
- "Request changes" (then make them and return to step 1)

Stop and wait for the answer. Do not commit while waiting.

### 4. Do exactly what was approved

- Commit with the approved message. Keep the attribution trailer the session asks for.
- Push only if the push was approved. This repo pushes to
  `git@github.com:SujitAdroja/order-info-tracker.git` as the personal account (repo-local
  `user.name`/`user.email` and `core.sshCommand` are already set; don't change them).
- Merge only if a merge was approved, and show the branch's commits and diff against the
  target first.
- Deploy or migrate production only if approved; afterwards smoke-test
  `https://order-info-tracker.vercel.app` and report the results.

### 5. Report

Say what was done (commit hash, push result, deploy URL) and anything still pending.
