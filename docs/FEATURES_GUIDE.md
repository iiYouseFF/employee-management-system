# Employee Management System — Complete Features Guide

A comprehensive reference of every feature in the application, how it works, who can access it, and where its implementation lives.

---

## 1. Authentication & Role-Based Access (`src/features/auth/`)
- **What it does:** Authenticates users via Supabase Auth (email/password) and enforces role-based access control (`manager` vs `sales_rep`).
- **How it works:**
  - `useAuth` loads the current session, user role, and linked `repProfile` (if the user is a sales rep).
  - **Managers** have full read/write access to all 18 tabs across 3 navigation groups (`المبيعات والعملاء`, `المشتريات والموردين`, `المخزون والتقارير`).
  - **Sales Reps** are scoped to their own data. The 8 core tabs (`customers`, `cash`, `credit`, `overdue_invoices`, `payments`, `statement`, `returns`, `products`) and print/export are enabled by default; a manager can grant or revoke each view and write action per rep from «الصلاحيات» in the reps panel (`reps.permissions`, enforced by RLS and RPC guards). Inventory and monthly reports are opt-in.
  - Users can update their password anytime via `ChangePasswordModal` from the header.

---

## 2. Navigation, Quick Actions & Money System (`src/app/`, `src/shared/`)
- **What it does:** Provides the sticky RTL Arabic shell, grouped navigation, quick-create shortcuts, and a dedicated financial number system.
- **How it works:**
  - `Sheet.tsx` & `AppNavigation.tsx` organize tabs into 3 groups with live overdue invoice count badges and a manager-only **Quick Actions** bar (`+ فاتورة نقدي`, `+ فاتورة آجل`, `+ دفعة عميل`, `+ مشتريات مورد`).
  - `src/shared/lib/format.ts` & `src/shared/ui/MoneyText.tsx` implement `Intl.NumberFormat('ar-EG-u-nu-latn')` with integer-piastre rounding (`toPiastres` / `fromPiastres`) to prevent floating-point drift, rendering Western digits in `Plus Jakarta Sans` alongside bold `Cairo` Arabic typography.

---

## 3. Customers (`src/features/customers/`)
- **What it does:** Manages the customer directory, assigned sales rep, contact info, and opening balances.
- **How it works:**
  - `CustomersTab.tsx` supports search, rep filtering, pagination, and responsive desktop table / mobile card views.
  - Managers can add, edit, or delete customers; both roles can open a customer's statement directly from the row.

---

## 4. Cash Sales (`src/features/sales/CashTab.tsx`)
- **What it does:** Records and manages cash invoices (`فاتورة نقدي`) with immediate full payment.
- **How it works:**
  - Invoices can be saved as `draft` or `confirmed` using `InvoiceLineEditor` (supporting product search, unit selection, quantities, prices, and bulk product matrix entry).
  - Confirming a cash invoice deducts stock from inventory and records cash inflow.

---

## 5. Credit Sales (`src/features/sales/CreditTab.tsx`)
- **What it does:** Records and manages credit/deferred invoices (`فاتورة آجل`) with due dates, initial down payments, and remaining balances.
- **How it works:**
  - Tracks `amount`, `paid` + `linked_payments`, `remaining`, `due_date`, and payment status (`مدفوعة`, `جزئية`, `غير مسددة`, `متأخرة`).
  - Displays live customer unpaid balance when creating/editing an invoice.

---

## 6. Overdue & Unpaid Invoices (`src/features/sales/OverdueInvoicesTab.tsx`)
- **What it does:** Highlights all unpaid and overdue credit invoices in one focused view, driving the red badge counter in navigation.
- **How it works:**
  - Filters `useUnpaidCreditInvoices()` by rep, search, and overdue status so managers and reps can prioritize collections.

---

## 7. Customer Payments (`src/features/payments/PaymentsTab.tsx`)
- **What it does:** Records customer collections (`المدفوعات`) against their account or linked to a specific credit invoice.
- **How it works:**
  - Supports payment methods (`نقدي`, `فودافون كاش`, `إنستاباي`, `تحويل بنكي`, `شيك`) with `PaymentMethodBadge`.
  - Shows the customer's live unpaid balance and includes a one-click **"سداد كامل المتبقي"** (settle full remaining) helper.

---

## 8. Sales Returns (`src/features/sales/ReturnsTab.tsx`)
- **What it does:** Manages customer product returns (`مرتجعات المبيعات`).
- **How it works:**
  - Each return line specifies quantity, unit price, and condition: **`salable` (سليم للمخزن)** which returns stock to inventory, or **`damaged` (تالف / هالك)** which records the loss without restocking salable inventory.

---

## 9. Customer & Supplier Statements (`src/features/statements/`, `src/features/suppliers/SupplierStatementTab.tsx`)
- **What it does:** Generates chronological running-balance account statements (`كشف حساب العميل` / `كشف حساب مورد`) with opening balances, debits, credits, and clickable reference links.
- **How it works:**
  - `StatementTable.tsx` renders desktop tables and mobile cards with `formatMoney`, plus clickable invoice/payment references (`StatementReferenceModal` / `InvoiceDetailsModal`).
  - Supports cumulative statements and PDF/WhatsApp sharing (`CumulativeCustomerStatementModal`, `SupplierStatementModal`).

---

## 10. Suppliers, Purchases & Supplier Payments (`src/features/suppliers/`)
- **What it does:** Full accounts-payable workflow across 4 tabs:
  - `SupplierDirectoryTab.tsx`: Supplier directory, opening balances, and live payable balance.
  - `SupplierPurchasesTab.tsx`: Cash and credit purchase invoices from suppliers (`SupplierPurchaseModal`), updating inventory and payables.
  - `SupplierPaymentsTab.tsx`: Outgoing payments to suppliers with payment method tracking and live payable balance.
  - `SupplierStatementTab.tsx`: Running-balance ledger per supplier.

---

## 11. Expenses (`src/features/expenses/ExpensesTab.tsx`)
- **What it does:** Tracks operational expenses (`المصاريف`) by category, date, amount, and description.
- **How it works:**
  - Managers can filter by date range/category, add/edit/delete expenses, and view total period outflow.

---

## 12. Products Catalog (`src/features/products/ProductsTab.tsx`)
- **What it does:** Manages the product catalog (`كتالوج الأسعار والمنتجات`), categories, units, and pricing.
- **How it works:**
  - Managers can create/edit products and prices; sales reps have read-only access to check current prices and product details.

---

## 13. Inventory Management (`src/features/inventory/InventoryTab.tsx`)
- **What it does:** Tracks real-time stock levels, low-stock alerts, and stock movement history (`المخزون`).
- **How it works:**
  - Automatically updates via sales, returns, and supplier purchases, and provides search, category filters, alert filters, and movement logs.

---

## 14. Dashboards & Monthly Reports (`src/features/dashboard/`)
- **What it does:** Executive financial visibility for managers:
  - `ManagerDashboardTab.tsx`: KPI cards (Income, Outcome, Net Cash Flow, DSO, COGS, Gross Margin, Receivables, Payables, 30-day Collection Rate) + interactive Recharts visualizations (Daily Cashflow AreaChart, Receivables Aging BarChart, Sales & Liquidity Donut PieCharts).
  - `MonthlyTab.tsx`: Annual/monthly breakdown in 3 views: detailed monthly table with carried-over balances, rep-by-month matrix, and per-rep summary cards.

---

## 15. Sales Reps Management (`src/features/reps/RepsTab.tsx`)
- **What it does:** Manages sales representatives (`إدارة المناديب`), their active status, and their linked auth accounts.
- **How it works:**
  - Managers can add, edit, or delete reps (with a guard preventing deletion of the last remaining rep).

---

## 16. Reporting, PDF & CSV Export (`src/features/reporting/`)
- **What it does:** Generates printable reports, PDFs, and CSV exports (`ReportModal.tsx`, `pdfGenerators.ts`, `report.ts`) accessible from the header `طباعة` and `تصدير CSV` buttons.

---

## 17. Audit Logs (`src/features/audit/AuditLogsTab.tsx`)
- **What it does:** Displays a chronological system audit trail (`سجل العمليات والنظام`) of create/update/delete operations across tables for manager oversight.

---

## 18. Settings (`src/features/settings/useSettings.ts`)
- **What it does:** Loads tenant-level configuration such as custom organization title and custom tab names (`tab_names`) used in the header and navigation.
