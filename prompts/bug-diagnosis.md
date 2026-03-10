---
name: Bug Diagnosis
description: Systematic bug investigation prompt - symptom to root cause
tags: [debugging, bug-fix, investigation, troubleshooting]
category: debugging
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Bug Diagnosis

Structured approach to diagnosing bugs before writing any fix code.

## Prompt

```
I need to diagnose this bug systematically. Before writing ANY fix code:

1. **Symptom:** What is the user-visible problem?
2. **Reproduce:** What are the exact steps to reproduce?
3. **Expected vs Actual:** What should happen vs what happens?
4. **Scope:** Is this isolated or does it affect other features?

Now investigate:

5. **Read the relevant code** - Don't guess, read the actual files
6. **Trace the data flow** - Follow the data from input to output
7. **Identify the root cause** - Not the symptom, the CAUSE
8. **Show evidence** - Code path that proves this is the cause

Before proposing a fix:

9. **Define success** - One specific test that proves it's fixed
10. **List assumptions** - What are you assuming WON'T break?
11. **Minimal fix** - What is the smallest change that fixes it?
```

## Usage Notes

- Use for any bug that isn't immediately obvious
- Forces reading code before writing code
- Prevents fixing symptoms instead of causes
