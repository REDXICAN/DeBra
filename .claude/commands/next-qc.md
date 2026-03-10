---
name: next-qc
description: Transition to next QC session (archive current, create next)
---

# /next-qc - QC Session Transition

## Usage

- `/next-qc` - Archive current QC session, create next one
- `/next-qc undo` - Revert the last transition

---

## When triggered (default - no args):

### Step 1: Find Current QC Session
Find file in root matching pattern: `QC Session *.md`
Extract session number (e.g., 10 from "QC Session 10.md")

### Step 2: Archive Current Session
```bash
mv "QC Session {N}.md" "docs/archive/qc-sessions/"
```

### Step 3: Create Next Session
Create `QC Session {N+1}.md` with template:

```markdown
# QC Session {N+1} - Functionality Summary
**Date:** {today's date}
**Status:** IN PROGRESS

---

## Tasks

| # | Issue | Description | Status |
|---|-------|-------------|--------|
| 1 | | | TODO |

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|

---

## Completed Items

(Add completed items here as you work)

---

## Build Verification

- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] Vite build: `npm run build` succeeds
```

### Step 4: Update CLAUDE.md
Find line containing `Current QC Session:` or `QC Session:` and update number.

### Step 5: Save Undo Info
Write to `.claude/qc-undo.json`:
```json
{
  "timestamp": "ISO timestamp",
  "previousSession": 10,
  "newSession": 11,
  "archivedFile": "docs/archive/qc-sessions/QC Session 10.md",
  "createdFile": "QC Session 11.md"
}
```

### Step 6: Report
Output summary:
```
QC Session Transition Complete:
- Archived: QC Session 10.md -> docs/archive/qc-sessions/
- Created: QC Session 11.md
- Updated: CLAUDE.md (session number)
- Undo available: run /next-qc undo
```

---

## When triggered with "undo" arg:

### Step 1: Read Undo Info
Read `.claude/qc-undo.json`
If not found, report "Nothing to undo"

### Step 2: Restore Archived File
```bash
mv "docs/archive/qc-sessions/QC Session {N}.md" "./"
```

### Step 3: Delete Created File
```bash
rm "QC Session {N+1}.md"
```

### Step 4: Revert CLAUDE.md
Change session number back to previous value.

### Step 5: Clean Up
Delete `.claude/qc-undo.json`

### Step 6: Report
Output: `Reverted to QC Session {N}`

---

## Error Handling

- If no QC Session file found in root: Report error, suggest creating one
- If archive directory doesn't exist: Create it first
- If undo file doesn't exist: Report "Nothing to undo"
- If archived file already exists: Add timestamp suffix to prevent overwrite

---

## Notes

- Only ONE undo is stored at a time
- Running `/next-qc` twice overwrites undo info
- Always verify CLAUDE.md update succeeded
