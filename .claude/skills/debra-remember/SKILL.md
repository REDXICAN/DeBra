---
name: debra-remember
description: Save a fact, pattern, or convention to DeBra's persistent memory for future reference.
disable-model-invocation: true
allowed-tools: Bash(npm run brain:remember:*)
---

# DeBra Remember - Save to Memory

Save a fact, pattern, or convention to DeBra's persistent memory.

**User-invoked** - For explicitly saving important information.

## When to Use

Invoke when:
- Discovering a project convention
- Learning a new pattern
- Documenting a decision
- Recording important context

```
/debra-remember "React components must use React.memo for lists"
```

## How to Use

```bash
npm run brain:remember "<fact to remember>"
```

## What to Remember

### Project Conventions
```
/debra-remember "All buttons must use variant='contained' for readability"
/debra-remember "Number formatting must use formatCurrency() utility"
```

### Technical Facts
```
/debra-remember "Database stores rooms as JSON string, parse with parseRoomsField()"
/debra-remember "Backend uses snake_case, frontend uses camelCase"
```

### Decisions
```
/debra-remember "Sequential quote numbers use format Q-{USER}-{MMDDYY}-{SEQ}"
/debra-remember "Room management uses localStorage for persistence"
```

### Gotchas
```
/debra-remember "MUI v7 Autocomplete requires key extraction in renderOption"
/debra-remember "Use ?? not || for numeric fallbacks (0 is valid)"
```

## Storage

Facts are stored in: `.debra/memory/facts.md`

## Integration

These facts are retrieved by:
- `/debra-search` - Returns relevant facts
- `/debra-context` - Includes in domain context
- `ClaudeTeacher.md` - Auto-incorporated in updates
