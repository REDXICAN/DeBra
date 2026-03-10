# DeBra - Development Brain

AI-augmented development memory, semantic search, and workflow automation for any project.

## What is DeBra?

DeBra is a **Development Brain** that gives your AI coding assistant persistent memory, semantic code search, impact analysis, and workflow automation. It works with any coding LLM (Claude Code, Cursor, Codex, etc.) via npm scripts, with optional deeper integration through Claude Code skills.

## Core Features

| Feature | Command | Description |
|---------|---------|-------------|
| **Semantic Search** | `npm run brain:search "query"` | Find code by meaning, not just keywords |
| **Impact Analysis** | `npm run brain:impact "file"` | Know what will break before you edit |
| **Context Injection** | `npm run brain:context "domain"` | Auto-load relevant fix files and patterns |
| **Knowledge Graph** | `npm run brain:graph` | AST-based dependency tracking |
| **Learning System** | `npm run brain:learn` | Tracks edit patterns, generates rules |
| **Workflow Chains** | `npm run brain:fix` | Multi-step automated workflows |
| **Health Checks** | `npm run brain:health` | System status and auto-recovery |
| **Prompt Library** | `npm run prompt:search "query"` | Reusable prompt templates with search |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Ollama (for embeddings)
ollama serve
ollama pull nomic-embed-text

# 3. Index your codebase
npm run brain:index

# 4. Search!
npm run brain:search "authentication flow"
```

## Requirements

- **Node.js 20+**
- **Ollama** with `nomic-embed-text` model (for semantic search)
- **TypeScript** (for AST-based analysis)
- **FalkorDB** (optional, for knowledge graph persistence)

## Directory Structure

```
DeBra-Project/
├── scripts/              # Core DeBra scripts (17 TypeScript files)
│   ├── debra-index.ts    # Semantic indexing engine
│   ├── debra-search.ts   # Cosine similarity search
│   ├── debra-impact.ts   # Dependency analysis
│   ├── debra-context.ts  # Smart context loading
│   ├── debra-chain.ts    # Workflow orchestration
│   ├── debra-learn.ts    # Development pattern learning
│   ├── debra-prompts.ts  # Prompt library manager
│   └── ...               # Health, heal, monitor, memory, etc.
│
├── prompts/              # Prompt library (.md with YAML frontmatter)
│   ├── _index.json       # Auto-generated search index
│   ├── code-review.md    # Code review checklist
│   ├── bug-diagnosis.md  # Systematic bug investigation
│   └── ...               # 10 starter prompts
│
├── .debra/               # Persistent data (gitignored selectively)
│   ├── memory/           # Lessons, facts, decisions
│   ├── vectors/          # Semantic index (embeddings)
│   ├── graph/            # Knowledge graph (nodes + edges)
│   ├── session/          # Session tracking
│   └── logs/             # Operation logs
│
└── .claude/              # Claude Code integration
    ├── skills/           # 8 auto/manual skills
    ├── rules/            # Domain fix files, patterns
    └── commands/         # Custom slash commands
```

## Prompt Library

DeBra includes a prompt library for reusable prompt templates:

```bash
npm run prompt:list                    # Browse all prompts
npm run prompt:search "refactor"       # Semantic search
npm run prompt:show "code-review"      # View full prompt
npm run prompt:tags                    # Browse by tag/category
npm run prompt:add "name" "desc"       # Scaffold new prompt
npm run prompt:index                   # Rebuild search index
```

Prompts are `.md` files with YAML frontmatter in `prompts/`. They support tags, categories, versioning, and semantic search via Ollama embeddings.

## All Commands

### Core Brain Commands
```bash
npm run brain:search "<query>"         # Semantic code search
npm run brain:impact "<file>"          # What will break?
npm run brain:context "<domain>"       # Load relevant context
npm run brain:index                    # Reindex codebase
npm run brain:health                   # System health check
npm run brain:heal                     # Auto-recovery
```

### Workflow Chains
```bash
npm run brain:fix                      # tsc → build → teach → health
npm run brain:feature                  # tsc → build → teach
npm run brain:deploy                   # Full pre-deploy check
npm run brain:verify                   # Quick tsc → build
```

### Learning System
```bash
npm run brain:learn                    # Show learning stats
npm run brain:learn:session            # Current session activity
npm run brain:learn:rules              # Auto-generated rules
npm run brain:learn:weights            # Graph edge weights
```

### Memory
```bash
npm run brain:remember "<fact>"        # Save a fact
npm run brain:recall                   # Recall saved facts
npm run brain:lesson "<lesson>"        # Log a lesson learned
npm run brain:decide                   # Log a decision
```

## Claude Code Integration

DeBra includes Claude Code skills for deeper integration:

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/debra-search` | Auto | Semantic search before edits |
| `/debra-context` | Auto | Load domain context |
| `/debra-impact` | Manual | Dependency analysis |
| `/debra-fix` | Manual | Full bug fix pipeline |
| `/debra-lesson` | Auto | Log lessons learned |
| `/debra-health` | Manual | System health check |
| `/prompt-library` | Manual | Search/apply prompt templates |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DEBRA (The Brain)                       │
│  .debra/memory/ │ .debra/vectors/ │ .debra/graph/          │
│  Semantic search │ Knowledge graph │ Learning system        │
└─────────────────────────────────────────────────────────────┘
                          ▲
          ┌───────────────┴───────────────┐
┌─────────────────────┐       ┌─────────────────────┐
│   npm run brain:*   │       │  Claude Code Skills │
│   (Any LLM)         │       │  (.claude/skills/)  │
└─────────────────────┘       └─────────────────────┘
```

## License

MIT
