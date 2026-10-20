-- Machine log: full database setup for a NEW Supabase project.
-- (Already set up? Run update-002.sql instead.)
-- Supabase → SQL editor → New query → paste all of this → Run.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

-- Your machines. machine_type is just a label (e.g. "3D printer").
create table if not exists public.machines (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  machine_type text,
  notes        text,
  created_at   timestamptz not null default now()
);

-- The settings each machine records. Every machine has its own list.
-- tolerance: how close two values must be to count as the same experiment
-- default_value: pre-filled when you log a new run
-- grp: the heading it's shown under (e.g. "Temperature")
create table if not exists public.parameter_defs (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references public.machines(id) on delete cascade,
  key           text not null,
  label         text not null,
  unit          text,
  kind          text not null default 'number' check (kind in ('number', 'text', 'choice')),
  options       text[],
  tolerance     numeric not null default 0 check (tolerance >= 0),
  default_value text,
  grp           text,
  sort          int not null default 0,
  constraint parameter_defs_machine_key unique (machine_id, key)
);

-- One row per experiment. Settings live in `params` as JSON.
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
-- Starter settings lists, used when you add a machine
-- ─────────────────────────────────────────────────────────────
create table if not exists public.setting_templates (
  template  text not null,
  key       text not null,
  label     text not null,
  unit      text,
  kind      text not null default 'number',
  options   text[],
  tolerance numeric not null default 0,
  grp       text,
  sort      int not null default 0,
  primary key (template, key)
);

delete from public.setting_templates;
insert into public.setting_templates (template, key, label, unit, kind, options, tolerance, grp, sort) values
  ('3D printer', 'nozzle_temp',             'Nozzle temperature',             '°C',     'number', null, 5,    'Temperature',         1),
  ('3D printer', 'first_layer_nozzle_temp', 'First layer nozzle temperature', '°C',     'number', null, 5,    'Temperature',         2),
  ('3D printer', 'bed_temp',                'Bed temperature',                '°C',     'number', null, 5,    'Temperature',         3),
  ('3D printer', 'first_layer_bed_temp',    'First layer bed temperature',    '°C',     'number', null, 5,    'Temperature',         4),
  ('3D printer', 'print_speed',             'Print speed',                    'mm/s',   'number', null, 5,    'Speed',               5),
  ('3D printer', 'outer_wall_speed',        'Outer wall speed',               'mm/s',   'number', null, 5,    'Speed',               6),
  ('3D printer', 'first_layer_speed',       'First layer speed',              'mm/s',   'number', null, 5,    'Speed',               7),
  ('3D printer', 'travel_speed',            'Travel speed',                   'mm/s',   'number', null, 10,   'Speed',               8),
  ('3D printer', 'nozzle_diameter',         'Nozzle diameter',                'mm',     'number', null, 0,    'Layers and walls',    9),
  ('3D printer', 'layer_height',            'Layer height',                   'mm',     'number', null, 0.02, 'Layers and walls',   10),
  ('3D printer', 'first_layer_height',      'First layer height',             'mm',     'number', null, 0.02, 'Layers and walls',   11),
  ('3D printer', 'wall_count',              'Wall loops',                     null,     'number', null, 0,    'Layers and walls',   12),
  ('3D printer', 'top_layers',              'Top layers',                     null,     'number', null, 0,    'Layers and walls',   13),
  ('3D printer', 'bottom_layers',           'Bottom layers',                  null,     'number', null, 0,    'Layers and walls',   14),
  ('3D printer', 'infill',                  'Infill density',                 '%',      'number', null, 5,    'Infill',             15),
  ('3D printer', 'infill_pattern',          'Infill pattern',                 null,     'choice', array['Grid','Gyroid','Cubic','Lines','Honeycomb','Triangles'], 0, 'Infill', 16),
  ('3D printer', 'fan_speed',               'Part cooling fan',               '%',      'number', null, 10,   'Cooling',            17),
  ('3D printer', 'retraction',              'Retraction distance',            'mm',     'number', null, 0.2,  'Retraction',         18),
  ('3D printer', 'retraction_speed',        'Retraction speed',               'mm/s',   'number', null, 5,    'Retraction',         19),
  ('3D printer', 'flow',                    'Flow ratio',                     '%',      'number', null, 2,    'Extrusion',          20),
  ('3D printer', 'z_offset',                'Z offset',                       'mm',     'number', null, 0.02, 'Extrusion',          21),
  ('3D printer', 'supports',                'Supports',                       null,     'choice', array['None','Normal','Tree'], 0, 'Support and adhesion', 22),
  ('3D printer', 'adhesion',                'Bed adhesion',                   null,     'choice', array['None','Skirt','Brim','Raft'], 0, 'Support and adhesion', 23),

  ('Laser engraver', 'power',         'Power',         '%',    'number', null, 3,    'Power and speed', 1),
  ('Laser engraver', 'speed',         'Speed',         'mm/s', 'number', null, 5,    'Power and speed', 2),
  ('Laser engraver', 'passes',        'Passes',        null,   'number', null, 0,    'Power and speed', 3),
  ('Laser engraver', 'mode',          'Mode',          null,   'choice', array['Line','Fill','Fill and line'], 0, 'Setup', 4),
  ('Laser engraver', 'line_interval', 'Line interval', 'mm',   'number', null, 0.01, 'Setup', 5),
  ('Laser engraver', 'focus_offset',  'Focus offset',  'mm',   'number', null, 0.5,  'Setup', 6),
  ('Laser engraver', 'air_assist',    'Air assist',    null,   'choice', array['On','Off'], 0, 'Setup', 7),

  ('Oven', 'temperature',   'Temperature',   '°C',     'number', null, 5, 'Heat',  1),
  ('Oven', 'duration',      'Duration',      'min',    'number', null, 2, 'Heat',  2),
  ('Oven', 'ramp_rate',     'Ramp rate',     '°C/min', 'number', null, 1, 'Heat',  3),
  ('Oven', 'convection',    'Fan',           null,     'choice', array['On','Off'], 0, 'Setup', 4),
  ('Oven', 'rack_position', 'Rack position', null,     'choice', array['Top','Middle','Bottom'], 0, 'Setup', 5);

-- ─────────────────────────────────────────────────────────────
-- Settings helpers
-- ─────────────────────────────────────────────────────────────

-- Add a template's settings to a machine. Settings the machine already
-- has are left alone (unless p_update_existing, used by the upgrade).
create or replace function public.apply_template(
  p_machine_id uuid, p_template text, p_update_existing boolean default false
)
returns int
language plpgsql
as $$
declare
  v_offset int := 0;
  v_count  int;
begin
  if p_update_existing then
    insert into public.parameter_defs (machine_id, key, label, unit, kind, options, tolerance, grp, sort)
    select p_machine_id, t.key, t.label, t.unit, t.kind, t.options, t.tolerance, t.grp, t.sort
    from public.setting_templates t where t.template = p_template
    on conflict (machine_id, key) do update
      set label = excluded.label, unit = excluded.unit, kind = excluded.kind,
          options = excluded.options, grp = excluded.grp, sort = excluded.sort
      where public.parameter_defs.grp is null;
  else
    select coalesce(max(sort), 0) into v_offset from public.parameter_defs where machine_id = p_machine_id;
    insert into public.parameter_defs (machine_id, key, label, unit, kind, options, tolerance, grp, sort)
    select p_machine_id, t.key, t.label, t.unit, t.kind, t.options, t.tolerance, t.grp, t.sort + v_offset
    from public.setting_templates t where t.template = p_template
    on conflict (machine_id, key) do nothing;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Copy another machine's settings list, including its defaults
create or replace function public.copy_machine_settings(p_from uuid, p_to uuid)
returns int
language plpgsql
as $$
declare v_count int;
begin
  insert into public.parameter_defs (machine_id, key, label, unit, kind, options, tolerance, default_value, grp, sort)
  select p_to, key, label, unit, kind, options, tolerance, default_value, grp, sort
  from public.parameter_defs where machine_id = p_from
  on conflict (machine_id, key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- The check: find earlier runs that match a proposed setup
-- ─────────────────────────────────────────────────────────────
-- "similar" = same machine and material, every setting within tolerance
-- "exact"   = every setting identical
-- p_wildcard_blank = true ignores settings left blank (live check while typing)

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
    where d.machine_id = p_machine_id
  ),
  pairs as (
    select r.id as rid,
           nullif(trim(r.params ->> d.key), '') as a,
           nullif(trim(p_params ->> d.key), '') as b,
           d.kind as k,
           d.tolerance as tol
    from public.runs r
    cross join defs d
    where r.machine_id = p_machine_id
      and lower(trim(r.material)) = lower(trim(p_material))
  ),
  typed as (
    select *,
      (k = 'number'
        and a ~ '^-?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$'
        and b ~ '^-?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$') as numeric_pair
    from pairs
  ),
  scored as (
    select rid,
      bool_and(case
        when b is null and p_wildcard_blank then true
        when a is null and b is null then true
        when a is null or b is null then false
        when numeric_pair then a::numeric = b::numeric
        else lower(a) = lower(b)
      end) as is_exact,
      bool_and(case
        when b is null and p_wildcard_blank then true
        when a is null and b is null then true
        when a is null or b is null then false
        when numeric_pair then abs(a::numeric - b::numeric) <= tol
        else lower(a) = lower(b)
      end) as is_close
    from typed
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

-- Save-time guard: refuse an identical experiment unless it's marked as a
-- deliberate repeat with a reason. Runs in the database, so it always applies.
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
-- Photos: files go in a private storage bucket, one row per photo here
-- ─────────────────────────────────────────────────────────────
create table if not exists public.run_photos (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.runs(id) on delete cascade,
  path       text not null,
  thumb_path text not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists run_photos_run_idx on public.run_photos (run_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('run-photos', 'run-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "run photos read"   on storage.objects;
drop policy if exists "run photos upload" on storage.objects;
drop policy if exists "run photos delete" on storage.objects;
create policy "run photos read"   on storage.objects for select to authenticated using (bucket_id = 'run-photos');
create policy "run photos upload" on storage.objects for insert to authenticated with check (bucket_id = 'run-photos');
create policy "run photos delete" on storage.objects for delete to authenticated using (bucket_id = 'run-photos');

-- ─────────────────────────────────────────────────────────────
-- Row Level Security: signed-in teammates can read everything, manage
-- machines, settings and photos, and log runs. Runs can only be edited
-- or deleted by whoever logged them.
-- ─────────────────────────────────────────────────────────────
alter table public.machines          enable row level security;
alter table public.parameter_defs    enable row level security;
alter table public.setting_templates enable row level security;
alter table public.runs              enable row level security;
alter table public.run_photos        enable row level security;

drop policy if exists "machines readable"  on public.machines;
drop policy if exists "machines writable"  on public.machines;
create policy "machines readable" on public.machines for select to authenticated using (true);
create policy "machines writable" on public.machines for all    to authenticated using (true) with check (true);

drop policy if exists "params readable" on public.parameter_defs;
drop policy if exists "params writable" on public.parameter_defs;
create policy "params readable" on public.parameter_defs for select to authenticated using (true);
create policy "params writable" on public.parameter_defs for all    to authenticated using (true) with check (true);

drop policy if exists "templates readable" on public.setting_templates;
create policy "templates readable" on public.setting_templates for select to authenticated using (true);

drop policy if exists "runs readable"   on public.runs;
drop policy if exists "runs insert own" on public.runs;
drop policy if exists "runs update own" on public.runs;
drop policy if exists "runs delete own" on public.runs;
create policy "runs readable"   on public.runs for select to authenticated using (true);
create policy "runs insert own" on public.runs for insert to authenticated with check (created_by = auth.uid());
create policy "runs update own" on public.runs for update to authenticated using (created_by = auth.uid());
create policy "runs delete own" on public.runs for delete to authenticated using (created_by = auth.uid());

drop policy if exists "photos readable" on public.run_photos;
drop policy if exists "photos insert"   on public.run_photos;
drop policy if exists "photos delete"   on public.run_photos;
create policy "photos readable" on public.run_photos for select to authenticated using (true);
create policy "photos insert"   on public.run_photos for insert to authenticated with check (created_by = auth.uid());
create policy "photos delete"   on public.run_photos for delete to authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- Starter machines (only on a brand-new database)
-- ─────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  if not exists (select 1 from public.machines) then
    for m in
      insert into public.machines (name, machine_type)
      values ('3D printer', '3D printer'), ('Laser engraver', 'Laser engraver'), ('Oven', 'Oven')
      returning id, machine_type
    loop
      perform public.apply_template(m.id, m.machine_type);
    end loop;
  end if;
end $$;
