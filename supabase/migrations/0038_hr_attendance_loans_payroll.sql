-- 0038_hr_attendance_loans_payroll.sql
-- Employee Attendance, Loans, Bonuses, Deductions, Overtime & Monthly Payroll Module.
-- Additive and idempotent: safe to re-run; preserves existing data.
--
-- Rollback notes:
--   DROP FUNCTION IF EXISTS public.monthly_payroll_summary(int, int);
--   DROP TRIGGER IF EXISTS trg_sync_rep_to_employee ON public.reps;
--   DROP FUNCTION IF EXISTS public.fn_sync_rep_to_employee();
--   DROP TABLE IF EXISTS public.employee_adjustments;
--   DROP TABLE IF EXISTS public.employee_loans;
--   DROP TABLE IF EXISTS public.attendance_logs;
--   DROP TABLE IF EXISTS public.employees;

-- ---------------------------------------------------------------------------
-- 1. public.employees (Covers Sales Reps + Warehouse/Office Staff)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT public.current_owner_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  rep_id uuid UNIQUE REFERENCES public.reps(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  job_title text NOT NULL DEFAULT 'موظف',
  base_salary numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (base_salary >= 0),
  shift_start time NOT NULL DEFAULT '09:00:00',
  shift_end time NOT NULL DEFAULT '17:00:00',
  overtime_hourly_rate numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (overtime_hourly_rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_owner_active ON public.employees (owner_id, is_active);

-- Backfill existing reps into public.employees
INSERT INTO public.employees (owner_id, rep_id, full_name, phone, job_title, is_active)
SELECT
  r.owner_id,
  r.id,
  r.name,
  r.phone,
  'مندوب مبيعات',
  COALESCE(r.is_active, true)
FROM public.reps r
ON CONFLICT (rep_id) DO NOTHING;

-- Auto-sync trigger for future reps inserts/updates
CREATE OR REPLACE FUNCTION public.fn_sync_rep_to_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.employees (owner_id, rep_id, full_name, phone, job_title, is_active)
  VALUES (
    NEW.owner_id,
    NEW.id,
    NEW.name,
    NEW.phone,
    'مندوب مبيعات',
    COALESCE(NEW.is_active, true)
  )
  ON CONFLICT (rep_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rep_to_employee ON public.reps;
CREATE TRIGGER trg_sync_rep_to_employee
  AFTER INSERT OR UPDATE ON public.reps
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_rep_to_employee();

-- ---------------------------------------------------------------------------
-- 2. public.attendance_logs (Daily Attendance & Departure)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT public.current_owner_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  check_in_time time,
  check_out_time time,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0.00 CHECK (overtime_hours >= 0),
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_owner_date ON public.attendance_logs (owner_id, work_date);

-- ---------------------------------------------------------------------------
-- 3. public.employee_loans (Advances & Installments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT public.current_owner_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  loan_date date NOT NULL DEFAULT current_date,
  total_amount numeric(14,2) NOT NULL CHECK (total_amount > 0),
  monthly_installment numeric(14,2) NOT NULL CHECK (monthly_installment > 0),
  remaining_amount numeric(14,2) NOT NULL CHECK (remaining_amount >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  notes text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_loans_owner_emp ON public.employee_loans (owner_id, employee_id, status);

-- ---------------------------------------------------------------------------
-- 4. public.employee_adjustments (Bonuses, Deductions, Overtime, Loan Repayments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT public.current_owner_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tx_date date NOT NULL DEFAULT current_date,
  kind text NOT NULL CHECK (kind IN ('bonus', 'deduction', 'overtime', 'loan_repayment')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  hours numeric(6,2),
  reason text,
  loan_id uuid REFERENCES public.employee_loans(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_adj_owner_date ON public.employee_adjustments (owner_id, tx_date, kind);

-- ---------------------------------------------------------------------------
-- 5. Monthly Payroll Aggregation RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monthly_payroll_summary(p_year int, p_month int)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  job_title text,
  phone text,
  present_days bigint,
  absent_days bigint,
  late_days bigint,
  total_overtime_hours numeric,
  total_late_minutes bigint,
  base_salary numeric,
  overtime_total numeric,
  bonuses_total numeric,
  deductions_total numeric,
  active_loan_balance numeric,
  suggested_loan_deduction numeric,
  net_salary numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_start date;
  v_end date;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden: managers only';
  END IF;

  v_owner_id := public.current_owner_id();
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  RETURN QUERY
  WITH att AS (
    SELECT
      a.employee_id,
      COUNT(*) FILTER (WHERE a.status IN ('present', 'late')) AS present_days,
      COUNT(*) FILTER (WHERE a.status = 'absent') AS absent_days,
      COUNT(*) FILTER (WHERE a.status = 'late') AS late_days,
      COALESCE(SUM(a.overtime_hours), 0)::numeric(10,2) AS att_overtime_hours,
      COALESCE(SUM(a.late_minutes), 0)::bigint AS total_late_minutes
    FROM public.attendance_logs a
    WHERE a.owner_id = v_owner_id
      AND a.work_date BETWEEN v_start AND v_end
    GROUP BY a.employee_id
  ),
  adj AS (
    SELECT
      j.employee_id,
      COALESCE(SUM(j.amount) FILTER (WHERE j.kind = 'overtime'), 0)::numeric(14,2) AS adj_overtime_total,
      COALESCE(SUM(j.hours) FILTER (WHERE j.kind = 'overtime'), 0)::numeric(10,2) AS adj_overtime_hours,
      COALESCE(SUM(j.amount) FILTER (WHERE j.kind = 'bonus'), 0)::numeric(14,2) AS bonuses_total,
      COALESCE(SUM(j.amount) FILTER (WHERE j.kind = 'deduction'), 0)::numeric(14,2) AS deductions_total
    FROM public.employee_adjustments j
    WHERE j.owner_id = v_owner_id
      AND j.tx_date BETWEEN v_start AND v_end
    GROUP BY j.employee_id
  ),
  loans AS (
    SELECT
      l.employee_id,
      COALESCE(SUM(l.remaining_amount), 0)::numeric(14,2) AS active_loan_balance,
      COALESCE(SUM(LEAST(l.remaining_amount, l.monthly_installment)), 0)::numeric(14,2) AS suggested_loan_deduction
    FROM public.employee_loans l
    WHERE l.owner_id = v_owner_id
      AND l.status = 'active'
      AND l.remaining_amount > 0
    GROUP BY l.employee_id
  )
  SELECT
    e.id AS employee_id,
    e.full_name,
    e.job_title,
    e.phone,
    COALESCE(att.present_days, 0)::bigint AS present_days,
    COALESCE(att.absent_days, 0)::bigint AS absent_days,
    COALESCE(att.late_days, 0)::bigint AS late_days,
    (COALESCE(att.att_overtime_hours, 0) + COALESCE(adj.adj_overtime_hours, 0))::numeric AS total_overtime_hours,
    COALESCE(att.total_late_minutes, 0)::bigint AS total_late_minutes,
    e.base_salary,
    (
      COALESCE(adj.adj_overtime_total, 0)
      + ROUND(COALESCE(att.att_overtime_hours, 0) * e.overtime_hourly_rate, 2)
    )::numeric(14,2) AS overtime_total,
    COALESCE(adj.bonuses_total, 0)::numeric(14,2) AS bonuses_total,
    COALESCE(adj.deductions_total, 0)::numeric(14,2) AS deductions_total,
    COALESCE(loans.active_loan_balance, 0)::numeric(14,2) AS active_loan_balance,
    COALESCE(loans.suggested_loan_deduction, 0)::numeric(14,2) AS suggested_loan_deduction,
    (
      e.base_salary
      + COALESCE(adj.adj_overtime_total, 0)
      + ROUND(COALESCE(att.att_overtime_hours, 0) * e.overtime_hourly_rate, 2)
      + COALESCE(adj.bonuses_total, 0)
      - COALESCE(adj.deductions_total, 0)
      - COALESCE(loans.suggested_loan_deduction, 0)
    )::numeric(14,2) AS net_salary
  FROM public.employees e
  LEFT JOIN att ON att.employee_id = e.id
  LEFT JOIN adj ON adj.employee_id = e.id
  LEFT JOIN loans ON loans.employee_id = e.id
  WHERE e.owner_id = v_owner_id
    AND e.is_active = true
  ORDER BY e.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.monthly_payroll_summary(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monthly_payroll_summary(int, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS Policies & Audit Triggers
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;

-- employees policies
DROP POLICY IF EXISTS employees_manager_all ON public.employees;
CREATE POLICY employees_manager_all ON public.employees
  FOR ALL TO authenticated
  USING (public.is_manager() AND owner_id = public.current_owner_id())
  WITH CHECK (public.is_manager() AND owner_id = public.current_owner_id());

DROP POLICY IF EXISTS employees_rep_select_own ON public.employees;
CREATE POLICY employees_rep_select_own ON public.employees
  FOR SELECT TO authenticated
  USING (
    owner_id = public.current_owner_id()
    AND rep_id IN (SELECT id FROM public.reps WHERE user_id = auth.uid())
  );

-- attendance_logs policies
DROP POLICY IF EXISTS attendance_manager_all ON public.attendance_logs;
CREATE POLICY attendance_manager_all ON public.attendance_logs
  FOR ALL TO authenticated
  USING (public.is_manager() AND owner_id = public.current_owner_id())
  WITH CHECK (public.is_manager() AND owner_id = public.current_owner_id());

DROP POLICY IF EXISTS attendance_rep_select_own ON public.attendance_logs;
CREATE POLICY attendance_rep_select_own ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (
    owner_id = public.current_owner_id()
    AND employee_id IN (
      SELECT e.id FROM public.employees e
      JOIN public.reps r ON r.id = e.rep_id
      WHERE r.user_id = auth.uid()
    )
  );

-- employee_loans policies (manager only)
DROP POLICY IF EXISTS employee_loans_manager_all ON public.employee_loans;
CREATE POLICY employee_loans_manager_all ON public.employee_loans
  FOR ALL TO authenticated
  USING (public.is_manager() AND owner_id = public.current_owner_id())
  WITH CHECK (public.is_manager() AND owner_id = public.current_owner_id());

-- employee_adjustments policies (manager only)
DROP POLICY IF EXISTS employee_adjustments_manager_all ON public.employee_adjustments;
CREATE POLICY employee_adjustments_manager_all ON public.employee_adjustments
  FOR ALL TO authenticated
  USING (public.is_manager() AND owner_id = public.current_owner_id())
  WITH CHECK (public.is_manager() AND owner_id = public.current_owner_id());

-- Audit triggers
DROP TRIGGER IF EXISTS trg_audit_employees ON public.employees;
CREATE TRIGGER trg_audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_attendance_logs ON public.attendance_logs;
CREATE TRIGGER trg_audit_attendance_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_employee_loans ON public.employee_loans;
CREATE TRIGGER trg_audit_employee_loans
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_employee_adjustments ON public.employee_adjustments;
CREATE TRIGGER trg_audit_employee_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
