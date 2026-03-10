# DeBra Lessons Learned

> Lessons captured from development sessions. Each lesson is indexed semantically for search.

---

## [ui] Dark Mode Color Palette Research (Feb 12, 2026)

**Context:** Dashboard "Welcome, User" text was invisible in dark mode, white cards created harsh contrast.

**What broke:**
- Hardcoded light mode colors in `app/(main)/page.tsx` didn't respond to theme toggle
- Cold gray dark mode colors (`#0D0D0D`, `#1A1A1A`) didn't complement warm parchment light mode

**Why:**
- Page used inline `colors` object with hex values instead of CSS variables
- No visual continuity between light and dark modes
- Research showed pure black backgrounds cause eye strain

**Lesson:**
1. **Use CSS variables** in page components (`var(--bg-card)`) not hardcoded hex
2. **Warm charcoal > cold gray** for dark mode when light mode uses warm tones
3. **Text color continuity** - light mode's page color (`#F5F0EB`) can become dark mode's text color
4. **WCAG contrast** - minimum 4.5:1 for text legibility
5. **Status backgrounds** - use rgba transparency for theme compatibility

**Pattern:**
```typescript
// Theme-aware colors
const colors = {
  card: 'var(--bg-card)',
  text: { primary: 'var(--text-primary)' },
  statusBg: { pending: 'rgba(245, 158, 11, 0.15)' }  // Semi-transparent
};
```

**Files:** `app/globals.css`, `src/theme/themeRegistry.ts`, `app/(main)/page.tsx`

---
- [2026-02-12] UI Grid Cards Unequal Heights + Quotes Fetch Failure. SYMPTOM 1: Customer cards in grid view had unequal heights - cards with more content were taller than others in the same row. SYMPTOM 2: Quotes page showed 'failed to fetch quotes' with no console error. ROOT CAUSE 1: CSS Grid without alignItems:'stretch' allows cards to be their natural height instead of stretching to match row. ROOT CAUSE 2: Direct Supabase client queries (getSupabaseClient()) can fail silently when browser session isn't established or RLS blocks access. FIX 1: Add alignItems:'stretch' to CSS Grid containers. Pattern: display:'grid', gridTemplateColumns:'repeat(N,1fr)', gap:X, alignItems:'stretch'. FIX 2: Use API routes (/api/quotes) instead of direct Supabase client queries - server-side auth handles sessions properly. FILES: app/(main)/customers/CustomersContent.tsx, app/(main)/quotes/page.tsx. PREVENTION: Always use alignItems:'stretch' for card grids. For client components, prefer fetch('/api/...') over getSupabaseClient() queries.
