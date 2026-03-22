alter table public.backlog_items
  add column if not exists seq_id serial;

with numbered as (
  select id, row_number() over (order by created_at) as rn
  from backlog_items
)
update backlog_items b set seq_id = n.rn
from numbered n where b.id = n.id;

select setval('backlog_items_seq_id_seq', (select coalesce(max(seq_id), 0) from backlog_items));
