# TAQuotesUS App Structure

> This document describes the complete application architecture for Next.js v2 migration.
> Last updated: 2026-02-06

---

## Overview

**TAQuotesUS** is a B2B HVAC Sales & Quotation Management System.

| Metric | Count |
|--------|-------|
| Feature Domains | 10 |
| Screen Components | 71 |
| User Roles | 7 |
| Navigation Items | 6 |

---

## User Roles (RBAC)

| Role | Access Level |
|------|--------------|
| `superadmin` | Full access, system config, error logs, database |
| `admin` | Full access to data, user management, analytics |
| `sales` | Own data + assigned distributors, quotes, clients |
| `distributor` | Limited access, sees `visible_to_distributors` clients |
| `logistics` | Stock, factory orders, shipments |
| `accountant` | Bulk pricing, factory orders |
| `pending` | Newly registered, awaiting approval |

---

## Navigation Structure (6 Items)

| Nav Item | Route | Description |
|----------|-------|-------------|
| **Home** | `/` | Dashboard with KPIs |
| **Catalog** | `/catalog` | Products (tabs: Products, Spare Parts) |
| **Customers** | `/customers` | Clients & Projects (tabs) |
| **Cart** | `/cart` | Shopping cart with rooms |
| **Quotes** | `/quotes` | Quote management |
| **Account** | `/account` | Profile, Settings, Admin |

---

## Feature Domains

### 1. Auth (`src/features/auth/`)
| Screen | Route | Access |
|--------|-------|--------|
| LoginScreen | `/login` | Public |
| RegisterScreen | `/register` | Public |
| ForgotPasswordScreen | `/forgot-password` | Public |
| ResetPasswordScreen | `/reset-password` | Public |
| PendingApprovalScreen | `/pending-approval` | Public |
| ForcePasswordChangeScreen | `/force-password-change` | Public |

### 2. Home (`src/features/home/`)
| Screen | Route | Access |
|--------|-------|--------|
| HomeScreen | `/` | All authenticated |

### 3. Products (`src/features/products/`)
| Screen | Route | Access |
|--------|-------|--------|
| ProductsScreen | `/catalog` | All authenticated |
| ProductDetailScreen | `/catalog/products/:productId` | All authenticated |
| StockDashboardScreen | `/catalog/stock` | Admin, Logistics |
| BulkPriceUpdateScreen | `/bulk-price-update` | Accountant, Admin |

### 4. Clients (`src/features/clients/`)
| Screen | Route | Access |
|--------|-------|--------|
| CustomersScreen | `/customers` | All authenticated (tabs: Clients, Projects) |
| ClientsScreen | `/customers/clients` | All authenticated |
| ClientDetailScreen | `/customers/clients/:clientId` | All authenticated (tabs: Quotes, Projects, Analytics, Notes) |
| ClientFormScreen | `/customers/clients/new` | All authenticated |
| ClientFormScreen | `/customers/clients/:clientId/edit` | All authenticated |

### 5. Projects (`src/features/projects/`)
| Screen | Route | Access |
|--------|-------|--------|
| ProjectsScreen | `/customers/projects` | All authenticated |
| ProjectDetailScreen | `/customers/projects/:projectId` | All authenticated (tabs: Quotes, Details, Product Lines) |
| ProjectFormScreen | `/customers/projects/new` | All authenticated |
| ProjectFormScreen | `/customers/projects/:projectId/edit` | All authenticated |

### 6. Cart (`src/features/cart/`)
| Screen | Route | Access |
|--------|-------|--------|
| CartScreen | `/cart` | All authenticated |

### 7. Quotes (`src/features/quotes/`)
| Screen | Route | Access |
|--------|-------|--------|
| QuotesScreen | `/quotes` | All authenticated |
| QuoteDetailScreen | `/quotes/:quoteId` | All authenticated |
| QuoteEditScreen | `/quotes/:quoteId/edit` | All authenticated |
| QuoteCreateScreen | `/quotes/create` | All authenticated |
| QuoteTrackingScreen | `/quotes/:quoteId/tracking` | All authenticated |
| PODetailScreen | `/po/:poId` | All authenticated |

### 8. Factory Orders (`src/features/factory-orders/`)
| Screen | Route | Access |
|--------|-------|--------|
| FactoryOrdersScreen | `/factory-orders` | Admin, Logistics, Accountant |
| FactoryOrderDetailScreen | `/factory-orders/:orderId` | Admin, Logistics, Accountant |
| FactoryShipmentsScreen | `/factory-shipments` | Admin, Accountant (edit), Sales/Logistics (view) |

### 9. Account (`src/features/account/`)
| Screen | Route | Access |
|--------|-------|--------|
| AccountScreen | `/account` | All authenticated |
| ProfileScreen | `/account/profile` | All authenticated |
| SettingsScreen | `/account/settings` | All authenticated |

### 10. Admin (`src/features/admin/`)
| Screen | Route | Access |
|--------|-------|--------|
| AdminDashboardScreen | `/account/admin/dashboard` | Admin |
| AdminUsersScreen | `/account/admin/users` | Admin |
| UserDetailsScreen | `/account/admin/users/:userId` | Admin |
| UsersScreen | `/account/admin/users-list` | Admin |
| AdminApprovalsScreen | `/account/admin/approvals` | Admin |
| PerformanceDashboardScreen | `/account/admin/performance` | Admin |
| KPIDashboardScreen | `/account/admin/kpi` | Admin |
| ProjectAnalyticsScreen | `/account/admin/projects` | Admin |
| AdminErrorsScreen | `/account/admin/errors` | SuperAdmin only |
| AdminDatabaseScreen | `/account/admin/database` | SuperAdmin only |
| AdminThemeScreen | `/account/admin/theme` | Admin |
| SalesAnalyticsDashboard | `/admin/sales-analytics` | Admin |
| StockDashboardScreen | `/account/admin/stock` | Admin, Logistics |

---

## Next.js v2 Route Mapping

### App Router Structure

```
app/
├── (auth)/                    # Auth group (public)
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx
│   ├── pending-approval/page.tsx
│   └── force-password-change/page.tsx
│
├── (main)/                    # Main group (protected)
│   ├── layout.tsx             # AppLayout with Navigation
│   ├── page.tsx               # Home dashboard
│   │
│   ├── catalog/
│   │   ├── page.tsx           # ProductsScreen
│   │   ├── products/
│   │   │   └── [productId]/page.tsx
│   │   └── stock/page.tsx     # Admin only
│   │
│   ├── customers/
│   │   ├── page.tsx           # CustomersScreen (tabs)
│   │   ├── clients/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [clientId]/
│   │   │       ├── page.tsx
│   │   │       └── edit/page.tsx
│   │   └── projects/
│   │       ├── page.tsx
│   │       ├── new/page.tsx
│   │       └── [projectId]/
│   │           ├── page.tsx
│   │           └── edit/page.tsx
│   │
│   ├── cart/page.tsx
│   │
│   ├── quotes/
│   │   ├── page.tsx
│   │   ├── create/page.tsx
│   │   └── [quoteId]/
│   │       ├── page.tsx
│   │       ├── edit/page.tsx
│   │       └── tracking/page.tsx
│   │
│   ├── po/[poId]/page.tsx
│   │
│   ├── factory-orders/
│   │   ├── page.tsx
│   │   └── [orderId]/page.tsx
│   │
│   ├── factory-shipments/page.tsx
│   │
│   ├── bulk-price-update/page.tsx
│   │
│   └── account/
│       ├── page.tsx
│       ├── profile/page.tsx
│       ├── settings/page.tsx
│       └── admin/
│           ├── page.tsx       # Redirect to dashboard
│           ├── dashboard/page.tsx
│           ├── users/page.tsx
│           ├── users/[userId]/page.tsx
│           ├── users-list/page.tsx
│           ├── approvals/page.tsx
│           ├── performance/page.tsx
│           ├── kpi/page.tsx
│           ├── projects/page.tsx
│           ├── errors/page.tsx      # SuperAdmin
│           ├── database/page.tsx    # SuperAdmin
│           ├── theme/page.tsx
│           └── stock/page.tsx
│
└── api/
    ├── auth/
    │   ├── login/route.ts
    │   ├── register/route.ts
    │   └── [...]/route.ts
    ├── products/route.ts
    ├── clients/route.ts
    ├── quotes/route.ts
    ├── projects/route.ts
    ├── factory-orders/route.ts
    ├── email/route.ts
    └── cron/reminders/route.ts
```

---

## Key Services (to Port)

| Current File | Purpose |
|--------------|---------|
| `src/services/database.service.ts` | Data layer (API mapping) |
| `src/services/api.service.ts` | REST client with interceptors |
| `src/services/export.service.ts` | PDF/Excel generation |
| `backend/src/services/resend.service.js` | Email via Resend |

---

## State Management

### Current (Redux Toolkit)
| Slice | Purpose |
|-------|---------|
| authSlice | User auth state |
| cartSlice | Shopping cart + rooms |
| productsSlice | Product cache |
| quotesSlice | Quote state |
| clientsSlice | Client cache |
| projectsSlice | Project cache |
| uiSlice | UI state (theme, modals) |

### Target (Next.js + Supabase)
- **Auth**: Supabase Auth (replaces authSlice)
- **Cart**: Keep Redux (client-side state)
- **UI**: Keep Redux (theme, modals)
- **Server Data**: React Query or direct Supabase calls

---

## Database Tables (Supabase)

### Shared Tables (no environment column)
- products, accessories, product_accessories
- users, user_permissions, user_notifications
- user_client_favorites, user_product_favorites
- warehouses, warehouse_stock
- price_change_requests, activity_log
- cart_items, sales_contacts, audit_ledger

### Environment-Specific Tables (has `environment` column)
- clients, client_addresses, client_contacts
- client_emails, client_products, client_reminders
- client_activity_log, shipping_addresses
- projects, quotes, quote_items, quote_reminders
- orders, order_items
- order_confirmations, order_confirmation_items
- factory_orders, factory_order_items

---

## Migration Priority

1. **Phase 2 (Current)**: Next.js project structure + API routes
2. **Phase 3**: Port auth screens (Supabase Auth)
3. **Phase 4**: Port catalog/products screens
4. **Phase 5**: Port customers/clients screens
5. **Phase 6**: Port quotes screens
6. **Phase 7**: Port cart + checkout
7. **Phase 8**: Port admin screens
8. **Phase 9**: Cleanup + testing
