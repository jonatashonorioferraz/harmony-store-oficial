-- Run by a new psql process after the loading connection has closed.
SELECT json_build_object(
  'parents', (SELECT coalesce(json_agg(json_build_object(
    'id', id::text, 'protocol', protocol::text, 'catalog_code', catalog_code,
    'amount', amount::text, 'due_date', due_date::text,
    'happened_at', to_char(happened_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) ORDER BY id), '[]'::json) FROM fixture.parents),
  'items', (SELECT coalesce(json_agg(json_build_object(
    'parent_id', parent_id::text, 'line_no', line_no, 'quantity', quantity,
    'unit_price', unit_price::text, 'total', total::text
  ) ORDER BY parent_id, line_no), '[]'::json) FROM fixture.items),
  'events', (SELECT coalesce(json_agg(json_build_object(
    'id', id::text, 'parent_id', parent_id::text, 'kind', kind
  ) ORDER BY id), '[]'::json) FROM fixture.events),
  'boxes', (SELECT coalesce(json_agg(json_build_object(
    'box_number', box_number::text, 'parent_id', parent_id::text
  ) ORDER BY box_number), '[]'::json) FROM fixture.boxes),
  'settings', (SELECT json_agg(json_build_object('singleton', singleton, 'policy', policy) ORDER BY singleton) FROM fixture.settings),
  'triggers', (SELECT json_agg(json_build_object('name', tgname, 'enabled', tgenabled) ORDER BY tgname)
    FROM pg_trigger WHERE tgrelid = 'fixture.parents'::regclass AND NOT tgisinternal),
  'foreign_keys', (SELECT json_agg(json_build_object('name', conname, 'validated', convalidated, 'deferrable', condeferrable) ORDER BY conname)
    FROM pg_constraint WHERE connamespace = 'fixture'::regnamespace AND contype = 'f'),
  'disabled_internal_triggers', (SELECT count(*) FROM pg_trigger WHERE tgisinternal AND tgrelid IN
    ('fixture.items'::regclass, 'fixture.events'::regclass, 'fixture.boxes'::regclass) AND tgenabled <> 'O'),
  'sequences', json_build_object(
    'protocol', (SELECT last_value::text FROM fixture.parents_protocol_seq),
    'event', (SELECT last_value::text FROM fixture.events_id_seq),
    'box', (SELECT last_value::text FROM fixture.box_numbers)
  ),
  'source_box_visible_max', (SELECT max(box_number)::text FROM captured.boxes),
  'source_box_high_watermark', (SELECT last_value::text FROM captured.sequence_state WHERE target_name = 'fixture.box_numbers')
);
