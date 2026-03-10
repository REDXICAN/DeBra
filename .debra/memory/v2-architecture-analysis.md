# V2 Architecture Analysis - Parteaguas (Watershed) Migration

> **Created:** 2026-02-06
> **Branch:** `v2-architecture`
> **Rollback:** `git checkout v1-stable-before-v2`
> **Status:** Analysis Phase

---

## Executive Summary

Senior developer feedback identified 27+ architectural improvements. This document maps each to concrete actions.

**Core Philosophy:** Stop solving everything in-app code. Leverage platforms (Vercel, Supabase, GitHub) for infrastructure concerns.

---

## Current State Inventory

| Component | Current | Lines/Files | Pain Point |
|-----------|---------|-------------|------------|
| **Backend** | Express.js | 19 controllers, 7,855 LOC | Bloated, scattered |
| **Database** | MySQL 8.0 | 22+ tables, no RLS | Missing indexes, no multi-tenancy |
| **Auth** | Custom JWT + bcryptjs | ~500 LOC | Maintenance burden |
| **Deployment** | Railway + Vite build | Uploads dist/ | Should be serverless |
| **HTTP Client** | Axios | ~50 usages | Unnecessary with Vercel |
| **Routing** | React Router | ~40 routes | Should use Next.js |
| **Cron** | node-cron | 1 job | Should be GitHub Actions |
| **Rate Limit** | express-rate-limit | In-code | Should be platform |
| **Logging** | console.log | Scattered | No paper trail |
| **Storage** | AWS S3 | Links in DB | OK, needs presigned URLs |

---

## Feedback Analysis (27 Items)

### Category 1: Backend Architecture (Items 1, 8, 9, 21, 25)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 1 | Controllers bloating | 19 files, 7,855 LOC | ~10 API route files | Consolidate to Next.js API routes |
| 8 | Don't roll own auth | Custom JWT | Supabase Auth | Remove auth.controller.js entirely |
| 9 | Backend might be useless | Express server | Vercel serverless | Delete backend/ folder |
| 21 | Don't need Express | Express.js | Next.js API | Use Next.js API routes |
| 25 | Backend can be single file | 19 controllers | 1 API file? | Consolidate to feature-based routes |

**Decision:** Next.js API Routes + Supabase = No Express needed. "Single file" is hyperbole, but ~10 route files is achievable.

**Key Insight:** Controllers → Route Handlers decomposition:
```
backend/src/controllers/quotes.controller.js (797 LOC)
  → app/api/quotes/route.ts (~100 LOC)
  → src/lib/queries/quotes.ts (~200 LOC)
  → Supabase RLS handles auth
```

---

### Category 2: Database (Items 3, 4, 6, 26)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 3 | MySQL lacks indexes/constraints | Basic schema | Full constraints | Add indexes, FKs, CHECKs |
| 4 | Explore PostgreSQL | MySQL 8.0 | PostgreSQL 15 | Migrate to Supabase |
| 6 | Multi-tenancy | App-level filtering | Database-level RLS | PostgreSQL RLS policies |
| 26 | DB single source of truth | Mix of localStorage | DB authoritative | Remove localStorage for data |

**Decision:** Supabase PostgreSQL with Row-Level Security (RLS).

**RLS Policy Pattern:**
```sql
-- Example: Users only see their clients
CREATE POLICY "Users see own clients" ON clients
  FOR SELECT USING (
    user_id = auth.uid() OR
    role IN ('admin', 'superadmin')
  );
```

**PlanetScale:** Research result - MySQL serverless. PostgreSQL (Supabase) chosen instead for:
- Native RLS support
- Built-in auth
- Real-time subscriptions
- Storage (if needed later)

---

### Category 3: Deployment & Infrastructure (Items 2, 12, 14)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 2 | Vite build online | Railway uploads dist/ | Vercel serverless | Deploy to Vercel |
| 12 | Cron → GitHub Actions | node-cron in-process | GitHub Actions | Use scheduled workflows |
| 14 | Rate limit platform | express-rate-limit | Vercel Edge Config | Remove rate limiter code |

**Decision:** Vercel + GitHub Actions.

**Current Cron (1 job):**
- `reminder-notifications.job.js` - Sends reminder emails

**GitHub Actions Migration:**
```yaml
# .github/workflows/reminders.yml
on:
  schedule:
    - cron: '0 9 * * *'  # Daily 9am UTC
jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST ${{ secrets.API_URL }}/api/cron/reminders
```

---

### Category 4: HTTP & Client (Items 7, 10)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 7 | Drop Axios | ~50 Axios calls | Native fetch | Replace with fetch |
| 10 | Use Next.js | React Router | Next.js App Router | Migrate routing |

**Decision:** Native fetch + Next.js.

**Axios → Fetch Pattern:**
```typescript
// Before (Axios)
const response = await axios.get('/api/products');
return response.data;

// After (Fetch)
const response = await fetch('/api/products');
return response.json();
```

**React Router → Next.js:**
- `<Route path="/quotes/:id">` → `app/quotes/[id]/page.tsx`
- `useParams()` → `params` prop
- `useNavigate()` → `useRouter()` from `next/navigation`

---

### Category 5: Email & Attachments (Items 13, 18, 19)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 13 | S3 direct fetch | API fetches S3 | Server fetches S3 | Remove middleware layer |
| 18 | Body parsing useless | Express body parser | Vercel handles | Remove bodyParser |
| 19 | Resend templates | HTML in code | Resend templates | Move templates to Resend |

**Decision:** Resend with server-side templates.

**Current Flow:**
```
Frontend → API → S3 → Attach → Resend
```

**Target Flow:**
```
Frontend → API Route → Fetch S3 → Resend (template)
```

**Resend Templates:** Move email HTML to Resend dashboard. Code just passes variables:
```typescript
await resend.emails.send({
  from: 'noreply@turboairinc.com',
  to: recipient,
  subject: 'Quote #Q-XX-XXXX',
  template_id: 'quote-email-template',
  data: { quoteName, items, total }
});
```

---

### Category 6: Logging & Audit (Items 15, 20)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 15 | Timeline → Ledger | client_timeline table | audit_ledger table | New schema with content |
| 20 | Full app logging | console.log | Axiom + Sentry | Implement logging stack |

**Decision:** Three-layer logging:

| Layer | Tool | Purpose | Who Uses |
|-------|------|---------|----------|
| **Bugs** | Sentry | Stack traces, errors | Developers |
| **Ops** | Axiom | API logs, performance | Developers |
| **Audit** | Ledger table | User actions + content | Managers |

**Ledger Schema:**
```sql
CREATE TABLE audit_ledger (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  actor_id UUID REFERENCES auth.users,
  action_type TEXT NOT NULL,      -- 'email_sent', 'quote_created'
  target_entity TEXT NOT NULL,    -- 'quote', 'client'
  target_id UUID,
  content JSONB NOT NULL,         -- Email body, quote snapshot
  metadata JSONB
);
```

**Audit Trail Examples:**
- Email sent → Store recipient, subject, body, attachments
- Quote created → Store full quote snapshot
- Price changed → Store old/new values

---

### Category 7: Storage & Security (Items 16, 17)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 16 | Store links not blobs | Links in DB | Keep links | ✅ Already correct |
| 17 | S3 permissions | Public URLs | Presigned URLs | Add presigned URL flow |

**Decision:** Keep S3 with presigned URLs for sensitive documents.

**Presigned URL Pattern:**
```typescript
// Generate short-lived presigned URL
const presignedUrl = await s3.getSignedUrl('getObject', {
  Bucket: 'taquotes-assets',
  Key: `spec-sheets/${sku}.pdf`,
  Expires: 3600  // 1 hour
});
```

---

### Category 8: Frontend State (Items 22, 23, 24)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 22 | Scattered codebase | 191 files | Feature-based | Reorganize to features/ |
| 23 | Redux organization | Multiple slices | RTK Query + 2 slices | Simplify state |
| 24 | Cache strategy | 143 localStorage | Layered caching | Implement cache layers |

**Decision:** RTK Query for server state, Redux only for cart/UI.

**Current State Slices (7):**
1. authSlice - User session
2. productsSlice - Product list
3. clientsSlice - Client data
4. quotesSlice - Quote data
5. projectsSlice - Project data
6. cartSlice - Shopping cart
7. uiSlice - UI state

**Target State (3):**
1. authSlice - Keep (Supabase session)
2. cartSlice - Keep (local cart)
3. uiSlice - Keep (UI preferences)

**Server state (products, clients, quotes, projects) → RTK Query or React Query**

**Cache Layer Strategy:**
```
Layer 1: CDN (Vercel) - Static assets
Layer 2: RTK Query - Server state (5min stale)
Layer 3: Redux - Cart, UI preferences
Layer 4: localStorage - Draft forms only
```

---

### Category 9: React Best Practices (Items 22, 25)

| # | Feedback | Current | Target | Action |
|---|----------|---------|--------|--------|
| 22 | Disorganized | Mixed structure | Feature-based | `features/{domain}/` |
| 25 | React best practices | Mixed patterns | Consistent patterns | Apply Next.js patterns |

**Decision:** Feature-based organization with consistent patterns.

**Current:**
```
src/
├── components/    # 50+ mixed components
├── screens/       # 42 screens
├── services/      # API calls
├── store/         # Redux
└── types/         # TypeScript
```

**Target:**
```
src/
├── features/
│   ├── products/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── queries.ts
│   ├── clients/
│   ├── quotes/
│   └── cart/
├── components/   # Shared only
└── lib/          # Utilities
```

---

## Technology Decisions

| Decision | Chosen | Alternatives Considered | Why |
|----------|--------|------------------------|-----|
| Database | Supabase PostgreSQL | PlanetScale, Neon | Built-in RLS, auth, storage |
| Auth | Supabase Auth | Auth.js, Better Auth, Clerk | Already using Supabase |
| Hosting | Vercel | Railway, Netlify | Best Next.js support |
| Email | Resend (keep) | SendGrid | Already integrated, works well |
| Storage | AWS S3 (keep) | Supabase Storage | Already populated, working |
| Logging | Sentry + Axiom | LogRocket, Datadog | Vercel integration |
| Framework | Next.js 14+ | Remix, Nuxt | Most mature, best DX |

---

## Migration Phases

### Phase 0: Safety Net (Complete)
- [x] Tag v1-stable-before-v2
- [x] Create v2-architecture branch
- [x] Document current state

### Phase 1: Foundation (Current)
- [ ] Set up Supabase project
- [ ] Create PostgreSQL schema with RLS
- [ ] Set up Vercel project
- [ ] Configure Sentry + Axiom
- [ ] Add audit_ledger table

### Phase 2: Data Migration
- [ ] Migrate MySQL → PostgreSQL
- [ ] Migrate users (reset passwords to Admin123)
- [ ] Migrate products, clients, quotes
- [ ] Verify data integrity

### Phase 3: Backend Elimination
- [ ] Create Next.js API routes
- [ ] Replace Express controllers
- [ ] Remove backend/ folder
- [ ] Remove Axios
- [ ] Implement presigned URLs

### Phase 4: Frontend Migration
- [ ] Convert React Router → Next.js
- [ ] Implement RTK Query
- [ ] Reorganize to features/
- [ ] Remove localStorage for data
- [ ] Implement cache layers

### Phase 5: Email & Cron
- [ ] Move templates to Resend
- [ ] Create GitHub Actions for cron
- [ ] Implement audit ledger logging
- [ ] Test email with attachments

### Phase 6: Verification
- [ ] E2E tests all flows
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] User acceptance testing

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | Critical | Backup before, verify after |
| Auth disruption | High | Parallel auth during transition |
| Feature regression | High | E2E tests, rollback tag |
| Performance regression | Medium | Benchmark before/after |
| Learning curve | Low | Good documentation |

---

## Rollback Plan

```bash
# If v2 fails, rollback to stable:
git checkout v1-stable-before-v2
# Redeploy to Railway (original setup)
```

---

## Open Questions for User

1. **PlanetScale:** Still interested? PostgreSQL (Supabase) gives RLS + auth in one.
2. **Fastify:** Mentioned but Vercel serverless makes it unnecessary. Agree?
3. **Timeline data:** Migrate existing timeline to new ledger format?
4. **Password reset:** Users get Admin123 and must reset. Acceptable?

---

*This document will evolve as implementation progresses.*
