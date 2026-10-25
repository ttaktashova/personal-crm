-- One-off copy of the revenge history from contact notes. It only inserts into
-- interactions: contacts, including notes and updated_at, stay as they are.
-- Runs once: the Drizzle journal records it, so notes written later are not copied.
--
-- Rules (interaction-history spec, "Перенос ..." requirements):
-- - A line that starts with a real date DD.MM.YYYY (day and month may have one digit),
--   not later than today in Moscow, starts a record. The separator after the date
--   ("—", "–", "-", ":") is dropped; the following undated lines belong to the record.
-- - Text before the first dated line is split into paragraphs by blank lines. The
--   paragraphs with words about communication become one record, dated by the
--   contact's last change in Moscow.
-- - Empty text becomes the default "Отомстил".
-- - Records are inserted in note order, so among records with one date the lower one
--   in the notes counts as added later (higher id).
DO $$
DECLARE
  today constant date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  communication_words constant text[] := ARRAY[
    'созвон', 'звонил', 'встрет', 'встреч', 'виделись', 'поговорил', 'разговаривал',
    'обсудил', 'обсуждал', 'договорил', 'переписыва', 'списались', 'общались',
    'пили кофе', 'обедали', 'ужинали', 'поздравил'
  ];
  contact_row record;
  line text;
  parts text[];
  line_date date;
  record_dates date[];
  record_texts text[];
  undated_lines text;
  undated_text text;
  i integer;
BEGIN
  FOR contact_row IN
    SELECT id, notes, updated_at FROM contacts WHERE btrim(notes) <> '' ORDER BY id
  LOOP
    record_dates := ARRAY[]::date[];
    record_texts := ARRAY[]::text[];
    undated_lines := '';

    FOREACH line IN ARRAY regexp_split_to_array(contact_row.notes, '\r?\n') LOOP
      line_date := NULL;
      parts := regexp_match(line, '^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[—–:-]?\s*(.*)$');
      IF parts IS NOT NULL THEN
        BEGIN
          line_date := make_date(parts[3]::integer, parts[2]::integer, parts[1]::integer);
        EXCEPTION WHEN datetime_field_overflow THEN
          line_date := NULL; -- not a real date, e.g. 31.02.2026
        END;
        IF line_date > today THEN
          line_date := NULL;
        END IF;
      END IF;

      IF line_date IS NOT NULL THEN
        record_dates := record_dates || line_date;
        record_texts := record_texts || parts[4];
      ELSIF cardinality(record_dates) = 0 THEN
        undated_lines := undated_lines || line || E'\n';
      ELSE
        record_texts[cardinality(record_texts)] :=
          record_texts[cardinality(record_texts)] || E'\n' || line;
      END IF;
    END LOOP;

    -- Lowercase with the ICU collation: plain lower() of Cyrillic depends on the database locale.
    SELECT string_agg(paragraph, E'\n\n' ORDER BY position)
    INTO undated_text
    FROM (
      SELECT regexp_replace(chunk, '^\s+|\s+$', '', 'g') AS paragraph, position
      FROM regexp_split_to_table(undated_lines, '\n\s*\n') WITH ORDINALITY AS t(chunk, position)
    ) AS paragraphs
    WHERE EXISTS (
      SELECT 1
      FROM unnest(communication_words) AS word
      WHERE strpos(lower(paragraph COLLATE "ru-RU-x-icu"), word) > 0
    );

    IF undated_text IS NOT NULL THEN
      INSERT INTO interactions (contact_id, occurred_on, summary)
      VALUES (
        contact_row.id,
        (contact_row.updated_at AT TIME ZONE 'Europe/Moscow')::date,
        undated_text
      );
    END IF;

    FOR i IN 1 .. cardinality(record_dates) LOOP
      INSERT INTO interactions (contact_id, occurred_on, summary)
      VALUES (
        contact_row.id,
        record_dates[i],
        coalesce(nullif(regexp_replace(record_texts[i], '^\s+|\s+$', '', 'g'), ''), 'Отомстил')
      );
    END LOOP;
  END LOOP;
END $$;
