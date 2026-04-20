# MyBusiness — Full Stack Setup Guide

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Node.js | 18+ | https://nodejs.org |
| PostgreSQL | 14+ | https://postgresql.org |
| npm | 9+ | comes with Node |

---

## 1. DATABASE SETUP

```sql
-- Connect to PostgreSQL and run:
CREATE DATABASE mybusiness_db;
CREATE USER mybusiness_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE mybusiness_db TO mybusiness_user;
```

---

## 2. BACKEND SETUP

```bash
cd mybusiness-backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create .env file
cp .env.example .env
```

### Edit `.env` — minimum required:
```env
DATABASE_URL="postgresql://mybusiness_user:your_password@localhost:5432/mybusiness_db"
JWT_ACCESS_SECRET=any_random_32_char_string_here
JWT_REFRESH_SECRET=another_random_32_char_string_here

# Optional: email (skip if not testing email)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM_ADDRESS=your@gmail.com

FRONTEND_URL=http://localhost:3000
PORT=5000
```

```bash
# Run database migrations
npx prisma migrate dev --name init

# Seed demo data
npm run db:seed

# Start backend (development)
npm run dev

# ✅ Backend running at: http://localhost:5000
```

### Demo Login (after seed):
- **URL**: http://localhost:5000/api/v1/health
- **Email**: admin@acmetech.in
- **Password**: Admin@1234

---

## 3. FRONTEND SETUP

```bash
cd mybusiness-frontend

# Install dependencies
npm install

# Create env file
cp .env.local.example .env.local
```

### Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

```bash
# Start frontend (development)
npm run dev

# ✅ Frontend running at: http://localhost:3000
```

Open http://localhost:3000 → redirects to /login automatically.

---

## 4. COMPLETE PAGE MAP

### Auth Pages
| URL | Description |
|-----|-------------|
| /login | Sign in with email + password |
| /register | Create new business account |
| /forgot-password | Request password reset email |
| /reset-password?token=... | Set new password |

### Dashboard & Overview
| URL | Description |
|-----|-------------|
| /dashboard | KPI widgets, cash flow chart, recent invoices, quick actions |
| /notifications | In-app notifications — read/unread/delete |

### Client & Sales
| URL | Description |
|-----|-------------|
| /clients | Client list with search + outstanding balance |
| /clients/new | Create client with full billing/shipping address |
| /clients/[id] | Overview, invoice history, date-range statement |
| /clients/[id]/edit | Edit client details |
| /quotations | Quotation list with status tabs |
| /quotations/new | Create quotation with line items + GST |
| /quotations/[id] | View, send, approve/reject, convert to invoice |
| /invoices | Invoice list with status tabs |
| /invoices/new | Create invoice with line items + GST + recurring |
| /invoices/[id] | View, record payments, download PDF, send email |

### Operations
| URL | Description |
|-----|-------------|
| /workforce | Employees, attendance, leave requests, salary |
| /vendors | Vendors + purchases, record vendor payments |
| /inventory | Products, stock levels, adjustments, low stock alerts |

### Finance & Reports
| URL | Description |
|-----|-------------|
| /finance | Income/expense tracker with cash flow chart |
| /reports | Sales, Expenses, GST, Employee, Inventory reports |

### Administration
| URL | Description |
|-----|-------------|
| /settings | Business profile, tax config, invoice numbering |
| /users | Team members — invite, manage roles, deactivate |
| /audit | Full audit trail of all system actions |

---

## 5. API REFERENCE

Base URL: `http://localhost:5000/api/v1`

### Key endpoints:
```
POST   /auth/register          — Create business + admin
POST   /auth/login             — Get access + refresh tokens
GET    /auth/me                — Current user + permissions
POST   /auth/refresh-token     — Refresh access token

GET    /dashboard              — KPI summary
GET    /clients                — List clients
POST   /clients                — Create client
GET    /invoices               — List invoices
POST   /invoices               — Create invoice
GET    /invoices/:id/pdf       — Download PDF
POST   /invoices/:id/payments  — Record payment
POST   /invoices/:id/send      — Email invoice to client
GET    /quotations             — List quotations
POST   /quotations             — Create quotation
POST   /quotations/:id/convert-to-invoice

GET    /workforce/employees    — List employees
POST   /workforce/attendance   — Mark attendance
POST   /workforce/leaves       — Submit leave request
POST   /workforce/salaries     — Create salary record

GET    /inventory              — List products
POST   /inventory/:id/stock-adjust — Adjust stock

GET    /finance                — List entries
GET    /finance/dashboard      — Live P&L summary
GET    /finance/cash-flow      — Monthly cash flow

GET    /reports/sales          — Sales report
GET    /reports/gst            — GST report
GET    /reports/invoice-statement?format=excel — Excel export

GET    /settings/business      — Business profile
PATCH  /settings/business      — Update profile
GET    /settings/taxes         — Tax configurations
POST   /users/invite           — Invite team member
GET    /audit                  — Audit log
```

---

## 6. ROLES & PERMISSIONS

| Role | Access |
|------|--------|
| SUPER_ADMIN | Everything |
| ADMIN | Everything |
| MANAGER | Clients, Invoices, Quotations, Workforce (view/create/edit), Vendors, Inventory, Finance (view/create), Reports |
| ACCOUNTANT | Invoices (full), Quotations, Finance (full), Reports, Clients (view) |
| HR | Workforce (full), Reports |
| STAFF | Notifications only — own data |

Permissions can be overridden per user via `/users/:id/permissions`.

---

## 7. COMMON ISSUES

### "Cannot connect to database"
Check `DATABASE_URL` in `.env` — user, password, port, database name all correct.

### "JWT_ACCESS_SECRET missing"
Copy `.env.example` to `.env` and fill in the secrets.

### "Prisma schema out of sync"
Run `npx prisma migrate dev` in the backend folder.

### CORS error in browser
Make sure `FRONTEND_URL=http://localhost:3000` in backend `.env`.

### Email not sending
If you don't have SMTP configured, emails are logged but not sent — everything else still works.

---

## 8. PRODUCTION CHECKLIST

- [ ] Set `NODE_ENV=production` in backend
- [ ] Use strong random JWT secrets (32+ chars each)  
- [ ] Set up PostgreSQL with a dedicated user
- [ ] Configure SMTP (Gmail App Password or SendGrid)
- [ ] Set `FRONTEND_URL` to your actual domain
- [ ] Run `npm run build` for Next.js frontend
- [ ] Set up a reverse proxy (nginx) in front of both services
- [ ] Enable HTTPS
- [ ] Set `ENABLE_CRON=true` for scheduled jobs (overdue invoices, reminders)

---

## 9. QUICK START (TL;DR)

```bash
# Terminal 1 — Backend
cd mybusiness-backend
npm install
npx prisma generate && npx prisma migrate dev --name init && npm run db:seed
npm run dev

# Terminal 2 — Frontend  
cd mybusiness-frontend
npm install
npm run dev

# Open browser
open http://localhost:3000
# Login: admin@acmetech.in / Admin@1234
```
