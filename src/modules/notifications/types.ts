export type Notification = {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};
