import type { Database } from "@/types/supabase";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
