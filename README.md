# MyBusiness Backend API

Production-grade modular business management platform backend built with Node.js, Express, and Prisma.

---

## Tech Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Runtime        | Node.js 18+                         |
| Framework      | Express.js                          |
| ORM            | Prisma (PostgreSQL)                 |
| Auth           | JWT (Access + Refresh tokens)       |
| Email          | Nodemailer                          |
| PDF            | PDFKit                              |
| Excel          | ExcelJS                             |
| Scheduling     | node-cron                           |
| Caching        | Redis (ioredis)                     |
| Logging        | Winston                             |
| Validation     | express-validator                   |
| Security       | helmet, cors, hpp, xss-clean, bcrypt|

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Generate Prisma client
npm run db:generate

# 4. Run database migrations
npm run db:migrate

# 5. Seed demo data
npm run db:seed

# 6. Start development server
npm run dev
```

**Demo Credentials after seed:**
- Email: `admin@acmetech.in`
- Password: `Admin@1234`

---

## Project Structure

```
src/
├── config/          # DB, logger, env validator
├── constants/       # Roles, modules, actions, permissions matrix
├── middleware/       # Auth, RBAC, error handler, rate limiter, audit, validate
├── modules/
│   ├── auth/        # Login, register, refresh, forgot/reset password
│   ├── users/       # Invite, manage, permissions override
│   ├── dashboard/   # KPI summary endpoint
│   ├── clients/     # CRM – clients, activity, statement
│   ├── invoicing/   # Invoices, payments, PDF, recurring, send
│   ├── quotations/  # Quotes, convert to invoice, send
│   ├── workforce/   # Employees, attendance, leave, salary
│   ├── vendors/     # Vendors + purchases + vendor payments
│   ├── inventory/   # Products, stock in/out/adjust, logs
│   ├── finance/     # Income/expense, cash flow, P&L
│   ├── reports/     # Sales, expense, GST, employee, inventory, Excel export
│   ├── settings/    # Business profile, logo upload, tax config
│   ├── notifications/ # In-app notifications, read/unread
│   ├── audit/       # Full audit trail viewer
│   └── cron/        # Scheduled jobs (overdue, recurring, low stock)
├── routes/          # Master route registry
├── utils/           # Response, pagination, appError, email templates, PDF, doc numbers
├── app.js           # Express app setup
└── server.js        # Entry point + graceful shutdown
```

---

## API Reference

Base URL: `http://localhost:5000/api/v1`

### Auth
| Method | Endpoint                  | Description                    | Auth |
|--------|---------------------------|--------------------------------|------|
| POST   | /auth/register            | Register business + super admin| No   |
| POST   | /auth/login               | Login                          | No   |
| POST   | /auth/refresh-token       | Refresh access token           | No   |
| POST   | /auth/logout              | Logout                         | Yes  |
| GET    | /auth/me                  | Get current user + permissions | Yes  |
| POST   | /auth/forgot-password     | Send reset link                | No   |
| POST   | /auth/reset-password      | Reset with token               | No   |
| PATCH  | /auth/change-password     | Change password (authenticated)| Yes  |

### Users
| Method | Endpoint                  | Description                    | Role  |
|--------|---------------------------|--------------------------------|-------|
| GET    | /users                    | List all users                 | Admin |
| GET    | /users/:id                | Get single user                | Admin |
| POST   | /users/invite             | Invite new user by email       | Admin |
| PATCH  | /users/:id                | Update user                    | Admin |
| DELETE | /users/:id                | Deactivate user                | Admin |
| PUT    | /users/:id/permissions    | Override user permissions      | Admin |
| GET    | /users/:id/permissions    | Get user permissions           | Admin |
| PATCH  | /users/profile            | Update own profile             | Any   |

### Dashboard
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | /dashboard                | Full KPI dashboard summary     |

### Clients
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | /clients                  | List clients (search, paginate)|
| POST   | /clients                  | Create client                  |
| GET    | /clients/:id              | Get client details             |
| PATCH  | /clients/:id              | Update client                  |
| DELETE | /clients/:id              | Soft delete                    |
| GET    | /clients/:id/activity     | Invoice + quotation history    |
| GET    | /clients/:id/statement    | Date-range invoice statement   |

### Invoices
| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | /invoices                       | List (filter by status/client/date) |
| POST   | /invoices                       | Create invoice               |
| GET    | /invoices/:id                   | Get with items + payments    |
| PATCH  | /invoices/:id                   | Update (if not paid/cancelled)|
| POST   | /invoices/:id/send              | Email invoice to client      |
| POST   | /invoices/:id/cancel            | Cancel invoice               |
| POST   | /invoices/:id/duplicate         | Duplicate as new draft       |
| GET    | /invoices/:id/pdf               | Download PDF                 |
| POST   | /invoices/:id/payments          | Record payment               |
| DELETE | /invoices/:id/payments/:pid     | Delete payment               |

### Quotations
| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | /quotations                     | List quotations              |
| POST   | /quotations                     | Create quotation             |
| GET    | /quotations/:id                 | Get with items               |
| PATCH  | /quotations/:id                 | Update                       |
| PATCH  | /quotations/:id/status          | Update status                |
| POST   | /quotations/:id/send            | Email to client              |
| POST   | /quotations/:id/convert-to-invoice | Convert → Invoice         |
| DELETE | /quotations/:id                 | Delete                       |

### Workforce
| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | /workforce/employees            | List employees               |
| POST   | /workforce/employees            | Create employee              |
| GET    | /workforce/employees/:id        | Get employee                 |
| PATCH  | /workforce/employees/:id        | Update employee              |
| DELETE | /workforce/employees/:id        | Deactivate employee          |
| GET    | /workforce/attendance           | List attendance records      |
| POST   | /workforce/attendance           | Mark attendance              |
| POST   | /workforce/attendance/bulk      | Bulk mark attendance         |
| GET    | /workforce/attendance/summary   | Monthly summary stats        |
| GET    | /workforce/leaves               | List leave requests          |
| POST   | /workforce/leaves               | Submit leave request         |
| PATCH  | /workforce/leaves/:id/status    | Approve / Reject leave       |
| GET    | /workforce/salaries             | List salary records          |
| POST   | /workforce/salaries             | Create salary record         |
| PATCH  | /workforce/salaries/:id/mark-paid | Mark salary as paid        |

### Vendors & Purchases
| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | /vendors/vendors                | List vendors                 |
| POST   | /vendors/vendors                | Create vendor                |
| PATCH  | /vendors/vendors/:id            | Update vendor                |
| DELETE | /vendors/vendors/:id            | Soft delete                  |
| GET    | /vendors/purchases              | List purchases               |
| POST   | /vendors/purchases              | Create purchase (auto stock) |
| PATCH  | /vendors/purchases/:id/status   | Update status                |
| POST   | /vendors/purchases/:id/payments | Record vendor payment        |

### Inventory
| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | /inventory/summary              | Stock value & counts         |
| GET    | /inventory/low-stock            | Products below threshold     |
| GET    | /inventory                      | List products                |
| POST   | /inventory                      | Create product               |
| GET    | /inventory/:id                  | Get with recent stock logs   |
| PATCH  | /inventory/:id                  | Update product               |
| DELETE | /inventory/:id                  | Deactivate product           |
| POST   | /inventory/:id/stock-adjust     | Stock in / out / adjustment  |
| GET    | /inventory/:id/stock-logs       | Full stock history           |

### Finance
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | /finance/dashboard        | Live income/expense summary    |
| GET    | /finance/cash-flow        | Monthly cash flow by year      |
| GET    | /finance/categories       | Breakdown by category          |
| GET    | /finance                  | List entries                   |
| POST   | /finance                  | Create income/expense entry    |
| PATCH  | /finance/:id              | Update entry                   |
| DELETE | /finance/:id              | Delete entry                   |

### Reports
| Method | Endpoint                          | Description                  |
|--------|-----------------------------------|------------------------------|
| GET    | /reports/sales                    | Sales report (date range)    |
| GET    | /reports/expenses                 | Expense report               |
| GET    | /reports/employees                | Payroll + leave report       |
| GET    | /reports/inventory                | Stock value report           |
| GET    | /reports/gst                      | GST summary report           |
| GET    | /reports/invoice-statement?format=excel | Export Excel statement |

### Settings
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | /settings/business        | Get business profile           |
| PATCH  | /settings/business        | Update business profile        |
| POST   | /settings/business/logo   | Upload business logo           |
| POST   | /settings/numbering/reset | Reset invoice/quotation numbering |
| GET    | /settings/taxes           | List tax configurations        |
| POST   | /settings/taxes           | Create tax config              |
| PATCH  | /settings/taxes/:id       | Update tax config              |
| DELETE | /settings/taxes/:id       | Delete tax config              |

### Notifications
| Method | Endpoint                     | Description                 |
|--------|------------------------------|-----------------------------|
| GET    | /notifications               | My notifications (paginated)|
| GET    | /notifications/unread-count  | Unread badge count          |
| PATCH  | /notifications/mark-all-read | Mark all as read            |
| PATCH  | /notifications/:id/read      | Mark single as read         |
| DELETE | /notifications/:id           | Delete notification         |
| DELETE | /notifications/clear-read    | Clear all read notifications|

### Audit Log (Admin only)
| Method | Endpoint     | Description                          |
|--------|--------------|--------------------------------------|
| GET    | /audit       | List audit logs (filterable)         |
| GET    | /audit/:id   | Single log with full data diff       |

---

## RBAC Permission System

Each user has a `role` and per-module `actions`:

| Module               | Super Admin | Admin | Manager | Accountant | HR | Staff |
|----------------------|-------------|-------|---------|------------|----|-------|
| clients              | Full        | Full  | View/Create/Edit | View | — | — |
| invoicing            | Full        | Full  | View/Create/Edit/Export | Full | — | — |
| invoice_statements   | Full        | Full  | View/Export | View/Export | — | — |
| quotations           | Full        | Full  | Full    | View/Create/Edit/Export | — | — |
| workforce            | Full        | Full  | View/Create/Edit | View | Full | View (own) |
| vendors              | Full        | Full  | View/Create/Edit | View | — | — |
| purchases            | Full        | Full  | View/Create/Edit | Full | — | — |
| inventory            | Full        | Full  | View/Create/Edit | — | — | — |
| finance              | Full        | Full  | View/Create | Full | — | — |
| reports              | Full        | Full  | View/Export | View/Export | View/Export | — |
| settings             | Full        | Full  | — | — | — | — |
| audit                | Full        | Full  | — | — | — | — |

Actions per module: `view` · `create` · `edit` · `delete` · `export` · `approve`

Admins can grant/override any permission per user via `PUT /users/:id/permissions`.

---

## Cron Jobs

| Job                      | Schedule      | Description                             |
|--------------------------|---------------|-----------------------------------------|
| Mark overdue invoices    | 00:05 daily   | SENT/PARTIALLY_PAID → OVERDUE if past due |
| Payment reminders        | 09:00 daily   | Email clients for due/overdue invoices  |
| Low stock alerts         | 08:00 daily   | Email admins + in-app notification      |
| Generate recurring invoices | 01:00 daily | Auto-create copies of recurring invoices |
| Expire quotations        | 00:15 daily   | SENT/DRAFT → EXPIRED if past validUntil |

Enable with: `ENABLE_CRON=true` in `.env` (auto-enabled in production).

---

## Security

- JWT access tokens (15 min) + refresh tokens (7 days) with cookie storage
- Account lockout after 5 failed login attempts (30 min lockout)
- Rate limiting: 100 req/15min global, 10 req/15min on auth endpoints
- Helmet security headers, XSS cleaning, HPP protection
- CORS restricted to FRONTEND_URL
- bcrypt with configurable rounds (default: 12)
- Business isolation on every query (multi-tenant safe)
- All mutations logged to audit trail
