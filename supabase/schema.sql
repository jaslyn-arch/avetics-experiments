-- Machine log: run this once in Supabase → SQL editor → New query.
-- Safe to re-run: tables use "if not exists" and seeds skip existing rows.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

-- Your physical machines. Several machines can share a type
-- (e.g. two 3D printers) and they share that type's settings list.
create table if not exists public.machines (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  machine_type text not null check (machine_type in ('printer', 'laser', 'oven')),
  notes        text,
  created_at   timestamptz not null default now()
);

-- Which settings each machine type records, and how close two values
-- must be to count as "the same experiment" (tolerance).
create table if not exists public.parameter_defs (
  id           uuid primary key default gen_random_uuid(),
  machine_type text not null check (machine_type in ('printer', 'laser', 'oven')),
  key          text not null,
  label        text not null,
  unit         text,
  kind         text not null default 'number' check (kind in ('number', 'text')),
  tolerance    numeric not null default 0 check (tolerance >= 0),
  sort         int not null default 0,
  unique (machine_type, key)
);

-- One row per experiment. Settings live in `params` as JSON,
-- e.g. {"nozzle_temp": 210, "bed_temp": 60}.
create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references public.machines(id) on delete cascade,
  material      text not null,
  params        jsonb not null default '{}'::jsonb,
  outcome       text not null default 'planned'
                check (outcome in ('planned', 'success', 'partial', 'fail')),
  rating        int check (rating between 1 and 5),
  notes         text,
  is_repeat     boolean not null default false,
  repeat_reason text,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists runs_machine_material_idx
  on public.runs (machine_id, lower(trim(material)));

-- ─────────────────────────────────────────────────────────────
-- The check: find earlier runs that match a proposed setup
-- ─────────────────────────────────────────────────────────────
-- A run is "similar" when it's the same machine and material and
-- every setting is within its tolerance. It's "exact" when every
-- setting is identical.
--
-- p_wildcard_blank = true  → settings you've left blank are ignored
--                            (used for the live check while typing)
-- p_wildcard_blank = false → blanks must match blanks
--                            (used by the save-time guard below)

create or replace function public.find_similar_runs(
  p_machine_id     uuid,
  p_material       text,
  p_params         jsonb,
  p_wildcard_blank boolean default false
)
returns table (
  run_id     uuid,
  match_type text,
  outcome    text,
  rating     int,
  notes      text,
  params     jsonb,
  material   text,
  created_at timestamptz
)
language sql
stable
as $$
  with defs as (
    select d.key, d.kind, d.tolerance
    from public.parameter_defs d
    join public.machines m on m.machine_type = d.machine_type
    where m.id = p_machine_id
  ),
  pairs as (
    select r.id as rid,
           nullif(trim(r.params ->> d.key), '') as a,
           nullif(trim(p_params ->> d.key), '') as b,
           d.kind  as k,
           d.tolerance as tol
    from public.runs r
    cross join defs d
    where r.machine_id = p_machine_id
      and lower(trim(r.material)) = lower(trim(p_material))
  ),
  scored as (
    select rid,
      bool_and(case
        when b is null and p_wildcard_blank then true
        when a is null and b is null then true
        when a is null or b is null then false
        when k = 'number' then a::numeric = b::numeric
        else lower(a) = lower(b)
      end) as is_exact,
      bool_and(case
        when b is null and p_wildcard_blank then true
        when a is null and b is null then true
        when a is null or b is null then false
        when k = 'number' then abs(a::numeric - b::numeric) <= tol
        else lower(a) = lower(b)
      end) as is_close
    from pairs
    group by rid
  )
  select r.id,
         case when s.is_exact then 'exact' else 'similar' end,
         r.outcome, r.rating, r.notes, r.params, r.material, r.created_at
  from scored s
  join public.runs r on r.id = s.rid
  where s.is_close
  order by s.is_exact desc, r.created_at desc
  limit 20;
$$;

-- ─────────────────────────────────────────────────────────────
-- Save-time guard: refuse an identical experiment unless it's
-- marked as a deliberate repeat with a reason. This runs in the
-- database, so it holds even if someone bypasses the website.
-- ─────────────────────────────────────────────────────────────

create or replace function public.block_exact_duplicates()
returns trigger
language plpgsql
as $$
begin
  if new.is_repeat then
    if coalesce(trim(new.repeat_reason), '') = '' then
      raise exception 'A deliberate repeat needs a reason, e.g. "new filament spool" or "checking consistency".';
    end if;
    return new;
  end if;

  if exists (
    select 1
    from public.find_similar_runs(new.machine_id, new.material, new.params, false) s
    where s.match_type = 'exact' and s.run_id <> new.id
  ) then
    raise exception 'This exact setup is already on record for this machine and material. Mark it as a deliberate repeat and give a reason to save it.';
  end if;

  return new;
end;
$$;

drop trigger if exists runs_block_exact_duplicates on public.runs;
create trigger runs_block_exact_duplicates
  before insert on public.runs
  for each row execute function public.block_exact_duplicates();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security: any signed-in teammate can read everything
-- and log runs; people can only edit or delete their own runs.
-- ─────────────────────────────────────────────────────────────

alter table public.machines       enable row level security;
alter table public.parameter_defs enable row level security;
alter table public.runs           enable row level security;

drop policy if exists "machines readable"  on public.machines;
drop policy if exists "machines writable"  on public.machines;
create policy "machines readable" on public.machines for select to authenticated using (true);
create policy "machines writable" on public.machines for all    to authenticated using (true) with check (true);

drop policy if exists "params readable" on public.parameter_defs;
drop policy if exists "params writable" on public.parameter_defs;
create policy "params readable" on public.parameter_defs for select to authenticated using (true);
create policy "params writable" on public.parameter_defs for all    to authenticated using (true) with check (true);

drop policy if exists "runs readable"   on public.runs;
drop policy if exists "runs insert own" on public.runs;
drop policy if exists "runs update own" on public.runs;
drop policy if exists "runs delete own" on public.runs;
create policy "runs readable"   on public.runs for select to authenticated using (true);
create policy "runs insert own" on public.runs for insert to authenticated with check (created_by = auth.uid());
create policy "runs update own" on public.runs for update to authenticated using (created_by = auth.uid());
create policy "runs delete own" on public.runs for delete to authenticated using (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Starter settings and machines (edit freely in the Machines tab)
-- ─────────────────────────────────────────────────────────────

insert into public.parameter_defs (machine_type, key, label, unit, kind, tolerance, sort) values
  ('printer', 'nozzle_temp',   'Nozzle temperature',  '°C',     'number', 5,    1),
  ('printer', 'bed_temp',      'Bed temperature',     '°C',     'number', 5,    2),
  ('printer', 'print_speed',   'Print speed',         'mm/s',   'number', 5,    3),
  ('printer', 'layer_height',  'Layer height',        'mm',     'number', 0.02, 4),
  ('printer', 'infill',        'Infill',              '%',      'number', 5,    5),
  ('printer', 'retraction',    'Retraction distance', 'mm',     'number', 0.2,  6),
  ('laser',   'power',         'Power',               '%',      'number', 3,    1),
  ('laser',   'speed',         'Speed',               'mm/s',   'number', 5,    2),
  ('laser',   'passes',        'Passes',              null,     'number', 0,    3),
  ('laser',   'line_interval', 'Line interval',       'mm',     'number', 0.01, 4),
  ('laser',   'focus_offset',  'Focus offset',        'mm',     'number', 0.5,  5),
  ('laser',   'mode',          'Mode (line or fill)', null,     'text',   0,    6),
  ('oven',    'temperature',   'Temperature',         '°C',     'number', 5,    1),
  ('oven',    'duration',      'Duration',            'min',    'number', 2,    2),
  ('oven',    'ramp_rate',     'Ramp rate',           '°C/min', 'number', 1,    3),
  ('oven',    'convection',    'Fan (on or off)',     null,     'text',   0,    4)
on conflict (machine_type, key) do nothing;

insert into public.machines (name, machine_type)
select v.name, v.machine_type
from (values ('3D printer', 'printer'), ('Laser engraver', 'laser'), ('Oven', 'oven')) as v(name, machine_type)
where not exists (select 1 from public.machines);
