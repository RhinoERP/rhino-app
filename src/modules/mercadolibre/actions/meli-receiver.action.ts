"use server";
import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "@/modules/arca/errors";
import { correctMeliReceiver } from "../service/meli-receiver-correction.service";

export async function correctMeliReceiverAction(
  orgSlug: string,
  input: unknown
) {
  try {
    const data = await correctMeliReceiver(orgSlug, input);
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`);
    revalidatePath(
      `/org/${orgSlug}/venta-directa/mercado-libre/${data.saleId}`
    );
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}
