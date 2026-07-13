-- Add function to return all notifications (read + unread) for current user
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
  ORDER BY n.is_read ASC, n.created_at DESC
  LIMIT p_limit;
$$;
