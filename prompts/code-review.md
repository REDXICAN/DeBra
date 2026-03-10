---
name: Code Review
description: Thorough code review checklist for pull requests and changes
tags: [code-review, quality, security, best-practices]
category: review
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Code Review

Review the following code changes thoroughly. Check each category:

## Prompt

```
Review this code for:

1. **Correctness** - Does it do what it's supposed to? Edge cases handled?
2. **Security** - Any injection, XSS, auth bypass, or data exposure risks?
3. **Performance** - N+1 queries? Unnecessary re-renders? Missing memoization?
4. **Readability** - Clear naming? Reasonable complexity? Comments where needed?
5. **Error Handling** - Are failures handled gracefully? No silent swallows?
6. **Types** - Proper TypeScript types? No `any` escapes?
7. **Tests** - Is the change testable? Are critical paths covered?

For each issue found, state:
- **Severity:** Critical / High / Medium / Low
- **Line(s):** Where the issue is
- **Issue:** What's wrong
- **Fix:** How to fix it
```

## Usage Notes

- Use before merging any PR
- Apply to individual files or entire changesets
- Combine with `/debra-impact` for dependency awareness
