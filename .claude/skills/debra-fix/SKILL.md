---
name: debra-fix
description: Execute the full DeBra bug fix workflow - creates implementation plan, searches context, checks impact, makes fix, runs security audit, tests if UI changed, documents lesson.
disable-model-invocation: true
allowed-tools: Bash(npm run brain:*), Bash(npx tsc:*), Bash(npm run build:*)
---

# DeBra Fix - Complete Bug Fix Workflow

Run the complete bug fix workflow with planning, security, and testing.

**User-invoked only** - Claude will not auto-invoke this skill.

## When to Use

Invoke manually when you want the full bug fix pipeline:
```
/debra-fix
```

## Full Workflow

### Phase 0: Planning (NEW)
1. **Understand the task** - What exactly needs to be fixed/built?
2. **Create Summary Implementation Plan:**
   - Task description (one line)
   - Risk level (LOW/MEDIUM/HIGH/CRITICAL)
   - Files to modify (list with actions)
   - Key decisions and rationale
   - What's out of scope
3. **Create Step-by-Step Implementation Guide:**
   - Numbered steps with specific file:line references
   - Verification checkpoint after each step
   - Pre/post implementation checklists

### Phase 1: Context Gathering
4. **`/debra-search "<bug description>"`** - Find similar past fixes
5. **`/debra-impact "<target file>"`** - Check what might break

### Phase 2: Implementation
6. **Read all CRITICAL/HIGH risk files** from impact analysis
7. **Execute step-by-step guide** - Follow the plan created in Phase 0

### Phase 3: Verification
8. **`/static-analysis`** - Security scan on changed files (embedded)
9. **`/webapp-testing`** - Run Playwright E2E if UI files changed (embedded)
10. **`npx tsc --noEmit && npm run build`** - Verify build passes

### Phase 4: Documentation
11. **`/debra-lesson`** - Document what was learned
12. **`npm run brain:index`** - Re-index for future searches

---

## Plan Output Format

### Summary Implementation Plan

```markdown
## Summary Implementation Plan

**Task:** [One-line description]
**Risk Level:** [LOW/MEDIUM/HIGH/CRITICAL]
**Files to Modify:** [Count]

### Approach
[Chosen approach and why - 2-3 sentences]

### Key Decisions
1. [Decision 1 and rationale]
2. [Decision 2 and rationale]

### Files Involved
| File | Action | Risk |
|------|--------|------|
| path/to/file.ts | Modify | LOW |

### Out of Scope
- [What we're NOT doing]
```

### Step-by-Step Implementation Guide

```markdown
## Step-by-Step Implementation Guide

### Step 1: [Name]
**File:** `path/to/file.ts`
**Action:** [What to do]
**Verify:** [How to confirm it worked]

### Step 2: [Name]
...

### Post-Implementation
- [ ] `npx tsc --noEmit` - TypeScript check
- [ ] `npm run build` - Build check
- [ ] Test: [Specific scenario]
```

---

## Example Flow

```
User: /debra-fix

Claude:
1. What are you fixing? [User describes]

2. Creating implementation plan...

   ## Summary Implementation Plan
   **Task:** Fix negative total in quote calculation
   **Risk Level:** MEDIUM
   **Files:** 2

   ### Files Involved
   | File | Action | Risk |
   |------|--------|------|
   | QuoteEditScreen.tsx | Modify | MEDIUM |
   | database.service.ts | Verify | LOW |

   ## Step-by-Step Guide
   ### Step 1: Check mapQuoteItemFromAPI
   ### Step 2: Fix double-counting in calculateTotals
   ### Step 3: Verify build

3. Searching DeBra memory... Found 2 similar fixes
4. Running impact analysis... Risk: MEDIUM
5. Reading dependent files...
6. Executing Step 1... Done
7. Executing Step 2... Done
8. Running security analysis... PASS
9. Build check... PASS
10. Documenting lesson...

Done - Bug fixed with full audit trail
```

## Benefits

- **Plan before code** - Think first, then implement
- **No forgotten steps** - Workflow enforces all DeBra practices
- **Security built-in** - Trail of Bits analysis on every fix
- **Testing built-in** - E2E runs when UI changes
- **Learning built-in** - Every fix teaches DeBra
