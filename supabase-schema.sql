-- ============================================================
-- SUNRISE FREIGHT MOVERS — Supabase Schema
-- Run this entire file in Supabase SQL Editor once.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. SETTINGS
-- ============================================================
create table if not exists settings (
  key text primary key,
  value text
);
insert into settings (key, value) values
  ('COMPANY_NAME', 'SUNRISE FREIGHT MOVERS PRIVATE LIMITED'),
  ('GST_NO', ''),
  ('ADDRESS_LINE1', ''),
  ('ADDRESS_LINE2', ''),
  ('CITY_STATE_PIN', ''),
  ('PF_EMP_PERCENT', '12'),
  ('PF_ER_PERCENT', '13.61'),
  ('ESI_EMP_PERCENT', '0.75'),
  ('ESI_ER_PERCENT', '3.25'),
  ('PF_WAGE_CAP', '15000'),
  ('PAN_DEDUCTOR', ''),
  ('TAN_DEDUCTOR', ''),
  ('FEB_300_MODE', 'Yes'),
  ('PT_STATE', 'Maharashtra')
on conflict (key) do nothing;

-- ============================================================
-- 2. BRANCHES
-- ============================================================
create table if not exists branches (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  state text not null default 'Karnataka',
  status text not null default 'Active',
  created_at timestamptz default now()
);
insert into branches (code, state) values
  ('DR','Karnataka'),('DAN','Karnataka'),('BNG','Karnataka'),
  ('HO','Karnataka'),('MNG','Karnataka'),('KPM','Karnataka'),
  ('VAPI','Gujarat'),('DAHEJ','Gujarat'),('MORBI','Gujarat'),('SURAT','Gujarat'),
  ('CHENNAI','Tamil Nadu'),('CHENNAI (P)','Tamil Nadu'),('TUTICORIN','Tamil Nadu'),
  ('HYD','Telangana'),
  ('RAIPUR','Chhattisgarh'),
  ('CAL','West Bengal'),
  ('NAGPUR','Maharashtra')
on conflict (code) do nothing;

-- ============================================================
-- 3. ADMINS (salary system users)
-- ============================================================
create table if not exists admins (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password_hash text not null,       -- store bcrypt hash; we use plain for simplicity + RLS
  full_name text not null,
  role text not null default 'Admin', -- 'Admin' | 'Manager'
  status text not null default 'Active',
  created_at timestamptz default now()
);
-- Insert default admin (password: admin123 — CHANGE THIS IMMEDIATELY)
insert into admins (username, password_hash, full_name, role) values
  ('admin', 'admin123', 'System Admin', 'Admin')
on conflict (username) do nothing;

-- ============================================================
-- 4. BRANCH USERS (attendance portal users)
-- ============================================================
create table if not exists branch_users (
  id uuid primary key default uuid_generate_v4(),
  branch_code text not null references branches(code),
  pin text not null,
  status text not null default 'Active',
  created_at timestamptz default now(),
  unique(branch_code)
);

-- ============================================================
-- 5. EMPLOYEES
-- ============================================================
create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  emp_id text unique not null,
  name text not null,
  branch text not null,
  designation text,
  department text,
  status text default 'Active',
  join_date date,
  basic numeric default 0,
  da numeric default 0,
  hra numeric default 0,
  conveyance numeric default 0,
  fooding numeric default 0,
  other_allowance numeric default 0,
  pf_applicable text default 'Basic Salary',
  esi_applicable text default 'Yes',
  custom_pf_salary numeric default 0,
  pan text,
  uan text,
  esi_number text,
  phone text,
  email text,
  bank_account text,
  ifsc text,
  addr1 text,
  addr2 text,
  city text,
  state text,
  pin text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 6. SALARY ENTRIES
-- ============================================================
create table if not exists salary_entries (
  id uuid primary key default uuid_generate_v4(),
  month text not null,
  emp_id text not null,
  branch text not null,
  name text not null,
  basic numeric default 0,
  da numeric default 0,
  hra numeric default 0,
  conveyance numeric default 0,
  fooding numeric default 0,
  others numeric default 0,
  gross numeric default 0,
  days_present numeric default 0,
  total_days numeric default 30,
  pf_salary numeric default 0,
  pf_emp numeric default 0,
  esi_emp numeric default 0,
  professional_tax numeric default 0,
  total_deductions numeric default 0,
  net_salary numeric default 0,
  co_pf numeric default 0,
  co_esi numeric default 0,
  bonus numeric default 0,
  status text default 'Paid',
  payment_date date,
  processed_by text,
  created_at timestamptz default now(),
  unique(month, emp_id)
);

-- ============================================================
-- 7. LEAVE / LOP
-- ============================================================
create table if not exists leave_entries (
  id uuid primary key default uuid_generate_v4(),
  emp_id text not null,
  emp_name text not null,
  branch text not null,
  month text not null,
  leave_type text default 'CL',
  days_taken numeric default 0,
  lop_days numeric default 0,
  lop_amount numeric default 0,
  remarks text,
  created_at timestamptz default now()
);

-- ============================================================
-- 8. ATTENDANCE
-- ============================================================
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  branch_code text not null,
  emp_id text not null,
  att_date date not null,
  status text not null check (status in ('Present','Absent','Half Day','Leave')),
  marked_by text,
  created_at timestamptz default now(),
  unique(branch_code, emp_id, att_date)
);

-- Track last submitted date per branch (for lockout rule)
create table if not exists attendance_sessions (
  branch_code text primary key,
  last_submitted_date date,
  updated_at timestamptz default now()
);

-- ============================================================
-- 9. AUDIT LOG
-- ============================================================
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  timestamp timestamptz default now(),
  user_name text,
  action text,
  details text,
  module text
);

-- ============================================================
-- ROW LEVEL SECURITY — disable for simplicity (anon key access)
-- For production, enable RLS and create proper policies.
-- ============================================================
alter table settings enable row level security;
alter table branches enable row level security;
alter table admins enable row level security;
alter table branch_users enable row level security;
alter table employees enable row level security;
alter table salary_entries enable row level security;
alter table leave_entries enable row level security;
alter table attendance enable row level security;
alter table attendance_sessions enable row level security;
alter table audit_log enable row level security;

-- Allow anon key full access (since we handle auth in JS)
create policy "allow_all_settings" on settings for all using (true) with check (true);
create policy "allow_all_branches" on branches for all using (true) with check (true);
create policy "allow_all_admins" on admins for all using (true) with check (true);
create policy "allow_all_branch_users" on branch_users for all using (true) with check (true);
create policy "allow_all_employees" on employees for all using (true) with check (true);
create policy "allow_all_salary" on salary_entries for all using (true) with check (true);
create policy "allow_all_leave" on leave_entries for all using (true) with check (true);
create policy "allow_all_attendance" on attendance for all using (true) with check (true);
create policy "allow_all_sessions" on attendance_sessions for all using (true) with check (true);
create policy "allow_all_audit" on audit_log for all using (true) with check (true);
