create table if not exists public.budget_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('daily', 'weekly', 'monthly')),
  amount integer not null check (amount > 0),
  reminder_time text not null default '20:30',
  start_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  note text not null default '',
  category text not null default 'other',
  date_key date not null,
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists category text not null default 'other';

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, date_key desc, created_at desc);

alter table public.budget_settings enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Users can read their own budget settings" on public.budget_settings;
drop policy if exists "Users can insert their own budget settings" on public.budget_settings;
drop policy if exists "Users can update their own budget settings" on public.budget_settings;
drop policy if exists "Users can delete their own budget settings" on public.budget_settings;

create policy "Users can read their own budget settings"
  on public.budget_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own budget settings"
  on public.budget_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own budget settings"
  on public.budget_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own budget settings"
  on public.budget_settings
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own expenses" on public.expenses;
drop policy if exists "Users can insert their own expenses" on public.expenses;
drop policy if exists "Users can update their own expenses" on public.expenses;
drop policy if exists "Users can delete their own expenses" on public.expenses;

create policy "Users can read their own expenses"
  on public.expenses
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own expenses"
  on public.expenses
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own expenses"
  on public.expenses
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own expenses"
  on public.expenses
  for delete
  to authenticated
  using (auth.uid() = user_id);
