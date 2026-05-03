import type { Database } from "@/types/supabase";

export type Tax = Database["public"]["Tables"]["taxes"]["Row"];

export type TaxFavoriteContext = "sales";
