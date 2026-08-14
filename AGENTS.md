# Repository Agent Guidelines

## Canonical source
This repository is the canonical implementation source for TKU Interview Assistant.

## Branching
- Base branch: `main`.
- Do not develop directly on `main`.
- Use one short-lived branch per task.
- Preferred AI branch format: `ai/<agent>/<task>`.
- Keep PRs single-purpose across frontend, Electron, backend, and documentation changes.

## Architecture
- Frontend/Electron code lives under `src/`; backend API code lives under `backend/`.
- Keep API contracts explicit between the React/Electron client and FastAPI backend.
- Do not commit generated Python bytecode, SQLite runtime databases, packaged Electron output, or local environment files.

## Environment and secrets
- Never commit frontend or backend `.env` files, Gemini API keys, application secret keys, tokens, credentials, or local databases.
- Keep example environment files synchronized with supported configuration and placeholders only.

## Verification
Run the relevant checks for changed components. At minimum, build the frontend for frontend changes and start/import the FastAPI application for backend changes when practical. Run existing tests when present and record commands/results in the PR.

## Repository hygiene
- Tests are source code and must remain trackable by Git.
- Keep `README.md`, backend documentation, `.gitignore`, package manifests, and Python requirements aligned with the actual repository name and current setup.
- Do not claim a software license in documentation unless a corresponding license file or explicit licensing decision exists.

## Commits and PRs
Use Conventional Commits where practical. Issues represent problems/goals; PRs represent implementation. AI-led checkpoints should report work state and verification. Do not use closing keywords until acceptance criteria are satisfied.

## Issue attribution
- Standard Bug/Implementation Issue Forms require `Drafted By` for the actual human or AI agent/model that produced the initial Issue content. Preserve it as immutable provenance; do not overwrite it during handoff, revision, or implementation.
- If an Issue is created through Blank issue, GitHub CLI, API, or automation without the standard Issue Form, put `Drafted By: <human-or-agent/model>` at the top of the Issue body before creation. Do not create an Issue without initial attribution.
- If another AI materially changes Issue-defining content such as scope, acceptance criteria, reproduction, impact, or dependencies, add one concise Issue comment beginning with `AI-Contributor: <agent/model>` and `Role: Planning`, `Role: Revision`, or `Role: Synthesis`. Routine wording edits do not require attribution.
- GitHub account identity records the operator account and must not be used to infer the actual AI contributor when explicit attribution exists.

## Handoff
Provide Goal, Current Branch, Completed, Remaining, Files Changed, Verification, Known Issues/Risks, and Recommended Next Step.
