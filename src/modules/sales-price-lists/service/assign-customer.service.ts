import { createClient } from "@/lib/supabase/server";

type AssignCustomerToSalesListInput = {
  listId: string;
  customerId: string;
};

export async function assignCustomerToSalesListService({
  listId,
  customerId,
}: AssignCustomerToSalesListInput) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("customers")
    .update({ sales_price_list_id: listId })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
