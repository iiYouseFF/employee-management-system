-- 0003: customer representative assignment (+ phone backfill safety)
--
-- Reconstructed from the live schema: the repo migration was committed empty,
-- so a database built from this folder alone was missing the representative
-- columns used by CustomersTab and the report dialog.
--
-- representative_id  -> FK to reps, cleared when the rep is deleted
-- representative_name -> denormalised display name kept by the app

alter table public.customers
  add column if not exists phone text;

alter table public.customers
  add column if not exists representative_id uuid references public.reps(id) on delete set null;

alter table public.customers
  add column if not exists representative_name text;
