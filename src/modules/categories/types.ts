import type { Database } from "@/types/supabase";

export type Category = Database["public"]["Tables"]["categories"]["Row"] & {
  accountingAccountCode?: string | null;
};

export type CategoryAccountingRule = {
  categoryId: string;
  accountCode: string;
};
