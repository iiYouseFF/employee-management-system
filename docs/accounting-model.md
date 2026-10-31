# Accounting Model & Specifications

## 1. Role-Based Access Control (RBAC)

### Roles & Security Model
- **Manager (`manager`)**:
  - Full CRUD permissions across all system tables (`customers`, `cash_invoices`, `credit_invoices`, `payments`, `suppliers`, `supplier_purchases`, `supplier_payments`, `products`, `expenses`).
  - Access to team management, representative assignment, executive KPI dashboard, and supplier accounting.
- **Sales Rep (`sales_rep`)**:
  - Strict read-only access enforced at both Database RLS and Frontend levels.
  - Can only query their own assigned customers and related invoices/payments.
  - Can view and print the Product Price List.
   - No access to Suppliers, operational expenses, or Manager Financial KPIs.

### Enforcement Details (migration `0014_rbac_hardening_v2`)
- **Database is the boundary.** Reps hold only `select` policies; every write on customers, invoices, payments, suppliers, products and expenses is rejected at the DB (0 rows affected or RLS error), regardless of the UI.
- **Confirmation gate.** `current_role_name()` / `current_owner_id()` return `null` until `auth.users.email_confirmed_at` is set, so an unconfirmed account has no role and sees no rows (products included). The UI shows the «لا تملك صلاحية الوصول» screen in that case.
- **Provisioning is centralised.** `public.provision_user_role(uuid)` (SECURITY DEFINER, execute revoked from `public`/`anon`/`authenticated`) is the only role-granting path. It runs from `handle_new_user()` on signup and `handle_user_email_confirmed()` when confirmation arrives.
- **Role escalation is impossible from the client.** `user_roles` has RLS with no client-facing policy and no table grant; a rep cannot promote itself. `sync_rep_role` never demotes a manager and never moves a role across owners.
- **Rep identity is bound to one row.** `uq_reps_user_id` (partial unique index) guarantees one rep row per user, so `get_current_rep_id()` is unambiguous.
- **Rep visibility rule.** A rep sees a customer when `representative_id = get_current_rep_id()`, and sees an invoice/payment when it carries their `rep_id` or belongs to one of their customers. There is no cross-rep visibility.
- **Search path hardening.** Every `public` SECURITY DEFINER function runs with `search_path = public, pg_temp`; `auth` objects stay fully qualified.

---

## 2. Supplier Cash & Credit Management (Accounts Payable)

### Transaction Handling
- **Credit Purchases (`payment_type = 'credit'`)**:
  - Increases the amount owed to the supplier.
  - Recorded as a credit entry on the supplier ledger.
- **Cash Purchases (`payment_type = 'cash'`)**:
  - Paid immediately upon receipt.
  - Treated as operational cash outflow in the KPI calculations, netting to zero on the supplier's running credit balance.
- **Supplier Payments**:
  - Decreases the amount owed to the supplier.
  - Recorded as a debit entry on the supplier ledger.
- **Supplier Running Balance Calculation**:
  $$\text{Supplier Balance} = \text{Opening Balance} + \sum \text{Credit Purchases} - \sum \text{Payments}$$

---

## 3. Cumulative Accounting Statements (كشف حساب تراكمي)

Both Customer and Supplier statements use a chronological running balance model:

### Sign Conventions

| Account Type | Debit (مدين) | Credit (دائن) | Running Balance Formula |
|---|---|---|---|
| **Customer (Receivables)** | Credit Invoice (زيادة مديونية العميل) | Payments received / Down payment (سداد العميل) | $\text{Opening} + \sum (\text{Debit} - \text{Credit})$ |
| **Supplier (Payables)** | Payment to supplier (سداد للمورد) | Credit Purchase (فاتورة مشتريات آجل) | $\text{Opening} + \sum (\text{Credit} - \text{Debit})$ |

- **Opening Balance (`رصيد أول المدة`)**:
  - Represents the account's historical balance before the filtered start date (`p_from`).
  - Correctly calculated via the Postgres RPCs: [customer_statement](file:///c:/Users/youse/Programming/Employee%20Management%20System/supabase/migrations/0010_all_features_management.sql) and [supplier_statement](file:///c:/Users/youse/Programming/Employee%20Management%20System/supabase/migrations/0010_all_features_management.sql).

---

## 4. Manager Financial KPI Dashboard

1. **Income vs Outcome**:
   - **Income**: All collected cash $\rightarrow \text{Cash Invoices} + \text{Payments Received on Credit}$.
   - **Outcome**: Total outflows $\rightarrow \text{Supplier Payments} + \text{Cash Purchases} + \text{Operational Expenses}$.
   - **Net Cash**: $\text{Income} - \text{Outcome}$.
2. **Receivables & Payables**:
   - **Total Receivables**: Sum of remaining unpaid balances on customer credit invoices.
   - **Total Payables**: Net outstanding debt owed to suppliers.
3. **Financial Velocity Metrics**:
   - **DSO (Days Sales Outstanding)**:
     $$\text{DSO} = \frac{\text{Outstanding Receivables}}{\text{Credit Sales in Period}} \times \text{Days in Period}$$
   - **Average Collection Days**: Average number of days between invoice issuance and payment.
   - **30-Day Collection Rate**: Percentage of credit payments collected within 30 days of the invoice date.
   - **Receivables Aging**: Split into standard aging buckets: `0-30 days`, `31-60 days`, `61-90 days`, `90+ days`.
