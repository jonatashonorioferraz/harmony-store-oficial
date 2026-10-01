ALTER TABLE fixture.parents ENABLE TRIGGER record_parent;
SELECT fixture.advance_sequence(target_name, last_value)
FROM captured.sequence_state ORDER BY target_name;
COMMIT;
