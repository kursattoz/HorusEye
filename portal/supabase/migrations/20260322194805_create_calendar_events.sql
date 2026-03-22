create table if not exists public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  start_time       timestamptz not null,
  end_time         timestamptz,
  all_day          boolean default false,
  event_type       text not null default 'meeting'
                   check (event_type in ('meeting', 'deadline', 'reminder', 'other')),
  color            text default '#3b82f6',
  location         text,
  reminder_minutes integer,
  recurrence       text,
  created_by       uuid not null references public.user_profiles(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create trigger update_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.update_updated_at_column();

create table if not exists public.calendar_event_attendees (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.calendar_events(id) on delete cascade,
  user_id   uuid not null references public.user_profiles(id),
  status    text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  unique(event_id, user_id)
);

create index if not exists idx_calendar_events_start on public.calendar_events(start_time);
create index if not exists idx_calendar_attendees_event on public.calendar_event_attendees(event_id);
create index if not exists idx_calendar_attendees_user on public.calendar_event_attendees(user_id);

alter table public.calendar_events enable row level security;
alter table public.calendar_event_attendees enable row level security;

create policy "Authenticated users can read calendar events"
  on public.calendar_events for select to authenticated using (true);
create policy "Authenticated users can insert calendar events"
  on public.calendar_events for insert to authenticated with check (true);
create policy "Authenticated users can update calendar events"
  on public.calendar_events for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete calendar events"
  on public.calendar_events for delete to authenticated using (true);

create policy "Authenticated users can read attendees"
  on public.calendar_event_attendees for select to authenticated using (true);
create policy "Authenticated users can insert attendees"
  on public.calendar_event_attendees for insert to authenticated with check (true);
create policy "Authenticated users can update attendees"
  on public.calendar_event_attendees for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete attendees"
  on public.calendar_event_attendees for delete to authenticated using (true);
