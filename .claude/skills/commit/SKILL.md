---
name: commit
description: Stage review and commit with project-specific message format. Reads staged changes and generates a commit message following the project convention.
allowed-tools: Bash(git diff --cached) Bash(git status) Bash(git commit *)
disable-model-invocation: true
model: haiku
---

Read the staged changes with `git diff --cached` and generate a commit message following this convention:

Format: `[type] ([area]): [short message]`

Types: new, enhance, fix, chore, refactor, docs
Areas: config, appscript, sync, tests, templates, lib (pick the most relevant one; omit area if changes span multiple unrelated areas)

Rules:

- Keep the message short and descriptive (under 72 chars total)
- Use lowercase throughout
- If changes span multiple areas, pick the dominant one or omit area

Steps:

1. Run `git diff --cached` and `git status` to understand what's staged
2. Propose the commit message to the user
3. Wait for the user to approve or request changes
4. Once approved, run `git commit -m "[approved message]"`
