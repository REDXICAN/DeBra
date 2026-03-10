---
name: Feature Planning
description: Plan a new feature implementation with architecture decisions
tags: [planning, architecture, feature, design]
category: planning
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Feature Planning

Structured approach to planning new feature implementation.

## Prompt

```
Plan the implementation of this feature:

## Discovery
1. What problem does this solve for the user?
2. What existing code is related? (Run brain:search)
3. Are there similar patterns already in the codebase?

## Architecture
4. What files need to be created or modified?
5. What is the data model? (types, interfaces)
6. What is the data flow? (API → service → component)
7. What state management is needed?

## Implementation Plan
8. Break into ordered steps (each step should compile independently)
9. Identify the riskiest part - implement that first
10. Define the simplest possible v1 (no gold-plating)

## Edge Cases
11. What happens with empty/null/zero data?
12. What are the error scenarios?
13. What permissions/roles need to be considered?

## Validation
14. How will you verify it works? (manual test steps)
15. What could break in existing features? (run brain:impact)
```

## Usage Notes

- Use for features touching 3+ files
- Share the plan before starting implementation
- Skip for trivial one-file changes
