---
name: Test Strategy
description: Design test strategy for features and bug fixes
tags: [testing, e2e, unit-tests, strategy, quality]
category: testing
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Test Strategy

Design a comprehensive test strategy for a feature or bug fix.

## Prompt

```
Design a test strategy for this change:

## What to Test
1. **Happy Path** - Does the main flow work correctly?
2. **Edge Cases** - Empty data, zero values, null, max values
3. **Error Cases** - API failures, validation errors, timeouts
4. **Permissions** - Different user roles see different things?
5. **State Transitions** - Does state change correctly?

## Test Types (pick what applies)
- **Unit Tests** - Pure functions, utilities, calculations
- **Integration Tests** - API routes, database operations
- **E2E Tests** - Full user flows in browser
- **Manual Tests** - Visual, UX, responsive design

## Test Scenarios (for each, specify)
| Scenario | Input | Expected Output | Priority |
|----------|-------|-----------------|----------|
| ... | ... | ... | P0/P1/P2 |

## Regression Checks
- What existing features could break?
- What should I manually verify after the change?
```

## Usage Notes

- P0 = Must pass before merge
- P1 = Should pass, blocking for release
- P2 = Nice to have, can be deferred
