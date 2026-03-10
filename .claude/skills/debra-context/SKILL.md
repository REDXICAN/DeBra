---
name: debra-context
description: Load relevant context (fix files, patterns, error solutions) for the current task based on domain, file, or error message.
allowed-tools: Bash(npm run brain:context:*)
---

# DeBra Context - Smart Context Injection

Get smart context injection for a task based on domain, file, or error message.

## When Claude Should Use This

- When starting work on any domain
- When seeing an error message
- When editing a file in a specific domain
- When needing domain-specific patterns

## How to Use

```bash
npm run brain:context "<query or file path>"
```

## Examples

```bash
# By domain
npm run brain:context "cart"

# By file path
npm run brain:context "src/features/quotes/screens/QuoteEditScreen.tsx"

# By error message
npm run brain:context "TypeError: Cannot read property 'trim' of undefined"

# By topic
npm run brain:context "email validation"
```

## Output

Returns:
- **Relevant fix file content** from `.claude/rules/`
- **Related lessons** from `.debra/memory/lessons.md`
- **Domain-specific patterns** from `patterns.md`
- **Error solutions** if query matches known errors

## Domain Detection

| Query Contains | Loads |
|----------------|-------|
| cart, CartScreen | `cart-fixes.md` |
| quote, Quote | `quotes-fixes.md` |
| client, Customer | `clients-fixes.md` |
| email, Email | `email-fixes.md` |
| error, TypeError | `error-solutions.md` |
| product | `products-fixes.md` |
| project | `projects-fixes.md` |
| admin, user | `admin-fixes.md` |
| auth, login | `auth-fixes.md` |
| factory, order | `factory-orders-fixes.md` |

## Integration

This skill is auto-triggered by Claude when:
- Starting work on a domain
- Encountering an error message
- Before making changes to a file
