-- LjxMoney initial schema + Row Level Security.
--
-- Apply via Supabase Dashboard -> SQL Editor (paste & run), or:
--   npx supabase db push   (with a linked project)
--
-- Design notes (matches the app's real models in src/features/finance/models.ts):
-- * Composite primary keys (user_id, id): local IDs such as the default
--   "cash" wallet or "food" category exist for every user, so the identity
--   of a row is (user_id, id).
-- * Composite foreign keys (user_id, x_id) guarantee a user can never point
--   at another user's wallet/category/goal: the parent row must belong to the
--   same user or the insert fails with a FK violation.
-- * updated_at is maintained by the client because the sync engine uses
--   last-write-wins based on client timestamps. No server touch trigger.
-- * Deletions are hard deletes driven by local tombstones in the app; a full
--   pull detects rows removed on other devices.
-- * RLS is enabled on every table with auth.uid() = user_id policies only.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  color text not null default '#D7B56D',
  type text not null check (type in ('cash', 'bank', 'ewallet', 'card', 'savings', 'other')),
  icon text,
  initial_balance bigint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.wallets enable row level security;

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select using (auth.uid() = user_id);
drop policy if exists "wallets_insert_own" on public.wallets;
create policy "wallets_insert_own" on public.wallets
  for insert with check (auth.uid() = user_id);
drop policy if exists "wallets_update_own" on public.wallets;
create policy "wallets_update_own" on public.wallets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "wallets_delete_own" on public.wallets;
create policy "wallets_delete_own" on public.wallets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  color text not null default '#D7B56D',
  type text not null check (type in ('income', 'expense')),
  icon text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  type text not null check (type in ('income', 'expense', 'transfer', 'adjustment')),
  amount bigint not null check (amount > 0),
  -- NULL for transfers (the app keeps categoryId as an empty string locally).
  category_id text,
  wallet_id text not null,
  source_wallet_id text,
  destination_wallet_id text,
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint transactions_wallet_fk foreign key (user_id, wallet_id)
    references public.wallets (user_id, id) on delete cascade,
  constraint transactions_source_wallet_fk foreign key (user_id, source_wallet_id)
    references public.wallets (user_id, id) on delete cascade,
  constraint transactions_destination_wallet_fk foreign key (user_id, destination_wallet_id)
    references public.wallets (user_id, id) on delete cascade,
  constraint transactions_category_user_fk foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);
drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  category_id text not null,
  amount bigint not null check (amount > 0),
  period text not null check (period in ('weekly', 'monthly', 'yearly', 'custom')),
  start_date text not null,
  end_date text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint budgets_category_fk foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select using (auth.uid() = user_id);
drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert with check (auth.uid() = user_id);
drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- savings goals
-- ---------------------------------------------------------------------------
create table if not exists public.savings_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  target_amount bigint not null check (target_amount > 0),
  deadline text,
  note text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.savings_goals enable row level security;

drop policy if exists "goals_select_own" on public.savings_goals;
create policy "goals_select_own" on public.savings_goals
  for select using (auth.uid() = user_id);
drop policy if exists "goals_insert_own" on public.savings_goals;
create policy "goals_insert_own" on public.savings_goals
  for insert with check (auth.uid() = user_id);
drop policy if exists "goals_update_own" on public.savings_goals;
create policy "goals_update_own" on public.savings_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_delete_own" on public.savings_goals;
create policy "goals_delete_own" on public.savings_goals
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- goal contributions
-- ---------------------------------------------------------------------------
create table if not exists public.goal_contributions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  goal_id text not null,
  amount bigint not null check (amount >= 0),
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint goal_contributions_goal_fk foreign key (user_id, goal_id)
    references public.savings_goals (user_id, id) on delete cascade
);

alter table public.goal_contributions enable row level security;

drop policy if exists "contributions_select_own" on public.goal_contributions;
create policy "contributions_select_own" on public.goal_contributions
  for select using (auth.uid() = user_id);
drop policy if exists "contributions_insert_own" on public.goal_contributions;
create policy "contributions_insert_own" on public.goal_contributions
  for insert with check (auth.uid() = user_id);
drop policy if exists "contributions_update_own" on public.goal_contributions;
create policy "contributions_update_own" on public.goal_contributions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "contributions_delete_own" on public.goal_contributions;
create policy "contributions_delete_own" on public.goal_contributions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- streak (single row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  completion_dates text[] not null default '{}',
  manual_completion_dates text[] not null default '{}',
  longest_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

drop policy if exists "streaks_select_own" on public.streaks;
create policy "streaks_select_own" on public.streaks
  for select using (auth.uid() = user_id);
drop policy if exists "streaks_insert_own" on public.streaks;
create policy "streaks_insert_own" on public.streaks
  for insert with check (auth.uid() = user_id);
drop policy if exists "streaks_update_own" on public.streaks;
create policy "streaks_update_own" on public.streaks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "streaks_delete_own" on public.streaks;
create policy "streaks_delete_own" on public.streaks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (a policy alone is not enough: missing grants fail with 42501)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.wallets to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;
grant select, insert, update, delete on public.streaks to authenticated;
