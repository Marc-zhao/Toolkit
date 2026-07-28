-- Complete base schema for a fresh VocaQuest Supabase project.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 100),
  class_id uuid references public.classes(id) on delete set null,
  is_teacher boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  code text primary key,
  role text not null check (role in ('student', 'teacher')),
  is_active boolean not null default true,
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.word_packs (
  id text primary key,
  name text not null,
  words jsonb not null default '[]'::jsonb check (jsonb_typeof(words) = 'array'),
  icon text not null default '📖',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_assignments (
  class_id uuid not null references public.classes(id) on delete cascade,
  pack_id text not null references public.word_packs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, pack_id)
);

create table if not exists public.student_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null references public.word_packs(id) on delete cascade,
  prog_data jsonb not null default '{}'::jsonb,
  student_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create table if not exists public.fillblank_questions (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null references public.word_packs(id) on delete cascade,
  stage_num integer not null default 1 check (stage_num >= 1),
  word text not null default '',
  meaning text not null default '',
  sentence text not null default '',
  translation text not null default '',
  answer text not null default '',
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  grammar_point text not null default '',
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.fillblank_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.fillblank_questions(id) on delete set null,
  pack_id text references public.word_packs(id) on delete set null,
  stage_num integer not null default 0 check (stage_num >= 0),
  selected_answer text not null default '',
  is_correct boolean not null default false,
  word text not null default '',
  meaning text not null default '',
  sentence text not null default '',
  answer text not null default '',
  grammar_point text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.fillblank_stage_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text references public.word_packs(id) on delete set null,
  stage_num integer not null default 0 check (stage_num >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  total_count integer not null default 0 check (total_count >= 0),
  xp_earned integer not null default 0 check (xp_earned >= 0),
  ai_summary text not null default '',
  ai_suggestions text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.fillblank_assigned_practice (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.student_achievements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pets jsonb not null default '[]'::jsonb check (jsonb_typeof(pets) = 'array'),
  titles jsonb not null default '[]'::jsonb check (jsonb_typeof(titles) = 'array'),
  active_pet text not null default '',
  active_title text not null default '',
  feed_coins jsonb not null default '{}'::jsonb check (jsonb_typeof(feed_coins) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_bosses (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  tool_name text not null,
  boss_name text not null,
  boss_emoji text not null default '👾',
  difficulty integer not null default 5 check (difficulty between 1 and 10),
  reward_pet text not null default '🐾',
  reward_title text not null default '无名英雄',
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (week_start, tool_name)
);

create table if not exists public.boss_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boss_id uuid not null references public.weekly_bosses(id) on delete cascade,
  week_start date not null,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  victory boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.class_challenges (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  challenger_class_id uuid not null references public.classes(id) on delete cascade,
  opponent_class_id uuid not null references public.classes(id) on delete cascade,
  tool_name text not null,
  reward_title text not null default '挑战者',
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  challenger_avg_score numeric(6,2),
  opponent_avg_score numeric(6,2),
  winner_class_id uuid references public.classes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_challenge_records (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.class_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  score integer not null default 0,
  correct_count integer not null default 0,
  total_count integer not null default 0,
  xp_earned integer not null default 0,
  accuracy numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

insert into public.word_packs (id, name, icon, words)
values (
  'starter-english-01',
  'VocaQuest Starter · 核心词汇',
  '🧭',
  '[
    {"w":"resilient","m":"有韧性的","pos":"adj."},
    {"w":"adapt","m":"适应","pos":"v."},
    {"w":"persist","m":"坚持","pos":"v."},
    {"w":"recover","m":"恢复","pos":"v."},
    {"w":"curious","m":"好奇的","pos":"adj."},
    {"w":"analyze","m":"分析","pos":"v."},
    {"w":"evidence","m":"证据","pos":"n."},
    {"w":"contrast","m":"对比","pos":"v."},
    {"w":"conclude","m":"得出结论","pos":"v."},
    {"w":"reflect","m":"反思","pos":"v."},
    {"w":"precise","m":"精确的","pos":"adj."},
    {"w":"context","m":"语境","pos":"n."},
    {"w":"interpret","m":"解释；理解","pos":"v."},
    {"w":"evaluate","m":"评估","pos":"v."},
    {"w":"strategy","m":"策略","pos":"n."},
    {"w":"challenge","m":"挑战","pos":"n."},
    {"w":"progress","m":"进步","pos":"n."},
    {"w":"mastery","m":"掌握","pos":"n."},
    {"w":"focus","m":"专注","pos":"v."},
    {"w":"achieve","m":"实现","pos":"v."}
  ]'::jsonb
)
on conflict (id) do nothing;
