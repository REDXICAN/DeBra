# CLAUDE.md - DeBra Development Brain

## Project Overview

**DeBra** (Development Brain) is an AI-augmented development tool that provides persistent memory, semantic search, impact analysis, and workflow automation for software projects.

## Architecture

DeBra is a collection of standalone TypeScript scripts that communicate through JSON files in `.debra/`. No database required for core functionality.

### Core Components

| Component | Script | Data |
|-----------|--------|------|
| Indexer | `scripts/debra-index.ts` | `.debra/vectors/vectors.json` |
| Search | `scripts/debra-search.ts` | Reads vectors.json |
| Impact | `scripts/debra-impact.ts` | Reads graph + vectors |
| Context | `scripts/debra-context.ts` | Reads `.claude/rules/` |
| Graph | `scripts/debra-graph.ts` | `.debra/graph/nodes.json`, `edges.json` |
| Learning | `scripts/debra-learn.ts` | `.debra/session/tracker.json` |
| Memory | `scripts/debra-memory.ts` | `.debra/memory/*.md` |
| Chains | `scripts/debra-chain.ts` | Orchestrates other scripts |
| Prompts | `scripts/debra-prompts.ts` | `prompts/*.md`, `prompts/_index.json` |

### External Dependencies

- **Ollama** (`localhost:11434`) - Embeddings via `nomic-embed-text`
- **FalkorDB** (optional) - Graph persistence
- **TypeScript Compiler API** - AST analysis for knowledge graph

## Key Commands

```bash
npm run brain:search "query"    # Semantic search
npm run brain:impact "file"     # Impact analysis
npm run brain:index             # Reindex codebase
npm run brain:health            # Health check
npm run prompt:search "query"   # Search prompt library
npm run prompt:list             # List all prompts
```

## Development Guidelines

- Scripts are standalone - each can run independently
- All scripts use standard Node.js APIs (fs, path, crypto, child_process)
- Data is stored as JSON files - no database required for core features
- Ollama is required only for semantic search (keyword fallback exists)
- Always run `npm run brain:index` after adding new scripts

## File Conventions

### Prompt Library (`prompts/`)
- Each prompt is a `.md` file with YAML frontmatter
- Required frontmatter: `name`, `description`, `tags`, `category`
- `_index.json` is auto-generated - don't edit manually
- Run `npm run prompt:index` after adding/editing prompts

### Memory (`.debra/memory/`)
- `lessons.md` - Bug patterns and fixes (indexed for search)
- `facts.md` - Persistent project facts
- `decisions.md` - Architecture decisions
- Never delete memory files - append or update entries

### Rules (`.claude/rules/`)
- Domain fix files document solved bugs per area
- `shared-fixes.md` for cross-domain fixes
- Always check relevant fix file before editing
