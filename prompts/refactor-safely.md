---
name: Safe Refactoring
description: Refactor code without introducing regressions
tags: [refactor, safety, testing, architecture]
category: refactoring
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Safe Refactoring

Refactor code while ensuring no regressions are introduced.

## Prompt

```
Refactor the following code safely:

BEFORE starting:
1. Run `brain:impact` on the target file to understand dependencies
2. Read ALL files that import from or depend on the target
3. Identify the public API / contract that MUST NOT change
4. List all callers and their expectations

DURING refactoring:
5. Make ONE type of change at a time (rename, extract, inline, etc.)
6. Keep the external API identical unless explicitly asked to change it
7. Preserve all existing behavior - refactoring changes structure, not behavior
8. Run type checker after each change: `npx tsc --noEmit`

AFTER refactoring:
9. Verify all imports still resolve
10. Verify all callers still compile
11. Run build: `npm run build`
12. Compare behavior: same inputs should produce same outputs
```

## Usage Notes

- Always run impact analysis first
- One change at a time, verify between each
- If tests exist, run them after each step
