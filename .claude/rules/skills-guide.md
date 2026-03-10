# Claude Code Skills Layer

DeBra now has a **skills layer** that auto-triggers brain commands. This gives Claude Code automatic access to DeBra's capabilities while keeping the npm commands portable to other coding LLMs.

---

## Architecture: Two Interfaces, One Brain

```
┌─────────────────────────────────────────────────────────────┐
│                     DEBRA (The Brain)                       │
│  .debra/memory/ | .debra/vectors/ | .debra/graph/          │
│  Semantic search | Knowledge graph | Learning system        │
└─────────────────────────────────────────────────────────────┘
                          ▲
          ┌───────────────┴───────────────┐
┌─────────────────────┐       ┌─────────────────────┐
│   Normal DeBra      │       │  Claude Code Skills │
│   (npm run brain:*) │       │  (.claude/skills/)  │
│                     │       │                     │
│ • Portable to any   │       │ • Auto-triggered    │
│   coding LLM        │       │ • Claude Code only  │
│ • Manual invocation │       │ • Calls npm scripts │
│ • Future-proof      │       │ • Convenience layer │
└─────────────────────┘       └─────────────────────┘
```

**The skills are wrappers, not replacements.** Normal DeBra stays 100% intact.

---

## DeBra Skills (Project-Level)

Located in `.claude/skills/`:

### Available DeBra Skills (Invokable)

| Skill | How to Invoke | What It Does |
|-------|---------------|--------------|
| `/debra-search` | Type or hook-enforced | Runs `brain:search`, compresses if large |
| `/debra-impact` | Type `/debra-impact` | Runs `brain:impact`, shows risk level |
| `/debra-context` | Type `/debra-context` | Loads relevant fix files and patterns |
| `/debra-lesson` | Type `/debra-lesson` | Logs to lessons.md, generates SOPs |

**Note:** `/debra-search` is now ENFORCED via PreToolUse hook before edits.

### User-Invoked Skills

| Skill | How to Invoke | What It Does |
|-------|---------------|--------------|
| `/debra-fix` | Type `/debra-fix` | Full pipeline: search → impact → fix → security → test → lesson |
| `/debra-health` | Type `/debra-health` | Check all DeBra components |
| `/debra-remember` | Type `/debra-remember "fact"` | Save a fact to DeBra memory |

---

## External Skills (Personal)

Located in `~/.claude/skills/` (available to all projects):

| Skill | Source | Purpose |
|-------|--------|---------|
| `/skill-creator` | Anthropic | Build new Claude Code skills |
| `/mcp-builder` | Anthropic | Create MCP servers |
| `/webapp-testing` | Anthropic | Playwright E2E testing patterns |
| `/sop-creator` | Second Brain | Generate runbooks from lessons |
| `/static-analysis` | Trail of Bits | Security scanning (CodeQL, Semgrep) |
| `/context-optimization` | Custom | Token compression for large contexts |

---

## Skill Embedding Map

Some skills embed others for enhanced workflows:

```
/debra-search ──────► brain:search
                          │
                          ▼ (if results > 3000 tokens)
                     /context-optimization

/debra-lesson ──────► brain:lesson
                          │
                          ▼ (if new pattern detected)
                     /sop-creator ──► generates fix file

/debra-fix ─────────► brain:search + brain:impact
                          │
                          ▼ [Claude makes fix]
                          │
                          ▼
                     /static-analysis + /webapp-testing
                          │
                          ▼
                     brain:lesson + brain:index
```

---

## ENFORCED Workflow (via Hooks)

**Hooks are now configured in `.claude/settings.local.json`:**

| Hook | Trigger | Action |
|------|---------|--------|
| `PreToolUse.Edit` | Before ANY file edit | Runs `brain:search` for the file |
| `PostToolUse.Edit` | After ANY file edit | Logs the edit |

**This is AUTOMATIC - enforced by Claude Code hooks, not relying on Claude's discipline.**

The hook script is at `.claude/hooks/pre-edit-debra.sh`.

Log output: `.claude/hooks/debra.log`

---

## Using the Skills

### View Available Skills
Ask Claude: "What skills are available?"

### Invoke a Skill
Type the skill name: `/debra-fix`, `/debra-health`, etc.

### Check Skill Details
Ask Claude: "How does /debra-fix work?"

---

## Both Systems Work Together

| Interface | How to Use | Best For |
|-----------|-----------|----------|
| **Normal DeBra** | `npm run brain:search "query"` | Other LLMs (Codex, Cursor, etc.) |
| **Skills Layer** | `/debra-search` or auto | Claude Code convenience |

**Same brain, two ways to access it.**
