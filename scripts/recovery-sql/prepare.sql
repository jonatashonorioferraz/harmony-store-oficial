BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '3s';
LOCK TABLE fixture.parents, fixture.items, fixture.events, fixture.boxes,
  fixture.catalog, fixture.settings, captured.sequence_state IN ACCESS EXCLUSIVE MODE;
SELECT fixture.assert_empty_destination();
-- Keep the catalog guard and PostgreSQL FK triggers active.
ALTER TABLE fixture.parents DISABLE TRIGGER record_parent;
