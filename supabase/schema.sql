-- ============================================================
-- 来钱花 · Supabase 初始化脚本
-- 用法：Supabase Dashboard → SQL Editor → New query → 整段粘贴 → Run
-- 幂等设计，可重复执行，不会清空已有数据
-- ============================================================

-- 0. 扩展（gen_random_uuid 需要）
create extension if not exists pgcrypto;

-- ============================================================
-- 1. profiles 用户资料
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  shop_name   text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 2. transactions 账目流水
--    type 取值：'收入' / '支出'；支出金额也存正数，方向看 type
-- ============================================================
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount          numeric(12,2) not null check (amount >= 0),
  type            text not null check (type in ('收入','支出')),
  category        text,            -- haircut/wash/dye/perm/care/child/expense
  note            text,            -- 项目名，格式「项目」或「项目｜客户名」
  payment_method  text,            -- 微信/支付宝/现金/会员卡/美团
  created_at      timestamptz not null default now()
);

alter table public.transactions enable row level security;

drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_all" on public.transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_transactions_user_created
  on public.transactions (user_id, created_at desc);

-- ============================================================
-- 3. customers 客户
--    tags 为文本数组，取值：vip / risk / new
-- ============================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  phone        text,
  total_spent  numeric(12,2) not null default 0,
  visit_count  integer not null default 0,
  last_visit   timestamptz,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "customers_owner_all" on public.customers;
create policy "customers_owner_all" on public.customers
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_customers_user on public.customers (user_id);

-- ============================================================
-- 4. inventory 耗材库存
-- ============================================================
create table if not exists public.inventory (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  category       text,             -- wash 洗护 / dye 染烫 / tool 工具设备 / care 护理
  current_qty    numeric(12,2) not null default 0,
  unit           text,             -- 支/瓶/包/个/套/条
  min_qty        numeric(12,2) not null default 0,   -- 安全库存
  cost_per_unit  numeric(12,2) not null default 0,   -- 单件采购成本（元）
  created_at     timestamptz not null default now()
);

alter table public.inventory enable row level security;

drop policy if exists "inventory_owner_all" on public.inventory;
create policy "inventory_owner_all" on public.inventory
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_inventory_user on public.inventory (user_id);

-- ============================================================
-- 5. 新用户注册后自动创建 profile（security definer 绕过 RLS）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, shop_name)
  values (new.id, '我的小店')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
