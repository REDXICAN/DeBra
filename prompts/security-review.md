---
name: Security Review
description: OWASP-focused security review for web applications
tags: [security, owasp, review, vulnerabilities, auth]
category: security
author: DeBra
created: 2026-03-09
updated: 2026-03-09
version: "1.0"
---

# Security Review

Review code for common security vulnerabilities (OWASP Top 10 focus).

## Prompt

```
Review this code for security vulnerabilities:

## OWASP Top 10 Check
1. **Injection** - SQL injection, command injection, XSS
   - Are user inputs sanitized/parameterized?
   - Is output encoded for the context (HTML, URL, JS)?

2. **Broken Auth** - Authentication/session weaknesses
   - Are passwords hashed properly (bcrypt, not MD5)?
   - JWT: proper expiry, signature verification?
   - Session fixation risks?

3. **Sensitive Data Exposure**
   - Are credentials in code? (.env, config files)
   - Is sensitive data logged?
   - HTTPS enforced?

4. **Access Control**
   - Role checks on every endpoint?
   - Horizontal privilege escalation possible?
   - Can users access other users' data?

5. **Security Misconfiguration**
   - CORS properly configured?
   - Error messages leaking internals?
   - Debug mode disabled in production?

## Action Items
For each finding, rate: Critical / High / Medium / Low
Provide: specific file, line, vulnerability type, and fix
```

## Usage Notes

- Run on any code handling auth, payments, or user data
- Focus on the boundary between trusted/untrusted data
- Check both frontend and backend
