---
name: Performance Audit
description: Systematic performance audit for React/Node.js applications
tags: [performance, optimization, react, database, audit]
category: optimization
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Performance Audit

Systematic approach to identifying and fixing performance issues.

## Prompt

```
Audit this code/component/page for performance:

## Frontend (React)
1. **Re-renders:** Are components re-rendering unnecessarily?
   - Missing React.memo on list items?
   - Inline functions/objects in JSX creating new references?
   - State updates that could be batched?

2. **Data Loading:**
   - N+1 query pattern? (Loading related data in a loop)
   - Missing pagination? (Loading ALL records)
   - Stale closures capturing old data?

3. **Bundle Size:**
   - Large libraries imported for small features?
   - Dynamic imports for rarely-used components?

## Backend (API/Database)
4. **Queries:**
   - Missing indexes on WHERE/JOIN columns?
   - SELECT * when only a few columns needed?
   - N+1 queries from ORM lazy loading?

5. **Caching:**
   - Frequently-read, rarely-changed data cached?
   - Cache invalidation strategy?

## Standards
- Quote Detail Load: < 600ms
- Product Grid Render: < 80ms
- Database Calls per Quote: <= 2
- Always batch load N related entities
```

## Usage Notes

- Run before deploying new features
- Focus on user-visible impact first
- Measure before and after with real data
