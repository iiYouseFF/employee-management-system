# Sales Management & Accounting System: User Playbook

Welcome to the complete user guide for the sales distribution and financial accounting system. It is built for distribution companies and trading businesses, and gives you precise control over sales, supplier tracking, cumulative account statements, and financial performance indicators.

---

## Table of Contents
1. [Roles and Access Control (RBAC)](#1-roles-and-access-control-rbac)
2. [Signing In and Setting Up Sales Reps](#2-signing-in-and-setting-up-sales-reps)
3. [Managing Customers and Sales (Cash and Credit)](#3-managing-customers-and-sales-cash-and-credit)
4. [Cumulative Account Statements (Customer Statement)](#4-cumulative-account-statements-customer-statement)
5. [Managing Suppliers and Purchases (Accounts Payable)](#5-managing-suppliers-and-purchases-accounts-payable)
6. [Price List and Printable Product Catalog](#6-price-list-and-printable-product-catalog)
7. [Manager Financial KPI Dashboard](#7-manager-financial-kpi-dashboard)
8. [Reports, Data Export, and Printing](#8-reports-data-export-and-printing)

---

## 1. Roles and Access Control (RBAC)

The system has two types of users.

### A. Manager (Admin)
- **Access**: Full, unrestricted access to every function in the system.
- **Manager-only tasks**:
  - Add, edit, and delete sales reps, and invite them by email.
  - Manage suppliers, purchase invoices, and supplier payments.
  - View the financial KPI dashboard, receivables aging, and cash liquidity.
  - Add and edit product prices in the catalog.
  - Filter and browse any rep's data, or view company-wide totals.

### B. Sales Rep
- **Access**: **Read-only**, strictly enforced at the database level.
- **Scope**:
  - Sees **only** the customers assigned to them, along with those customers' invoices and payments.
  - Cannot edit, delete, or add customer records or financial records.
  - Can view and print the approved price list (catalog) for use during field visits.
  - Cannot access the Suppliers tab or the manager's financial dashboard.

---

## 2. Signing In and Setting Up Sales Reps

### Signing In
1. Open the system in your browser at `http://localhost:5173` (or your deployment URL).
2. Enter your email address and password.
3. The system automatically verifies your role:
   - If the account belongs to a registered sales rep, Sales Rep mode is activated and a badge appears: `Sales Rep: [Name] (View Only)`.
   - If the account belongs to the owner, you enter in Manager mode with full permissions.

### Managing and Inviting Sales Reps (Manager Only)
1. At the top of the home page, find the **Sales Rep Management & Invitations** bar.
2. Click **+ Add New Sales Rep**.
3. Enter:
   - **Rep name** (e.g., Ahmed Mostafa).
   - **Rep email address** (important: this links their account when they sign in).
   - **Phone number**.
4. When the rep creates an account with the same email address, it is linked automatically and their permissions are restricted accordingly.

---

## 3. Managing Customers and Sales (Cash and Credit)

### A. Customer Directory (Customers Tab)
- **Add a customer**: Click **+ New Customer**, enter the customer's name and phone number, and select the responsible sales rep.
- **Edit / delete**: Available to managers only, using the action buttons next to each customer.
- **Cumulative statement**: Click **Statement** to open the customer's live cumulative account record.

### B. Cash Sales (Cash Tab)
- Use this tab to record invoices paid in full at the time of sale, with no outstanding balance.
- Enter the invoice number, invoice date, customer name, sales rep, description, and amount.

### C. Credit Sales (Credit Tab)
- Use this tab to record credit invoices that increase the customer's outstanding balance.
- Enter the invoice number, customer, sales rep, total amount, due date, and any down payment.
- The remaining balance and invoice status (`Unpaid`, `Partial`, `Paid`) are tracked automatically.

### D. Customer Payments (Payments Tab)
- Use this tab to record payments received from customers against credit invoices or on account.
- Select the customer, sales rep, linked invoice, amount paid, and payment method (`Cash`, `Bank Transfer`, `Cheque`, `E-Wallet`).

---

## 4. Cumulative Account Statements (Customer Statement)

The cumulative statement follows standard accounting principles:
- **Debit (+)**: Credit invoices, which increase the customer's balance owed to the company.
- **Credit (−)**: Payments received and down payments, which reduce that balance.
- **Opening balance**: When you select a date range (from – to), the system calculates the customer's net balance before the start date and shows it as the first row.
- **Running balance**: Calculated row by row in chronological order.
- **Export and print**: Print the statement directly, or export it to **Excel (CSV)** with one click.

---

## 5. Managing Suppliers and Purchases (Accounts Payable)

The **Suppliers & Purchases** tab (manager only) has four main sections.

### A. Supplier Directory
- Record supplier details: name, phone, address, tax number, and an opening balance if applicable.
- Each supplier shows their current balance and a direct button to their statement.

### B. Purchase Invoice Log
- Click **+ Record Purchase Invoice**.
- Select the supplier, enter the invoice number, and set the purchase date.
- **Purchase method**:
  - **Credit**: Increases the amount owed to the supplier and appears in the statement and liabilities.
  - **Cash**: Paid immediately and counted as a cash outflow.

### C. Supplier Payments
- Click **+ Pay Supplier**.
- Select the supplier, enter the amount, choose the payment method (`Cash`, `Cheque`, `Bank Transfer`), and add a reference or cheque number.
- The payment is deducted from the supplier's balance immediately.

### D. Cumulative Supplier Statement
- Select a supplier to view their transactions (purchases and payments) with a continuous running balance.

---

## 6. Price List and Printable Product Catalog

The **Price List & Catalog** tab provides a central product database.
- **Add a product**: Arabic name, English name, product code (SKU), category, unit, and selling price.
- **Search and filter**: Search quickly, or filter by category.
- **Field printing (A4)**:
  - Click **Print Price List (A4)**.
  - The page formats itself to A4 and hides all app buttons and navigation bars, so reps can print it and hand it to customers.

---

## 7. Manager Financial KPI Dashboard

The **Financial KPIs** tab is reserved for managers and gives a strategic view of liquidity and collections.

1. **Income vs. Outcome**:
   - **Total income**: Cash actually collected from sales and payments.
   - **Total outcome**: Supplier payments, cash purchases, and expenses.
   - **Net cash flow**: The liquidity surplus or deficit for the period.
2. **Days Sales Outstanding (DSO)**:
   - The estimated number of days it takes to collect credit sales.
3. **Receivables Aging**:
   - A chart that groups customer debts into `0–30 days`, `31–60 days`, `61–90 days`, and `90+ days`, so overdue balances stand out quickly.
4. **Collection and Liquidity Ratios**:
   - Cash sales vs. credit sales as a percentage.
   - Cash collected vs. customer receivables and supplier liabilities.

---

## 8. Reports, Data Export, and Printing

- **CSV export**: Available on account statements and the home page, for opening in tools such as Microsoft Excel.
- **Printing**: Every screen and statement is formatted for clean, uncluttered printing.
- **Language support (RTL)**: The interface fully supports Arabic right-to-left layout, with accurately aligned accounting figures.