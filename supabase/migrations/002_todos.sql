-- 增量迁移：新增 todos 待办表（已执行过 schema.sql 的项目只需跑这一段）
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.todos enable row level security;

drop policy if exists "todos_owner_all" on public.todos;
create policy "todos_owner_all" on public.todos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_todos_user_done on public.todos (user_id, done);

-- 让 PostgREST 立即识别新表
notify pgrst, 'reload schema';
