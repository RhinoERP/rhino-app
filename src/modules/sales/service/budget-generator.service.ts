import { truncateMoney } from "@/lib/decimal";
import {
  generateRemittanceHTML,
  type RemittanceData,
} from "./remittance-generator.service";

type PreSaleRemittanceItem = {
  sku: string;
  name: string;
  brand?: string | null;
  quantity: number;
  unitOfMeasure: string;
  weightQuantity?: number | null;
  unitPrice: number;
  subtotal: number;
  discountPercentage?: number | null;
};

type PreSaleRemittanceData = {
  issuer?: {
    businessName?: string | null;
    cuit?: string | null;
  };
  date: string;
  expirationDate?: string | null;
  customer: {
    businessName: string;
    fantasyName?: string | null;
    cuit?: string | null;
    phone?: string | null;
    address?: string | null;
    taxCondition?: string | null;
  };
  seller: {
    name: string;
    email?: string;
  };
  items: PreSaleRemittanceItem[];
  subtotal?: number;
  taxesTotal: number;
  discountTotal: number;
  total?: number;
  observations?: string | null;
};

/**
 * Generates a budget/quote HTML from pre-sale form data
 */
export function generatePreSaleBudgetHTML(data: PreSaleRemittanceData): string {
  const subtotal = truncateMoney(
    data.subtotal ??
      data.items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)
  );
  const taxesTotal = truncateMoney(data.taxesTotal ?? 0);
  const discountTotal = truncateMoney(data.discountTotal ?? 0);
  const total = truncateMoney(
    data.total ?? Math.max(0, subtotal - discountTotal + taxesTotal)
  );

  const remittanceData: RemittanceData = {
    type: "PRESUPUESTO",
    date: data.date,
    expirationDate: data.expirationDate ?? undefined,
    issuer: {
      businessName: data.issuer?.businessName ?? "Empresa",
      cuit: data.issuer?.cuit ?? undefined,
    },
    customer: data.customer,
    seller: {
      name: data.seller.name,
      email: data.seller.email,
    },
    items: data.items,
    subtotal,
    taxesTotal,
    discountTotal,
    total,
    observations: data.observations,
  };

  return generateRemittanceHTML(remittanceData);
}
