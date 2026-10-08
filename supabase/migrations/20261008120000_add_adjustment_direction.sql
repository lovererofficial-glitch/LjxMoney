alter table public.transactions
  add column if not exists adjustment_direction text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_adjustment_direction_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_adjustment_direction_check
      check (
        adjustment_direction is null
        or (type = 'adjustment' and adjustment_direction in ('increase', 'decrease'))
      );
  end if;
end
$$;