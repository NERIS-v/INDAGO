-- M-A12-D6: enforce append-only TemporalStateChange at the database level.
--
-- Rows are written once and NEVER updated or deleted (defense-in-depth behind
-- the store's idempotent writer). Any UPDATE/DELETE raises so an accidental
-- mutation of canonical temporal history is impossible.
--
-- TRUNCATE is deliberately NOT blocked: row-level BEFORE triggers do not fire
-- on TRUNCATE, which keeps a legitimate test/diagnostic reset seam available
-- while preserving the append-only guarantee for row writes.

CREATE OR REPLACE FUNCTION guard_temporal_state_change_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'temporal_state_change is append-only: % is forbidden', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS temporal_state_change_append_only ON "TemporalStateChange";
CREATE TRIGGER temporal_state_change_append_only
    BEFORE UPDATE OR DELETE ON "TemporalStateChange"
    FOR EACH ROW
    EXECUTE FUNCTION guard_temporal_state_change_append_only();