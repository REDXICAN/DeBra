---
name: debra-health
description: Check DeBra system health - Ollama embeddings, vector database, memory files, knowledge graph, git hooks.
disable-model-invocation: true
allowed-tools: Bash(npm run brain:health)
---

# DeBra Health - System Health Check

Check all DeBra components for proper operation.

**User-invoked only** - For manual system checks.

## When to Use

Invoke when:
- Starting a new session
- After system issues
- To verify DeBra is working
- Before important work

```
/debra-health
```

## Components Checked

### 1. Ollama Service
- Is Ollama running?
- Is `nomic-embed-text` model loaded?
- Can embeddings be generated?

### 2. Vector Database
- Does `.debra/vectors/` exist?
- Is the index file valid?
- How many vectors are indexed?

### 3. Memory Files
- `.debra/memory/lessons.md` - Lessons learned
- `.debra/memory/facts.md` - Project facts
- `.debra/memory/decisions.md` - Architecture decisions
- `.debra/memory/e2e-testing.md` - E2E documentation

### 4. Knowledge Graph
- Does `.debra/graph/` exist?
- Are edge weights being learned?
- Graph connectivity status

### 5. Git Hooks
- Pre-commit hook installed?
- Pre-push hook installed?

## Output Format

```
DeBra Health Check
==================

Ollama:     OK (nomic-embed-text loaded)
Vectors:    OK (2,456 chunks indexed)
Memory:     OK (4 files, 156KB)
Graph:      OK (1,234 nodes, 5,678 edges)
Git Hooks:  OK (pre-commit, pre-push active)

Status: HEALTHY
```

## Recovery

If any component fails, run:
```bash
npm run brain:heal
```

For specific component recovery:
```bash
npm run brain:heal:ollama   # Restart Ollama
npm run brain:heal:vectors  # Reindex vectors
```
