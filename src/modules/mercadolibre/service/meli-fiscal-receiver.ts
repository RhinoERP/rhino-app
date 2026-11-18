import { meliReceiverSchema } from "../types";

/** No synthetic customer ID/CUIT: DNI and permanent-client identity are separate. */
export function resolveMeliFiscalReceiver(
  snapshot: unknown,
  customerId: string | null
) {
  const receiver = meliReceiverSchema.parse(snapshot);
  return {
    id: customerId,
    businessName:
      receiver.tax_condition === "RESPONSABLE_INSCRIPTO"
        ? receiver.business_name
        : `${receiver.first_name} ${receiver.last_name}`,
    fantasyName: null,
    cuit: receiver.document_type === "CUIT" ? receiver.document_number : null,
    taxCondition: receiver.tax_condition,
    address: receiver.address,
    document: {
      type: receiver.document_type,
      number: receiver.document_number,
    },
  };
}
