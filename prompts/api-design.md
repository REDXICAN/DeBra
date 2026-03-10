---
name: API Design
description: Design REST API endpoints with consistency and best practices
tags: [api, rest, backend, design]
category: backend
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# API Design

Design consistent, well-structured REST API endpoints.

## Prompt

```
Design an API endpoint following these standards:

## Endpoint Definition
1. HTTP Method: GET/POST/PUT/PATCH/DELETE
2. Path: /api/resource (plural nouns, no verbs)
3. Auth: Required? What roles?

## Request
4. Query params (GET): pagination, filters, sorting
5. Body (POST/PUT): Required fields, optional fields, validation rules
6. Headers: Content-Type, Authorization

## Response Format (NEVER deviate)
Success: { success: true, data: ... }
Error:   { success: false, error: "message" }
List:    { success: true, data: [...], pagination: { page, limit, total, pages } }

## Error Handling
7. 400 - Validation errors (list specific fields)
8. 401 - Not authenticated
9. 403 - Not authorized (wrong role)
10. 404 - Resource not found
11. 500 - Unexpected server error

## Data Mapping
12. Database columns: snake_case
13. API response: camelCase
14. Map in service layer, not controller
```

## Usage Notes

- Use standardized response helpers (successResponse, errorResponse, ApiErrors)
- Always validate input at the boundary
- Test with different user roles
