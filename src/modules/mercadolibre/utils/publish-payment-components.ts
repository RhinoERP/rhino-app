type PaymentComponent = {
  key: string;
  description: string;
  dispatchStatus: "UNCERTAIN" | "PUBLISHED" | null;
};

export async function publishPendingPaymentComponents(
  components: PaymentComponent[],
  publish: (componentKey: string) => Promise<unknown>
) {
  let confirmed = 0;
  for (const component of components) {
    if (component.dispatchStatus === "PUBLISHED") {
      continue;
    }
    try {
      await publish(component.key);
      confirmed += 1;
    } catch (error) {
      return {
        success: false as const,
        confirmed,
        failedComponent: component.description,
        error,
      };
    }
  }
  return { success: true as const, confirmed };
}
