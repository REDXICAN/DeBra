---
name: debra-lesson
description: Log a lesson learned after fixing a bug or implementing a feature. Records what broke, why, and how to prevent it in the future. Auto-generates fix files if new pattern detected.
user-invocable: false
allowed-tools: Bash(npm run brain:lesson:*)
---

# DeBra Lesson - Learning from Fixes

Log lessons learned to DeBra's memory after completing fixes or implementations.

## When Claude Should Use This

- After fixing any bug
- After implementing a feature with learnings
- After discovering a gotcha
- After receiving a user correction

**Note:** This skill is model-only (not user-invocable). Claude uses it automatically after fixes.

## How to Use

```bash
npm run brain:lesson "<lesson description>"
```

## Lesson Format

Lessons should capture:
1. **Symptom**: What was the user-visible problem?
2. **Root Cause**: Why did it happen?
3. **Fix**: How was it resolved?
4. **Prevention**: How to avoid in future?

## Example

```bash
npm run brain:lesson "Quote calculation showed negative total. Root cause: backend already applies item discounts to line_total, frontend was double-counting. Fix: removed item discount from frontend calculation. Prevention: always check if backend already applies calculations before doing them in frontend."
```

## Workflow

1. Log lesson to `.debra/memory/lessons.md` via `brain:lesson`
2. Check if this is a NEW pattern (not seen in last 10 lessons)
3. If new pattern, invoke `/sop-creator` to generate/update fix file in `.claude/rules/`

## Embedded Skills

- **`/sop-creator`**: Auto-invoked when a new pattern is detected to generate fix file entries

## Storage Location

Lessons are stored in: `.debra/memory/lessons.md`

## Integration

This skill is auto-triggered by Claude after:
- Completing a bug fix
- Receiving a correction from the user
- Discovering a gotcha during implementation
