import type { Database } from "@/types/supabase";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
