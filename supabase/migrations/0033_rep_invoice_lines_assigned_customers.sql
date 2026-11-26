-- Migration 0033: Sales reps can read invoice lines for assigned customers
--
-- Problem: `rep_read_invoice_lines` (0018) only allows reps to read lines where the
-- invoice header `rep_id` matches them. Header policies in 0014 also allow invoices
-- whose customer is assigned to the rep, so a rep could open such an invoice but
-- see zero line items.
--
-- Fix: recreate the SELECT policy with the same assigned-customer branch used by
-- `rep_read_cash` / `rep_read_credit`, while preserving the existing tenant and
-- manager exclusions. Additive and idempotent: DROP POLICY IF EXISTS + CREATE POLICY.
-- No table, column, data or type changes.
--
-- Rollback notes (restores the 0018 policy exactly):
--   DROP POLICY IF EXISTS "rep_read_invoice_lines" ON public.invoice_lines;
--   CREATE POLICY "rep_read_invoice_lines" ON public.invoice_lines
--     FOR SELECT
--     USING (
--       NOT public.is_manager()
--       AND owner_id = public.get_manager_id()
--       AND (
--         (invoice_type = 'cash'   AND invoice_id IN (SELECT id FROM public.cash_invoices   WHERE rep_id = public.get_current_rep_id()))
--         OR
--         (invoice_type = 'credit' AND invoice_id IN (SELECT id FROM public.credit_invoices WHERE rep_id = public.get_current_rep_id()))
--       )
--     );

DROP POLICY IF EXISTS "rep_read_invoice_lines" ON public.invoice_lines;

CREATE POLICY "rep_read_invoice_lines" ON public.invoice_lines
  FOR SELECT
  USING (
    NOT public.is_manager()
    AND owner_id = public.get_manager_id()
    AND (
      (
        invoice_type = 'cash'
        AND invoice_id IN (
          SELECT ci.id
          FROM public.cash_invoices ci
          WHERE ci.owner_id = public.get_manager_id()
            AND (
              ci.rep_id = public.get_current_rep_id()
              OR ci.customer_id IN (
                SELECT c.id
                FROM public.customers c
                WHERE c.owner_id = public.get_manager_id()
                  AND c.representative_id = public.get_current_rep_id()
              )
            )
        )
      )
      OR
      (
        invoice_type = 'credit'
        AND invoice_id IN (
          SELECT ci.id
          FROM public.credit_invoices ci
          WHERE ci.owner_id = public.get_manager_id()
            AND (
              ci.rep_id = public.get_current_rep_id()
              OR ci.customer_id IN (
                SELECT c.id
                FROM public.customers c
                WHERE c.owner_id = public.get_manager_id()
                  AND c.representative_id = public.get_current_rep_id()
              )
            )
        )
      )
    )
  );
