-- Closed, synthetic input. No JSON/API package can be provided to this executor.
INSERT INTO fixture.parents(id, protocol, catalog_code, amount, due_date, happened_at)
OVERRIDING SYSTEM VALUE VALUES
('11111111-1111-4111-8111-111111111111', 9007199254741001, 'fixture-product',
 9007199254740993.1234, DATE '2026-10-01', TIMESTAMPTZ '2026-10-01 00:30:00-03');
INSERT INTO fixture.items(parent_id, line_no, quantity, unit_price)
VALUES ('11111111-1111-4111-8111-111111111111', 1, 3, 1.2345);
INSERT INTO fixture.events(id, parent_id, kind) OVERRIDING SYSTEM VALUE
VALUES (9007199254742001, '11111111-1111-4111-8111-111111111111', 'original-history');
INSERT INTO fixture.boxes(box_number, parent_id)
VALUES (400, '11111111-1111-4111-8111-111111111111');
