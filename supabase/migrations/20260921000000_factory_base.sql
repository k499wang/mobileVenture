-- Generic, per-app rows. `app_id` is the app-definition id, not a secret.
create table if not exists public.profiles (
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create table if not exists public.onboarding_answers (
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create table if not exists public.app_data (
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create table if not exists public.subscription_status (
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id text not null,
  is_active boolean not null default false,
  expires_at timestamptz,
  revenuecat_app_user_id text not null,
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id, entitlement_id)
);

alter table public.profiles enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.app_data enable row level security;
alter table public.subscription_status enable row level security;

create policy "users manage own profiles" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own onboarding" on public.onboarding_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own app data" on public.app_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read own subscription status" on public.subscription_status for select using (auth.uid() = user_id);
