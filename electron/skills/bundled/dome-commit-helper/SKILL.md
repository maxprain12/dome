---
name: Commit Helper
description: Write clear, conventional git commit messages and summarize a set of changes.
when_to_use: When the user asks for a commit message, wants to summarize a diff, or is preparing to commit code.
---

# Commit Helper

Help the user produce high-quality git commit messages.

## Guidelines

- Follow Conventional Commits: `type(scope): subject`.
  - Common types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `build`.
- Keep the subject in the imperative mood, ≤ 72 characters, no trailing period.
- Add a body only when it adds value: explain the *why*, not the *what*.
- Group unrelated changes into separate commits and suggest the split.

## Output

When asked for a commit message, return just the message (subject + optional body),
ready to paste. When summarizing a diff, list the notable changes grouped by area.
