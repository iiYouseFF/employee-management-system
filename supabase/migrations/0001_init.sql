create extension if not exists "pgcrypto";

create table app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade unique,
  title text not null default 'المؤسسة المصرية لتوزيع المواد الغذائية',
  tab_names jsonb not null default '{
    "cash":"البيع النقدي","credit":"البيع الآجل","payments":"الدفعات",
    "statement":"كشف حساب العملاء","monthly":"الملخص الشهري","customers":"العملاء","reps":"إدارة المناديب"}'::jsonb,
  updated_at timestamptz not null default now()
);

create table reps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table cash_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  invoice_no text not null default '',
  customer_id uuid references customers(id) on delete restrict,
  rep_id uuid references reps(id) on delete restrict,
  item text not null default 'مواد غذائية',
  amount numeric(14,2) not null default 0 check (amount >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table credit_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  invoice_no text not null,
  customer_id uuid references customers(id) on delete restrict,
  rep_id uuid references reps(id) on delete restrict,
  item text not null default 'مواد غذائية',
  amount numeric(14,2) not null default 0 check (amount >= 0),
  due_date date not null default (current_date + 30),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, invoice_no)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  customer_id uuid references customers(id) on delete restrict,
  rep_id uuid references reps(id) on delete restrict,
  credit_invoice_id uuid references credit_invoices(id) on delete set null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  method text not null default 'نقدي'
    check (method in ('نقدي','تحويل بنكي','شيك','محفظة إلكترونية','آجل')),
  created_at timestamptz not null default now()
);

create index on cash_invoices (owner_id, date);
create index on credit_invoices (owner_id, date);
create index on payments (owner_id, date);
create index on payments (credit_invoice_id);

-- RLS
alter table app_settings enable row level security;
alter table reps enable row level security;
alter table customers enable row level security;
alter table cash_invoices enable row level security;
alter table credit_invoices enable row level security;
alter table payments enable row level security;

create policy "own rows settings" on app_settings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own rows reps" on reps for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own rows customers" on customers for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own rows cash" on cash_invoices for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own rows credit" on credit_invoices for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own rows payments" on payments for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Seed default reps + settings on signup
create or replace function handle_new_user() returns trigger 
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.app_settings (owner_id) values (new.id);
  insert into public.reps (owner_id, name) values (new.id,'سارة'),(new.id,'عمرو أحمد'),(new.id,'مندوب التوزيع');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created 
  after insert on auth.users
  for each row execute function public.handle_new_user();
