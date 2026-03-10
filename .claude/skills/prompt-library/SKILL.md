---
name: prompt-library
description: Search, browse, and apply prompts from the DeBra prompt library. Use when looking for reusable prompts, before starting common tasks like code review, debugging, or planning.
allowed-tools: Bash(npm run prompt:*)
---

# Prompt Library - Reusable Prompt Templates

Search and apply prompts from DeBra's curated prompt library.

## When Claude Should Use This

- When starting a code review
- When diagnosing a bug
- When planning a new feature
- When the user asks for a prompt or template
- When looking for best practices for a specific task

## How to Use

```bash
npm run prompt:list                    # Browse all prompts
npm run prompt:search "query"          # Semantic search
npm run prompt:show "prompt-name"      # View full prompt
npm run prompt:tags                    # Browse by tag
npm run prompt:add "name" "desc"       # Create new prompt
npm run prompt:index                   # Rebuild search index
```

## Workflow

1. Search for relevant prompt: `npm run prompt:search "code review"`
2. Show the full prompt: `npm run prompt:show "code-review"`
3. Apply the prompt to the current task
4. If no matching prompt exists, create one: `npm run prompt:add "new-prompt" "description"`
