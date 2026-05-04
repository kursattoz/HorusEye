alter table public.backlog_items
  add column if not exists seq_id serial;

with numbered as (
  select id, row_number() over (order by created_at) as rn
  from backlog_items
)
update backlog_items b set seq_id = n.rn
from numbered n where b.id = n.id;

-- Use is_called=false form so the next nextval() returns the value passed.
-- (max+1, false) ensures the next assigned seq_id is max+1; on an empty
-- table coalesce gives 0+1=1, which is the lower bound the sequence accepts.
select setval('backlog_items_seq_id_seq', coalesce(max(seq_id), 0) + 1, false)
from backlog_items;
