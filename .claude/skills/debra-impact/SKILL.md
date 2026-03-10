---
name: debra-impact
description: Analyze what files and components will be affected by changing a file. Use BEFORE editing any file to understand dependencies, risk level, and what else might break.
allowed-tools: Bash(npm run brain:impact:*)
---

# DeBra Impact - Dependency Analysis

Analyze the impact of changing a file using DeBra's knowledge graph.

## When Claude Should Use This

- **BEFORE editing any file** (mandatory)
- When planning a refactor
- When asked about dependencies
- When assessing risk of a change

## How to Use

```bash
npm run brain:impact "<file-path>"
```

## Example

```bash
npm run brain:impact "src/features/quotes/screens/QuoteEditScreen.tsx"
```

## Output

Returns:
- **Risk Level**: CRITICAL / HIGH / MEDIUM / LOW
- **Depends On**: Files this file imports from
- **Depended By**: Files that import this file
- **Recommended Files to Also Check**: Related files to read before making changes

## Risk Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Core system file, breaks many things | Read ALL dependent files |
| HIGH | Important shared file | Read HIGH priority dependents |
| MEDIUM | Feature-specific, some dependents | Read direct dependents |
| LOW | Isolated file, few dependents | Safe to modify carefully |

## Integration

This skill is auto-triggered by Claude:
- Before editing any file
- When planning multi-file changes
- When user asks "what might break"

## Best Practice

Always run impact analysis BEFORE editing. The output tells you:
1. Which files to read first
2. What assumptions to document
3. What tests to run after
