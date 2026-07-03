-- Migration: Create notifications system
-- Date: 2026-07-01

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org
  ON notifications(organization_id);

-- 2. RLS: enable + policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- 3. Helper function: get active user IDs by permission key in an org
CREATE OR REPLACE FUNCTION get_users_by_permission(
  p_org_id uuid,
  p_permission_key text
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT om.user_id
  FROM organization_members om
  JOIN roles r ON r.id = om.role_id
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE om.organization_id = p_org_id
    AND om.is_active = true
    AND p.key = p_permission_key;
$$;

-- 4. Batch notification creation for all users with a given permission
CREATE OR REPLACE FUNCTION notify_users_by_permission(
  p_org_id uuid,
  p_permission_key text,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_link text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notifications (organization_id, user_id, type, title, body, data, link)
  SELECT
    p_org_id,
    u.user_id,
    p_type,
    p_title,
    p_body,
    p_data,
    p_link
  FROM get_users_by_permission(p_org_id, p_permission_key) u
  WHERE u.user_id IS DISTINCT FROM p_exclude_user_id;
END;
$$;

-- 5. Function to get unread notification count for current user
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_org_slug text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM notifications n
  JOIN organizations o ON o.id = n.organization_id
  WHERE o.slug = p_org_slug
    AND n.user_id = auth.uid()
    AND n.is_read = false;
$$;

-- 6. Function to get unread notifications for current user
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
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$$;

-- 7. Function to mark a single notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE notifications SET is_read = true WHERE id = p_id;
$$;

-- 8. Function to mark all notifications as read for current user in an org
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_org_slug text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE notifications n SET is_read = true
  FROM organizations o
  WHERE n.organization_id = o.id
    AND o.slug = p_org_slug
    AND n.user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
