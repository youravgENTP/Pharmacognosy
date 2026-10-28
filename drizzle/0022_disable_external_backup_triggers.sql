-- The browser-local backup architecture no longer consumes the external
-- incremental outbox. Keep all historical queue/snapshot rows, but remove the
-- synchronous write amplification from normal application transactions.
DO $$
DECLARE
  trigger_record record;
BEGIN
  FOR trigger_record IN
    SELECT event_object_table AS table_name, trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE 'backup_outbox_%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_record.trigger_name, trigger_record.table_name);
  END LOOP;
END $$;
