-- Synthetic mechanism fixture only. This is not a Harmony/Supabase migration.
CREATE SCHEMA fixture;
CREATE SCHEMA captured;
CREATE TABLE fixture.marker (purpose text PRIMARY KEY);
INSERT INTO fixture.marker VALUES ('harmony-synthetic-recovery-v1');
CREATE TABLE fixture.settings (singleton boolean PRIMARY KEY CHECK (singleton), policy text NOT NULL);
INSERT INTO fixture.settings VALUES (true, 'baseline-v1');
CREATE TABLE fixture.catalog (code text PRIMARY KEY, allowed boolean NOT NULL);
INSERT INTO fixture.catalog VALUES ('fixture-product', true);
CREATE TABLE fixture.parents (
  id uuid PRIMARY KEY,
  protocol bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  catalog_code text NOT NULL,
  amount numeric(24,4) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  happened_at timestamptz NOT NULL
);
CREATE TABLE fixture.items (
  parent_id uuid NOT NULL REFERENCES fixture.parents(id) NOT DEFERRABLE,
  line_no integer NOT NULL CHECK (line_no > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(20,4) NOT NULL CHECK (unit_price > 0),
  total numeric(30,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  PRIMARY KEY (parent_id, line_no)
);
CREATE TABLE fixture.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id uuid NOT NULL REFERENCES fixture.parents(id) NOT DEFERRABLE,
  kind text NOT NULL CHECK (kind IN ('original-history', 'normal-insert'))
);
CREATE SEQUENCE fixture.box_numbers AS bigint;
CREATE TABLE fixture.boxes (
  box_number bigint PRIMARY KEY DEFAULT nextval('fixture.box_numbers'),
  parent_id uuid NOT NULL REFERENCES fixture.parents(id) NOT DEFERRABLE
);
CREATE FUNCTION fixture.require_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fixture.catalog WHERE code = NEW.catalog_code AND allowed) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Synthetic catalog prerequisite missing';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_catalog BEFORE INSERT ON fixture.parents
FOR EACH ROW EXECUTE FUNCTION fixture.require_catalog();
CREATE FUNCTION fixture.record_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO fixture.events(parent_id, kind) VALUES (NEW.id, 'normal-insert');
  RETURN NEW;
END $$;
CREATE TRIGGER record_parent AFTER INSERT ON fixture.parents
FOR EACH ROW EXECUTE FUNCTION fixture.record_parent();

-- Model explicit source evidence, including a number that belonged to a deleted row.
-- These objects never contain production data and are not part of the target load.
CREATE SEQUENCE captured.box_numbers AS bigint;
CREATE TABLE captured.boxes (box_number bigint PRIMARY KEY DEFAULT nextval('captured.box_numbers'));
INSERT INTO captured.boxes VALUES (400);
SELECT setval('captured.box_numbers', 7776, true);
INSERT INTO captured.boxes DEFAULT VALUES;
DELETE FROM captured.boxes WHERE box_number = 7777;
CREATE SEQUENCE captured.protocols AS bigint;
SELECT setval('captured.protocols', 9007199254741998, true);
SELECT nextval('captured.protocols');
CREATE SEQUENCE captured.event_ids AS bigint;
SELECT setval('captured.event_ids', 9007199254742998, true);
SELECT nextval('captured.event_ids');
CREATE TABLE captured.sequence_state (
  target_name text PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value > 0),
  is_called boolean NOT NULL
);
INSERT INTO captured.sequence_state SELECT 'fixture.box_numbers', last_value, is_called FROM captured.box_numbers;
INSERT INTO captured.sequence_state SELECT 'fixture.parents_protocol_seq', last_value, is_called FROM captured.protocols;
INSERT INTO captured.sequence_state SELECT 'fixture.events_id_seq', last_value, is_called FROM captured.event_ids;

CREATE FUNCTION fixture.assert_context() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'harmony_fixture'
    OR current_database() !~ '^harmony_recovery_fixture_[a-z_]+$'
    OR (SELECT count(*) FROM fixture.marker) <> 1
    OR NOT EXISTS (SELECT 1 FROM fixture.marker WHERE purpose = 'harmony-synthetic-recovery-v1')
  THEN RAISE EXCEPTION USING ERRCODE = 'HF001', MESSAGE = 'Synthetic fixture context required'; END IF;
END $$;
CREATE FUNCTION fixture.assert_empty_destination() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fixture.assert_context();
  IF (SELECT count(*) FROM fixture.settings) <> 1
    OR NOT EXISTS (SELECT 1 FROM fixture.settings WHERE singleton AND policy = 'baseline-v1')
    OR (SELECT count(*) FROM fixture.catalog) <> 1
    OR NOT EXISTS (SELECT 1 FROM fixture.catalog WHERE code = 'fixture-product' AND allowed)
  THEN RAISE EXCEPTION USING ERRCODE = 'HF002', MESSAGE = 'Unexpected fixture seed'; END IF;
  IF EXISTS (SELECT 1 FROM fixture.parents) OR EXISTS (SELECT 1 FROM fixture.items)
    OR EXISTS (SELECT 1 FROM fixture.events) OR EXISTS (SELECT 1 FROM fixture.boxes)
  THEN RAISE EXCEPTION USING ERRCODE = 'HF003', MESSAGE = 'Fixture destination is not empty'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'fixture.parents'::regclass AND NOT tgisinternal) <> 2
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'fixture.parents'::regclass
      AND tgname IN ('record_parent', 'require_catalog') AND tgenabled = 'O') <> 2
  THEN RAISE EXCEPTION USING ERRCODE = 'HF004', MESSAGE = 'Unexpected fixture triggers'; END IF;
  IF (SELECT count(*) FROM captured.sequence_state) <> 3 OR EXISTS (
    SELECT 1 FROM captured.sequence_state WHERE target_name NOT IN
      ('fixture.parents_protocol_seq', 'fixture.events_id_seq', 'fixture.box_numbers')
      OR NOT is_called
  ) THEN RAISE EXCEPTION USING ERRCODE = 'HF005', MESSAGE = 'Sequence source evidence missing'; END IF;
END $$;
-- This helper is intentionally limited to the named synthetic sequences.
-- The caller owns an exclusive, isolated fixture; it is not a concurrent production utility.
CREATE FUNCTION fixture.advance_sequence(target_name text, captured_last bigint) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  target regclass;
  target_last bigint;
  row_max bigint;
  preserved bigint;
BEGIN
  PERFORM fixture.assert_context();
  IF target_name NOT IN ('fixture.parents_protocol_seq', 'fixture.events_id_seq', 'fixture.box_numbers')
    OR captured_last IS NULL OR captured_last < 1
  THEN RAISE EXCEPTION USING ERRCODE = 'HF005', MESSAGE = 'Unsupported fixture sequence'; END IF;
  target := target_name::regclass;
  IF NOT EXISTS (SELECT 1 FROM pg_sequence WHERE seqrelid = target
    AND seqincrement = 1 AND seqcache = 1 AND NOT seqcycle)
  THEN RAISE EXCEPTION USING ERRCODE = 'HF005', MESSAGE = 'Unsupported sequence configuration'; END IF;
  EXECUTE format('SELECT last_value FROM %s', target) INTO target_last;
  CASE target_name
    WHEN 'fixture.parents_protocol_seq' THEN SELECT coalesce(max(protocol), 0) INTO row_max FROM fixture.parents;
    WHEN 'fixture.events_id_seq' THEN SELECT coalesce(max(id), 0) INTO row_max FROM fixture.events;
    WHEN 'fixture.box_numbers' THEN SELECT coalesce(max(box_number), 0) INTO row_max FROM fixture.boxes;
  END CASE;
  preserved := greatest(target_last, captured_last, row_max);
  PERFORM setval(target, preserved, true);
  RETURN preserved;
END $$;
