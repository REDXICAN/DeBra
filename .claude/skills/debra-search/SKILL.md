---
name: debra-search
description: Search DeBra memory for similar code patterns, past bug fixes, lessons learned, or related implementations. Use when exploring unfamiliar code, before making changes, or when investigating bugs.
allowed-tools: Bash(npm run brain:search:*)
---

# DeBra Search - Semantic Code Search

Search the codebase using DeBra's semantic search powered by Ollama embeddings.

## When Claude Should Use This

- Before making any code change
- When investigating a bug
- When asked about how something works
- When looking for similar implementations
- When exploring unfamiliar code areas

## How to Use

```bash
npm run brain:search "<query>"
```

## Workflow

1. Run: `npm run brain:search "<query>"`
2. If results exceed 3000 tokens, invoke `/context-optimization` to compress
3. Return optimized results with relevance scores

## Query Examples

- `"quote calculation discount"`
- `"client validation email"`
- `"cart room management"`
- `"error handling pattern"`
- `"similar to mapQuoteFromAPI"`

## Output

Returns top 10 relevant code chunks with:
- File path and line numbers
- Relevance score (HIGH/MEDIUM/LOW)
- Code snippet (compressed if large)
- Domain classification

## Embedded Skills

- **`/context-optimization`**: Auto-invoked when results exceed 3000 tokens

## Integration

This skill is auto-triggered by Claude when:
- Starting work on a bug fix
- Exploring how a feature works
- Looking for existing implementations
- Before modifying any file
