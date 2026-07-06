-- Migration: Add notification archiving support
-- Adds: read_at column, archived column, archive cron function, updated RPCs

-- 1. Add read_at and archived columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON notifications(archived);

-- 2. Backfill read_at for existing read notifications
UPDATE notifications
SET read_at = created_at
WHERE is_read = true AND read_at IS NULL;

-- 3. Update mark_notification_read to set read_at
CREATE OR REPLACE FUNCTION mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE notifications
  SET is_read = true, read_at = now()
  WHERE id = p_id;
$$;

-- 4. Update mark_all_notifications_read to set read_at
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_org_slug text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE notifications n SET
    is_read = true,
    read_at = now()
  FROM organizations o
  WHERE n.organization_id = o.id
    AND o.slug = p_org_slug
    AND n.user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5. Function to archive old read notifications (called by cron)
CREATE OR REPLACE FUNCTION archive_old_notifications()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE notifications
  SET archived = true
  WHERE is_read = true
    AND read_at < now() - interval '48 hours'
    AND archived = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6. Update get_unread_notification_count to exclude archived
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_org_slug text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM notifications n
  JOIN organizations o ON o.id = n.organization_id
  WHERE o.slug = p_org_slug
    AND n.user_id = auth.uid()
    AND n.is_read = false
    AND n.archived = false;
$$;

-- 7. Update get_unread_notifications to exclude archived
CREATE OR REPLACE FUNCTION get_unread_notifications(
  p_org_slug text,
  p_limit integer DEFAULT 50
)
RETURNS SETOF notifications
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT n.*
  FROM notifications n
  JOIN organizations o ON o.id = n.organization_id
  WHERE o.slug = p_org_slug
    AND n.user_id = auth.uid()
    AND n.is_read = false
    AND n.archived = false
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$$;

-- 8. Update get_notifications to exclude archived
CREATE OR REPLACE FUNCTION get_notifications(
  p_org_slug text,
  p_limit integer DEFAULT 50
)
RETURNS SETOF notifications
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT n.*
  FROM notifications n
  JOIN organizations o ON o.id = n.organization_id
  WHERE o.slug = p_org_slug
    AND n.user_id = auth.uid()
    AND n.archived = false
  ORDER BY n.is_read ASC, n.created_at DESC
  LIMIT p_limit;
$$;

-- 9. Schedule cron job (requires pg_cron extension)
-- Run daily at midnight: archive notifications read more than 48h ago
SELECT cron.schedule(
  'archive-old-notifications',
  '0 0 * * *',
  $$SELECT archive_old_notifications()$$
);
