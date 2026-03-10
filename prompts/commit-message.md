---
name: Commit Message
description: Write clear, conventional commit messages
tags: [git, commit, workflow, conventions]
category: workflow
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Commit Message

Write clear commit messages that tell the story of the change.

## Prompt

```
Write a commit message for these changes following this format:

<type>: <short description (under 72 chars)>

<body - explain WHY, not WHAT (the diff shows what)>

Types:
- feat:     New feature
- fix:      Bug fix
- refactor: Code change that neither fixes nor adds
- perf:     Performance improvement
- docs:     Documentation only
- style:    Formatting, no code change
- test:     Adding/updating tests
- chore:    Build process, tooling, dependencies

Rules:
1. Subject line: imperative mood ("Add" not "Added")
2. No period at end of subject
3. Body explains the WHY and context
4. Reference issue numbers if applicable
5. Keep subject under 72 characters
```

## Usage Notes

- Focus on the "why" - the diff already shows the "what"
- One logical change per commit
- If you need "and" in the subject, it might be two commits
