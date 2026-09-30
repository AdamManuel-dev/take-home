# GitHub setup and submission

Prepare a reviewable repository and publish it to the account you choose.

## What is configured

`.github/workflows/ci.yml` checks every push and pull request, and supports manual runs.
Its `Verify` job installs the lockfile dependencies with Node from `.nvmrc`, then runs
`npm run verify`. It has read-only repository permission and does not deploy anything.
No application secrets or external services are required. GitHub-hosted execution is only
verified after the first push; local checks do not prove that the hosted workflow passed.

The [pull request template](../.github/pull_request_template.md) asks for the behavior change
and validation evidence. `.gitignore` excludes runtime schedules, environment files,
dependencies, build output, and the unrelated local `agent-skills/` reference library.

## Create the first commit

Run from the project root. Initialize only if `.git/` does not already exist:

```sh
git init -b main
```

Review the files before committing:

```sh
npm run verify
git status --short
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "feat: add staff availability scheduler and project documentation"
```

Confirm that schedules, credentials, logs, and local reference playbooks are absent from the
staged list. The original interview PDF is not required in the submission repository.
If Git requests an author identity, configure your own name and email locally before committing.

## Publish with GitHub CLI

Choose an owner, repository name, and visibility. The following example uses a private
repository; replace `OWNER/REPOSITORY` before running it:

```sh
gh auth login
gh repo create OWNER/REPOSITORY --private --source=. --remote=origin --push
gh repo view --web
gh run list --limit 5
```

Use `--public` only if that is your intended visibility. For private submissions, grant the
interviewers repository access through GitHub's repository settings. Do not assume they can
open a private URL. The commands follow the official
[GitHub CLI repository guide](https://cli.github.com/manual/gh_repo_create).

## Publish without GitHub CLI

Create an empty repository on GitHub without initializing a README, license, or gitignore.
Use its displayed remote URL:

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

If `origin` already exists, inspect `git remote -v` and use the intended remote; do not replace
it blindly. See GitHub's
[existing-code instructions](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## After the first push

1. Open Actions and confirm the CI / Verify job passes for the submitted commit.
2. Review the rendered README and linked documentation.
3. Clone into a fresh directory and follow [setup](setup.md), including the optional demo.
4. Complete the personal confirmations in [AI usage](ai-usage.md).
5. Check [requirements and submission](requirements.md), then share the repository URL.

For later changes, use a branch, run `npm run verify`, and open a pull request. Optional branch
rules can require the `Verify` status check after its first successful run. This is a repository
setting, not something the workflow file enables automatically.

The workflow uses the documented [checkout](https://github.com/actions/checkout) and
[setup-node](https://github.com/actions/setup-node) actions. CI intentionally covers the
committed automated suite; manual browser checks are described separately.
