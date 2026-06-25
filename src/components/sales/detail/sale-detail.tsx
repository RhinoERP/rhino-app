"use client";

import { CheckCircleIcon, PlusMinus } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronsUpDown,
  FileText,
  Lock,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildFacturaVentaManual } from "@/lib/accounting-client";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventoFacturaVenta } from "@/modules/accounting/types";
import { useEmitSaleInvoiceMutation } from "@/modules/arca/hooks/use-emit-sale-invoice-mutation";
import { useSaleInvoicePdfGenerator } from "@/modules/arca/hooks/use-sale-invoice-pdf-generator";
import type { ArcaSaleInvoiceReadiness } from "@/modules/arca/types";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { useCategories } from "@/modules/categories/hooks/use-categories";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";
import { normalizeCustomerTaxCondition } from "@/modules/customers/tax-conditions";
import type { Customer } from "@/modules/customers/types";
import { sendSaleInvoiceEmailAction } from "@/modules/email/actions/send-sale-invoice-email.action";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import { useConfirmSaleMutation } from "@/modules/sales/hooks/use-confirm-sale-mutation";
import { useDeliverSaleMutation } from "@/modules/sales/hooks/use-deliver-sale-mutation";
import { useDispatchSaleMutation } from "@/modules/sales/hooks/use-dispatch-sale-mutation";
import { useRemittanceGenerator } from "@/modules/sales/hooks/use-remittance-generator";
import { useUpdateSaleMutation } from "@/modules/sales/hooks/use-update-sale-mutation";
import {
  INVOICE_TYPE_OPTIONS,
  isArcaSupportedInvoiceType,
} from "@/modules/sales/invoice-type-utils";
import type { SaleReturnSummary } from "@/modules/sales/service/sale-return.service";
import type { SalesOrderDetail } from "@/modules/sales/service/sales.service";
import type {
  InvoiceType,
  SaleAccountingInvoiceKind,
  SaleProduct,
} from "@/modules/sales/types";
import {
  addDays,
  computeDueDate,
  toDateOnlyString,
} from "@/modules/sales/utils/date";
import type { Tax } from "@/modules/taxes/types";

const invoiceTypeOptions: { value: InvoiceType; label: string }[] =
  INVOICE_TYPE_OPTIONS;

const accountingInvoiceKindOptions: {
  value: SaleAccountingInvoiceKind;
  label: string;
}[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "REMITO", label: "Remito" },
  { value: "ANTICIPO", label: "Anticipo" },
];

const textareaBaseClasses =
  "min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const unitOfMeasureLabels: Record<
  SalesOrderDetail["items"][number]["unitOfMeasure"],
  string
> = {
  UN: "unidad",
  KG: "kg",
  LT: "lt",
  MT: "m",
};

const statusLabels: Record<
  SalesOrderDetail["status"],
  { label: string; badgeClass: string }
> = {
  DRAFT: {
    label: "Preventa",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  CONFIRMED: {
    label: "Confirmada",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  DISPATCH: {
    label: "Despachada",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
  },
  DELIVERED: {
    label: "Entregada",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  CANCELLED: {
    label: "Cancelada",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

const arcaStatusLabels = {
  not_requested: "No emitida",
  pending: "Emitiendo",
  authorized: "Factura emitida",
  error: "Error fiscal",
} as const;

const arcaStatusBadgeClassNames = {
  not_requested: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  authorized: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
} as const;

const invoiceEmailStatusLabels = {
  not_sent: "No enviado",
  pending: "Enviando",
  sent: "Enviado",
  delivered: "Entregado",
  delivery_delayed: "Demorado",
  bounced: "Rebotado",
  complained: "Reclamado",
  failed: "Error",
} as const;

const invoiceEmailStatusBadgeClassNames = {
  not_sent: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivery_delayed: "border-amber-200 bg-amber-50 text-amber-700",
  bounced: "border-red-200 bg-red-50 text-red-700",
  complained: "border-red-200 bg-red-50 text-red-700",
  failed: "border-red-200 bg-red-50 text-red-700",
} as const;

type InvoiceEmailStatus = keyof typeof invoiceEmailStatusLabels;

type ItemState = SalesOrderDetail["items"][number];

const invoiceEmailSeparatorRegex = /[\s,;]+/u;
const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const defaultInvoiceEmailSubjectTemplate = "Factura electrónica {comprobante}";
const defaultInvoiceEmailBodyTemplate = `Hola {cliente},

Te enviamos la factura electrónica {comprobante}, emitida por {organizacion}, correspondiente a la venta del {fecha} por {total}.

Saludos`;

type SaleDetailProps = {
  orgSlug: string;
  organizationName: string;
  sale: SalesOrderDetail;
  arcaReadiness: ArcaSaleInvoiceReadiness;
  customers: Customer[];
  sellers: OrganizationMember[];
  taxes: Tax[];
  products: SaleProduct[];
  initialMode?: "default" | "return";
  remittanceSettings?: { autoEnabled: boolean; prefix: string } | null;
  saleReturns: SaleReturnSummary[];
  creditNotes: CreditNote[];
};

type SellerOption = Pick<OrganizationMember, "user_id" | "user">;

const WEIGHT_AUTO_TOLERANCE = 0.0001;

function buildSellerLabel(member: SellerOption): string {
  if (member.user?.name) {
    return member.user.name;
  }

  if (member.user?.email) {
    return member.user.email;
  }

  return "Usuario sin nombre";
}

const formatAveragePerUnit = (
  average: number | null,
  unitOfMeasure: ItemState["unitOfMeasure"]
): string | null => {
  if (!average || average <= 0) {
    return null;
  }

  return `${average.toFixed(2)} ${unitOfMeasureLabels[unitOfMeasure]}/u`;
};

const formatPriceByMeasure = (
  price: number,
  unitOfMeasure: ItemState["unitOfMeasure"]
): string => `${formatCurrency(price)} x ${unitOfMeasureLabels[unitOfMeasure]}`;

const resolveAppliedUnitPrice = (product: SaleProduct): number => {
  const average = product.averageQuantityPerUnit;
  const shouldUseAverage =
    product.tracksStockUnits && average !== null && average > 0;

  if (shouldUseAverage) {
    return product.price * average;
  }

  return product.price;
};

const usesWeightPricing = (item: ItemState): boolean =>
  item.type === "product" &&
  item.tracksStockUnits &&
  item.weightQuantity !== null &&
  item.weightQuantity !== undefined &&
  item.weightQuantity > 0;

const getItemWeight = (item: ItemState): number => {
  if (item.type !== "product") {
    return 0;
  }
  if (!item.tracksStockUnits) {
    return 0;
  }
  if (item.weightQuantity && item.weightQuantity > 0) {
    return item.weightQuantity;
  }
  if (item.averageQuantityPerUnit && item.averageQuantityPerUnit > 0) {
    return item.averageQuantityPerUnit * item.quantity;
  }
  return 0;
};

const clampPercentage = (value: number) => Math.min(Math.max(0, value), 100);

const resolveCreditDays = (
  normalizedExpirationDays: number | null,
  fallback: number | null
) =>
  normalizedExpirationDays !== null && normalizedExpirationDays >= 0
    ? normalizedExpirationDays
    : fallback;

const buildTaxPayload = (taxes: Tax[]) =>
  taxes.map((tax) => ({
    taxId: tax.id,
    name: tax.name,
    rate: tax.rate,
  }));

const normalizeInvoiceEmailStatus = (
  status: string | null | undefined
): InvoiceEmailStatus =>
  status && status in invoiceEmailStatusLabels
    ? (status as InvoiceEmailStatus)
    : "not_sent";

function parseInvoiceEmailRecipients(value: string | null | undefined) {
  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const rawRecipient of (value ?? "").split(invoiceEmailSeparatorRegex)) {
    const recipient = rawRecipient.trim();

    if (!recipient) {
      continue;
    }

    const key = recipient.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    recipients.push(recipient);
  }

  return recipients;
}

function getInvalidInvoiceEmailRecipients(value: string) {
  return parseInvoiceEmailRecipients(value).filter(
    (recipient) => !simpleEmailRegex.test(recipient)
  );
}

function formatInvoiceEmailRecipientList(recipients: string[]) {
  return recipients.join(", ");
}

function getInvoiceEmailRecipientInput(params: {
  invoiceEmailRecipient?: string | null;
  customerEmail?: string | null;
}) {
  const configuredRecipients = parseInvoiceEmailRecipients(
    params.invoiceEmailRecipient
  );

  if (configuredRecipients.length > 0) {
    return formatInvoiceEmailRecipientList(configuredRecipients);
  }

  return params.customerEmail?.trim() ?? "";
}

function getSaleCustomerDisplayName(sale: SalesOrderDetail) {
  return (
    sale.customer.fantasy_name?.trim() ||
    sale.customer.business_name?.trim() ||
    "Cliente"
  );
}

function getSaleInvoiceReference(sale: SalesOrderDetail) {
  return (
    sale.invoice_number?.trim() ||
    (sale.sale_number ? `Venta ${sale.sale_number}` : `Venta ${sale.id}`)
  );
}

function renderInvoiceEmailTemplate(
  template: string,
  values: Record<string, string>
) {
  return template.replace(
    /\{([a-zA-Z_]+)\}/g,
    (match, key: string) => values[key] ?? match
  );
}

const formatDateTimeLabel = (value: string | null | undefined): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return format(parsed, "dd/MM/yyyy HH:mm", { locale: es });
};

const getDraftRequiredMessage = (isDraftSale: boolean) =>
  `Completa los datos requeridos antes de guardar la ${
    isDraftSale ? "preventa" : "venta"
  }.`;

const getDraftSuccessMessage = (isDraftSale: boolean) =>
  isDraftSale
    ? "Preventa actualizada correctamente."
    : "Venta actualizada correctamente.";

const getDraftErrorMessage = (error: unknown, isDraftSale: boolean) =>
  error instanceof Error
    ? error.message
    : `No se pudo actualizar la ${
        isDraftSale ? "preventa" : "venta"
      }, intenta nuevamente.`;

function normalizeArcaStatus(
  value: string | null | undefined
): keyof typeof arcaStatusLabels {
  if (
    value === "pending" ||
    value === "authorized" ||
    value === "error" ||
    value === "not_requested"
  ) {
    return value;
  }

  return "not_requested";
}

function getArcaReadinessMessage(
  arcaReadiness: ArcaSaleInvoiceReadiness
): string | null {
  if (!arcaReadiness.isConfigured) {
    return "La organización no tiene ARCA configurado todavía.";
  }

  if (!arcaReadiness.hasCredentials) {
    return arcaReadiness.usesDelegatedCredentials
      ? "El operador ARCA delegado no está listo todavía. Revisá la configuración en ARCA."
      : "La organización no tiene credenciales ARCA configuradas todavía.";
  }

  if (arcaReadiness.usesDelegatedCredentials && !arcaReadiness.operatorReady) {
    return "El operador global de Rhinos todavía no tiene WSFE autorizado para este ambiente.";
  }

  if (arcaReadiness.isActive) {
    return null;
  }

  if (
    arcaReadiness.usesDelegatedCredentials &&
    arcaReadiness.delegation?.status !== "connected"
  ) {
    return "La delegación ARCA del tenant todavía no quedó conectada. Repetí el onboarding antes de emitir.";
  }

  if (arcaReadiness.status !== "connected") {
    return "La configuración ARCA de la organización no está conectada. Validala antes de emitir.";
  }

  if (!arcaReadiness.organizationCuit) {
    return "La organización no tiene un CUIT válido para emitir en ARCA.";
  }

  return "La configuración ARCA de la organización no está activa para emitir.";
}

function getSaleArcaBlockMessage(params: {
  canShowArcaCard: boolean;
  isArcaAuthorized: boolean;
  isArcaPending: boolean;
  isEditingDetails: boolean;
  arcaReadiness: ArcaSaleInvoiceReadiness;
  invoiceType: InvoiceType;
  usesSupportedArcaInvoiceType: boolean;
  hasManualInvoiceNumber: boolean;
  hasCustomerCuit: boolean;
  hasCustomerTaxCondition: boolean;
  customerTaxCondition: string | null | undefined;
}): string | null {
  if (
    !params.canShowArcaCard ||
    params.isArcaAuthorized ||
    params.isArcaPending
  ) {
    return null;
  }

  if (params.isEditingDetails) {
    return "Guardá y bloqueá los cambios de la venta antes de emitir la factura fiscal.";
  }

  const readinessMessage = getArcaReadinessMessage(params.arcaReadiness);
  if (readinessMessage) {
    return readinessMessage;
  }

  if (params.invoiceType === "NOTA_DE_VENTA") {
    return "Seleccioná un tipo de comprobante fiscal válido antes de emitir la factura.";
  }

  if (params.invoiceType === "FACTURA_E") {
    return "FACTURA_E todavía no está soportada en esta fase de ARCA.";
  }

  if (!params.usesSupportedArcaInvoiceType) {
    return `El tipo de comprobante ${params.invoiceType} todavía no está soportado en esta fase de ARCA.`;
  }

  if (params.hasManualInvoiceNumber) {
    return "La venta ya tiene un número de comprobante manual. Revisalo antes de emitir la factura fiscal.";
  }

  if (!params.hasCustomerCuit) {
    return "El cliente no tiene CUIT informado.";
  }

  if (!params.hasCustomerTaxCondition) {
    return "El cliente no tiene condición fiscal informada.";
  }

  if (
    params.invoiceType === "FACTURA_B" &&
    normalizeCustomerTaxCondition(params.customerTaxCondition) ===
      "RESPONSABLE_INSCRIPTO"
  ) {
    return "No se puede emitir Factura B para un cliente Responsable Inscripto. Revisá la condición fiscal del cliente o emití un comprobante compatible.";
  }

  return null;
}

function buildComparableTaxFingerprint(
  taxes: Array<{ taxId: string | null; rate: number; name: string }>
): string {
  return taxes
    .map(
      (tax) =>
        `${tax.taxId ?? "no-id"}:${tax.rate}:${tax.name.trim().toLowerCase()}`
    )
    .sort()
    .join("|");
}
const mapItemToInput = (item: ItemState) => ({
  id: item.id,
  type: item.type,
  productId: item.type === "product" ? item.productId : null,
  description: item.type === "adjustment" ? item.name : null,
  quantity: item.type === "adjustment" ? 1 : item.quantity,
  weightQuantity:
    item.type === "adjustment" ? null : (item.weightQuantity ?? null),
  unitPrice: item.unitPrice,
  basePrice: item.basePrice,
  discountPercentage: item.type === "adjustment" ? 0 : item.discountPercent,
  tracksStockUnits: item.type === "product" ? item.tracksStockUnits : false,
  unitOfMeasure: item.type === "product" ? item.unitOfMeasure : "UN",
});

const updateSaleDetailItemPrice = (
  item: ItemState,
  parsedValue: number
): ItemState => {
  let unitPrice = 0;
  if (!Number.isNaN(parsedValue)) {
    unitPrice =
      item.type === "adjustment" ? parsedValue : Math.max(0, parsedValue);
  }

  return {
    ...item,
    unitPrice,
    basePrice: item.tracksStockUnits ? unitPrice : item.basePrice,
  };
};

function mapItemToState(item: ItemState): ItemState {
  let estimatedWeight: number | null = null;

  if (item.type === "adjustment") {
    return {
      ...item,
      weightQuantity: null,
    };
  }

  if (item.weightQuantity !== null && item.weightQuantity !== undefined) {
    estimatedWeight = item.weightQuantity;
  } else if (
    item.tracksStockUnits &&
    item.averageQuantityPerUnit &&
    item.averageQuantityPerUnit > 0
  ) {
    estimatedWeight = item.quantity * item.averageQuantityPerUnit;
  }

  return {
    ...item,
    weightQuantity: estimatedWeight,
  };
}

function resolveAccountingCategoryId(
  item: ItemState,
  productCategoryById: Map<string, string | null>
) {
  if (item.type !== "product") {
    return null;
  }

  if (item.categoryId) {
    return item.categoryId;
  }

  if (!item.productId) {
    return null;
  }

  return productCategoryById.get(item.productId) ?? null;
}

function calculateItemTotals(item: ItemState) {
  if (item.type === "adjustment") {
    const subtotal = Number(item.unitPrice) || 0;
    return { gross: subtotal, discount: 0, subtotal };
  }

  const usesWeight = usesWeightPricing(item);

  const effectiveQuantity = usesWeight
    ? (item.weightQuantity ?? 0)
    : item.quantity;
  const effectiveUnitPrice = usesWeight ? item.basePrice : item.unitPrice;
  const gross = effectiveQuantity * effectiveUnitPrice;
  const discount = Math.min(
    Math.max(0, (item.discountPercent / 100) * gross),
    Math.max(0, gross)
  );
  const subtotal = Math.max(0, gross - discount);

  return { gross, discount, subtotal };
}

function CreditNoteRow({ nc, orgSlug }: { nc: CreditNote; orgSlug: string }) {
  const { generatePDF, isGenerating } = useCreditNotePDF({
    orgSlug,
    creditNoteId: nc.id,
  });
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div>
        <span className="font-medium font-mono text-xs">
          {nc.creditNoteNumber ?? "—"}
        </span>
        <span className="ml-2 text-muted-foreground text-xs">
          {formatDateOnly(nc.issueDate)} · {formatCurrency(nc.amount)}
        </span>
      </div>
      <Button
        disabled={isGenerating}
        onClick={generatePDF}
        size="sm"
        variant="outline"
      >
        {isGenerating ? "..." : "PDF"}
      </Button>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several guarded states
export function SaleDetail({
  orgSlug,
  organizationName,
  sale,
  arcaReadiness,
  customers,
  sellers,
  taxes,
  products,
  initialMode,
  remittanceSettings,
  saleReturns,
  creditNotes,
}: SaleDetailProps) {
  const router = useRouter();
  const { confirmSale } = useConfirmSaleMutation();
  const { dispatchSale } = useDispatchSaleMutation();
  const { deliverSale } = useDeliverSaleMutation();
  const { emitSaleInvoice } = useEmitSaleInvoiceMutation();
  const updateSale = useUpdateSaleMutation(orgSlug);
  const { generateRemittance } = useRemittanceGenerator({
    orgSlug,
    saleId: sale.id,
  });
  const canManageSale = sale.access?.canManage ?? false;
  const { generateInvoicePdf, isGenerating: isGeneratingInvoicePdf } =
    useSaleInvoicePdfGenerator({
      orgSlug,
      saleId: sale.id,
    });
  const isDraftSale = sale.status === "DRAFT";
  const isConfirmedSale = sale.status === "CONFIRMED";
  const isDispatchedSale = sale.status === "DISPATCH";
  const isDeliveredSale = sale.status === "DELIVERED";
  const canReturnProducts = isDispatchedSale || isDeliveredSale;
  const persistedArcaStatus = normalizeArcaStatus(sale.arca_status);
  const isEmittingInvoice = emitSaleInvoice.isPending;
  const normalizedArcaStatus =
    isEmittingInvoice && persistedArcaStatus !== "authorized"
      ? "pending"
      : persistedArcaStatus;
  const isArcaAuthorized = normalizedArcaStatus === "authorized";
  const isArcaPending = normalizedArcaStatus === "pending";
  const startsInReturnMode = canReturnProducts && initialMode === "return";

  const [isEditingDetails, setIsEditingDetails] = useState(startsInReturnMode);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isSellerPickerOpen, setIsSellerPickerOpen] = useState(false);
  const [isTaxesPickerOpen, setIsTaxesPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>(
    sale.customer?.id ?? sale.customer_id
  );
  const [sellerId, setSellerId] = useState<string>(sale.user_id ?? "");
  const [saleDate, setSaleDate] = useState<Date>(() => {
    const [y, m, d] = sale.sale_date.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  const [expirationDays, setExpirationDays] = useState<number | null>(() => {
    if (sale.expiration_date) {
      const [sYear, sMonth, sDay] = sale.sale_date.split("-").map(Number);
      const [eYear, eMonth, eDay] = sale.expiration_date.split("-").map(Number);
      const startOfSale = Date.UTC(sYear, sMonth - 1, sDay);
      const startOfExpiration = Date.UTC(eYear, eMonth - 1, eDay);
      const diffMs = startOfExpiration - startOfSale;
      const parsedDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      return parsedDays;
    }

    if (
      typeof sale.credit_days === "number" &&
      !Number.isNaN(sale.credit_days)
    ) {
      return sale.credit_days;
    }

    return null;
  });
  const [accountingPayload, setAccountingPayload] =
    useState<EventoFacturaVenta | null>(null);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(
    sale.invoice_type ?? "NOTA_DE_VENTA"
  );
  const [tipoFactura, setTipoFactura] = useState<SaleAccountingInvoiceKind>(
    sale.tipo_factura ?? "MANUAL"
  );
  const [observations, setObservations] = useState<string>(
    sale.observations ?? ""
  );
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    sale.invoice_number ?? ""
  );
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(
    sale.global_discount_percentage ?? 0
  );
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>(
    (sale.taxes ?? []).map((tax) => tax.taxId)
  );
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(0);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isSupplierFilterOpen, setIsSupplierFilterOpen] = useState(false);
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
  const [remittanceNumber, setRemittanceNumber] = useState<string>(
    sale.remittance_number ?? ""
  );
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(
    sale.carrier?.id ?? sale.customer?.preferred_carrier_id ?? null
  );
  const { data: carriers = [] } = useCarriers(orgSlug);
  const { data: categories = [] } = useCategories(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);
  const requireCarrier = orgSettings?.require_carrier_on_dispatch ?? false;
  const invoiceEmailDraft = useMemo(() => {
    const invoiceReference = getSaleInvoiceReference(sale);
    const templateValues = {
      cliente: getSaleCustomerDisplayName(sale),
      organizacion: organizationName || "Rhinos",
      comprobante: invoiceReference,
      numero_factura: invoiceReference,
      fecha: formatDateOnly(sale.sale_date),
      total: formatCurrency(sale.total_amount),
    };

    return {
      fromName: orgSettings?.invoice_email_from_name || organizationName,
      subject: renderInvoiceEmailTemplate(
        orgSettings?.invoice_email_subject_template ||
          defaultInvoiceEmailSubjectTemplate,
        templateValues
      ),
      bodyText: renderInvoiceEmailTemplate(
        orgSettings?.invoice_email_body_template ||
          defaultInvoiceEmailBodyTemplate,
        templateValues
      ),
      attachPdf: orgSettings?.invoice_email_attach_pdf ?? true,
    };
  }, [
    orgSettings?.invoice_email_attach_pdf,
    orgSettings?.invoice_email_body_template,
    orgSettings?.invoice_email_from_name,
    orgSettings?.invoice_email_subject_template,
    organizationName,
    sale,
  ]);
  const [isGeneratingRemittance, setIsGeneratingRemittance] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);

  // Track the initial customerId so we only auto-fill when the user explicitly
  // changes the customer — not on mount or when orgSettings first loads, which
  // would override the existing expiration date saved on the sale.
  const initialCustomerIdRef = useRef(customerId);
  useEffect(() => {
    if (customerId === initialCustomerIdRef.current) {
      return;
    }
    if (!orgSettings?.due_days_enabled) {
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    const days =
      typeof customer?.due_days === "number"
        ? customer.due_days
        : (orgSettings.due_days_default ?? null);
    if (days !== null) {
      setExpirationDays(days);
    }
  }, [customerId, orgSettings, customers]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fires on dialog open
  useEffect(() => {
    if (!isDispatchDialogOpen) {
      return;
    }
    if (!remittanceSettings?.autoEnabled) {
      return;
    }
    // Only auto-fill if there's no number yet (don't overwrite a re-opened dialog)
    if (remittanceNumber) {
      return;
    }

    setIsGeneratingRemittance(true);
    generateRemittanceNumber(orgSlug).then((result) => {
      if (result.success && result.number) {
        setRemittanceNumber(result.number);
      }
      setIsGeneratingRemittance(false);
    });
  }, [isDispatchDialogOpen]);
  const [items, setItems] = useState<ItemState[]>(() =>
    sale.items.map(mapItemToState)
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [arcaError, setArcaError] = useState<string | null>(null);
  const [arcaSuccessMessage, setArcaSuccessMessage] = useState<string | null>(
    null
  );
  const [isSendingInvoiceEmail, setIsSendingInvoiceEmail] = useState(false);
  const [invoiceEmailRecipientInput, setInvoiceEmailRecipientInput] = useState(
    () =>
      getInvoiceEmailRecipientInput({
        invoiceEmailRecipient: sale.invoice_email_recipient,
        customerEmail: sale.customer.email,
      })
  );
  const [invoiceEmailRecipientFormError, setInvoiceEmailRecipientFormError] =
    useState<string | null>(null);
  const [invoiceEmailError, setInvoiceEmailError] = useState<string | null>(
    null
  );
  const [invoiceEmailSuccess, setInvoiceEmailSuccess] = useState<string | null>(
    null
  );
  const [isInvoiceEmailSendDialogOpen, setIsInvoiceEmailSendDialogOpen] =
    useState(false);
  const [invoiceEmailFromNameInput, setInvoiceEmailFromNameInput] = useState(
    () => invoiceEmailDraft.fromName
  );
  const [invoiceEmailSubjectInput, setInvoiceEmailSubjectInput] = useState(
    () => invoiceEmailDraft.subject
  );
  const [invoiceEmailBodyInput, setInvoiceEmailBodyInput] = useState(
    () => invoiceEmailDraft.bodyText
  );
  const [invoiceEmailAttachPdf, setInvoiceEmailAttachPdf] = useState(
    () => invoiceEmailDraft.attachPdf
  );

  useEffect(() => {
    setInvoiceEmailRecipientInput(
      getInvoiceEmailRecipientInput({
        invoiceEmailRecipient: sale.invoice_email_recipient,
        customerEmail: sale.customer.email,
      })
    );
    setInvoiceEmailRecipientFormError(null);
  }, [sale.customer.email, sale.invoice_email_recipient]);

  useEffect(() => {
    setInvoiceEmailFromNameInput(invoiceEmailDraft.fromName);
    setInvoiceEmailSubjectInput(invoiceEmailDraft.subject);
    setInvoiceEmailBodyInput(invoiceEmailDraft.bodyText);
    setInvoiceEmailAttachPdf(invoiceEmailDraft.attachPdf);
  }, [invoiceEmailDraft]);

  const saleDateString = useMemo(() => toDateOnlyString(saleDate), [saleDate]);
  const expirationDateString = useMemo(() => {
    if (typeof expirationDays === "number" && !Number.isNaN(expirationDays)) {
      return addDays(saleDateString, expirationDays);
    }

    if (sale.expiration_date) {
      return toDateOnlyString(new Date(sale.expiration_date));
    }

    return null;
  }, [expirationDays, saleDateString, sale.expiration_date]);
  const normalizedExpirationDays =
    typeof expirationDays === "number" && !Number.isNaN(expirationDays)
      ? expirationDays
      : null;

  const availableTaxes = useMemo(() => {
    const byId = new Map<string, Tax>();
    for (const tax of taxes) {
      byId.set(tax.id, tax);
    }

    for (const applied of sale.taxes) {
      if (applied.taxId && !byId.has(applied.taxId)) {
        byId.set(applied.taxId, {
          id: applied.taxId,
          name: applied.name,
          rate: applied.rate,
          code: null,
          description: null,
          created_at: null,
          updated_at: null,
          is_favorite: false,
          is_favorite_sales: false,
          is_favorite_direct_sales: false,
          is_active: true,
          organization_id: null,
        });
      }
    }

    return Array.from(byId.values());
  }, [sale.taxes, taxes]);

  const selectedTaxes = useMemo(
    () => availableTaxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [availableTaxes, selectedTaxIds]
  );
  const hasPendingFiscalChanges = useMemo(() => {
    const persistedTaxFingerprint = buildComparableTaxFingerprint(
      (sale.taxes ?? []).map((tax) => ({
        taxId: tax.taxId,
        rate: tax.rate,
        name: tax.name,
      }))
    );
    const selectedTaxFingerprint = buildComparableTaxFingerprint(
      selectedTaxes.map((tax) => ({
        taxId: tax.id,
        rate: tax.rate,
        name: tax.name,
      }))
    );

    return (
      invoiceType !== sale.invoice_type ||
      tipoFactura !== (sale.tipo_factura ?? "MANUAL") ||
      customerId !== (sale.customer?.id ?? sale.customer_id) ||
      selectedTaxFingerprint !== persistedTaxFingerprint
    );
  }, [
    customerId,
    invoiceType,
    tipoFactura,
    sale.customer?.id,
    sale.customer_id,
    sale.invoice_type,
    sale.tipo_factura,
    sale.taxes,
    selectedTaxes,
  ]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const supplierOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.supplierId && product.supplierName) {
        options.set(product.supplierId, product.supplierName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.categoryId && product.categoryName) {
        options.set(product.categoryId, product.categoryName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const normalizedBrand = product.brand?.trim() ?? "";

        if (supplierFilter && product.supplierId !== supplierFilter) {
          return false;
        }

        if (brandFilter && normalizedBrand !== brandFilter) {
          return false;
        }

        if (categoryFilter && product.categoryId !== categoryFilter) {
          return false;
        }

        return true;
      }),
    [brandFilter, categoryFilter, products, supplierFilter]
  );

  const supplierFilterLabel = useMemo(() => {
    if (!supplierFilter) {
      return "Todos";
    }
    return supplierOptions.find((option) => option.id === supplierFilter)
      ?.label;
  }, [supplierFilter, supplierOptions]);

  const brandFilterLabel = useMemo(() => {
    if (!brandFilter) {
      return "Todas";
    }
    return brandOptions.find((brand) => brand === brandFilter) ?? "Todas";
  }, [brandFilter, brandOptions]);

  const categoryFilterLabel = useMemo(() => {
    if (!categoryFilter) {
      return "Todas";
    }
    return categoryOptions.find((option) => option.id === categoryFilter)
      ?.label;
  }, [categoryFilter, categoryOptions]);

  const availableSellers = useMemo(() => {
    const sellersByUserId = new Map<string, SellerOption>();

    for (const seller of sellers) {
      if (!seller.user_id) {
        continue;
      }

      sellersByUserId.set(seller.user_id, seller);
    }

    if (sale.user_id && !sellersByUserId.has(sale.user_id)) {
      sellersByUserId.set(sale.user_id, {
        user_id: sale.user_id,
        user: {
          id: sale.user_id,
          email: sale.seller?.email,
          name: sale.seller?.name,
        },
      });
    }

    return Array.from(sellersByUserId.values());
  }, [sale.seller?.email, sale.seller?.name, sale.user_id, sellers]);

  const selectedCustomer =
    customers.find((customer) => customer.id === customerId) ?? sale.customer;
  const selectedSeller = availableSellers.find(
    (seller) => seller.user_id === sellerId
  );
  const selectedSellerLabel = selectedSeller
    ? buildSellerLabel(selectedSeller)
    : sale.seller?.name || sale.seller?.email || "Selecciona un vendedor";
  const canShowArcaCard =
    isConfirmedSale || isDispatchedSale || isDeliveredSale || isArcaAuthorized;
  const hasCustomerCuit = Boolean(sale.customer.cuit?.trim());
  const hasCustomerTaxCondition = Boolean(sale.customer.tax_condition?.trim());
  const hasManualInvoiceNumber =
    Boolean(sale.invoice_number?.trim()) && !isArcaAuthorized;
  const invoiceEmailStatus = normalizeInvoiceEmailStatus(
    sale.invoice_email_status
  );
  const invoiceEmailRecipients = useMemo(
    () => parseInvoiceEmailRecipients(invoiceEmailRecipientInput),
    [invoiceEmailRecipientInput]
  );
  const invalidInvoiceEmailRecipients = useMemo(
    () => getInvalidInvoiceEmailRecipients(invoiceEmailRecipientInput),
    [invoiceEmailRecipientInput]
  );
  const invoiceEmailRecipientLabel = formatInvoiceEmailRecipientList(
    invoiceEmailRecipients
  );
  const usesSupportedArcaInvoiceType = isArcaSupportedInvoiceType(
    sale.invoice_type
  );
  const canEmitArcaInvoice =
    canShowArcaCard &&
    !isArcaAuthorized &&
    !isArcaPending &&
    !isEditingDetails &&
    arcaReadiness.isActive &&
    usesSupportedArcaInvoiceType &&
    !hasManualInvoiceNumber &&
    hasCustomerCuit &&
    hasCustomerTaxCondition;
  const arcaBlockMessage = getSaleArcaBlockMessage({
    canShowArcaCard,
    isArcaAuthorized,
    isArcaPending,
    isEditingDetails,
    arcaReadiness,
    invoiceType: sale.invoice_type,
    usesSupportedArcaInvoiceType,
    hasManualInvoiceNumber,
    hasCustomerCuit,
    hasCustomerTaxCondition,
    customerTaxCondition: selectedCustomer?.tax_condition ?? null,
  });
  const invoiceEmailButtonLabel =
    invoiceEmailStatus === "not_sent" || invoiceEmailStatus === "failed"
      ? "Enviar email"
      : "Reenviar email";

  const totals = useMemo(() => {
    const aggregated = items.reduce(
      (acc, item) => {
        const { discount, subtotal } = calculateItemTotals(item);
        const isProduct = item.type === "product";
        const weight = getItemWeight(item);

        return {
          subtotal: acc.subtotal + subtotal,
          totalUnits: acc.totalUnits + (isProduct ? item.quantity : 0),
          totalWeight: acc.totalWeight + weight,
          lineDiscountAmount:
            acc.lineDiscountAmount + (isProduct ? discount : 0),
          adjustmentsTotal: acc.adjustmentsTotal + (isProduct ? 0 : subtotal),
        };
      },
      {
        subtotal: 0,
        totalUnits: 0,
        totalWeight: 0,
        lineDiscountAmount: 0,
        adjustmentsTotal: 0,
      }
    );

    const globalDiscountAmount = Math.min(
      Math.max(0, (globalDiscountPercent / 100) * aggregated.subtotal),
      Math.max(0, aggregated.subtotal)
    );
    const discountedSubtotal = Math.max(
      0,
      aggregated.subtotal - globalDiscountAmount
    );
    const taxDetails = selectedTaxes.map((tax) => ({
      tax,
      amount: discountedSubtotal * (tax.rate / 100),
    }));

    const totalTaxAmount = taxDetails.reduce(
      (sum, detail) => sum + detail.amount,
      0
    );
    const total = Math.max(0, discountedSubtotal + totalTaxAmount);
    const totalDiscountAmount =
      aggregated.lineDiscountAmount + globalDiscountAmount;

    return {
      subtotal: aggregated.subtotal,
      totalUnits: aggregated.totalUnits,
      totalWeight: aggregated.totalWeight,
      adjustmentsTotal: aggregated.adjustmentsTotal,
      taxDetails,
      totalTaxAmount,
      discountedSubtotal,
      lineDiscountAmount: aggregated.lineDiscountAmount,
      globalDiscountAmount,
      totalDiscountAmount,
      total,
    };
  }, [globalDiscountPercent, items, selectedTaxes]);

  const summaryTotals = useMemo(() => {
    if (isEditingDetails) {
      return {
        subtotal: totals.subtotal,
        lineDiscountAmount: totals.lineDiscountAmount,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalDiscountAmount: totals.totalDiscountAmount,
        discountedSubtotal: totals.discountedSubtotal,
        taxDetails: totals.taxDetails,
        total: totals.total,
      };
    }

    const persistedSubtotal = Number(sale.sub_total ?? 0);
    const persistedGlobalDiscount = Number(sale.global_discount_amount ?? 0);
    const persistedDiscountedSubtotal = Math.max(
      0,
      persistedSubtotal - persistedGlobalDiscount
    );
    const persistedTaxDetails = (sale.taxes ?? []).map((tax) => ({
      tax: {
        id: tax.taxId,
        name: tax.name,
        rate: tax.rate,
      },
      amount: tax.taxAmount,
    }));

    return {
      subtotal: persistedSubtotal,
      lineDiscountAmount: 0,
      globalDiscountAmount: persistedGlobalDiscount,
      totalDiscountAmount: persistedGlobalDiscount,
      discountedSubtotal: persistedDiscountedSubtotal,
      taxDetails: persistedTaxDetails,
      total: Number(sale.total_amount ?? 0),
    };
  }, [
    isEditingDetails,
    sale.global_discount_amount,
    sale.sub_total,
    sale.taxes,
    sale.total_amount,
    totals.discountedSubtotal,
    totals.globalDiscountAmount,
    totals.lineDiscountAmount,
    totals.subtotal,
    totals.taxDetails,
    totals.total,
    totals.totalDiscountAmount,
  ]);

  const accountingLineItems = useMemo(() => {
    const categoryAccountById = new Map(
      categories.map((category) => [
        category.id,
        category.accountingAccountCode ?? null,
      ])
    );
    const productCategoryById = new Map(
      products.map((product) => [product.id, product.categoryId ?? null])
    );

    return items.map((item) => {
      const { subtotal } = calculateItemTotals(item);
      const globalDiscountShare =
        totals.subtotal > 0
          ? (subtotal / totals.subtotal) * totals.globalDiscountAmount
          : 0;
      const montoNeto = Math.max(0, subtotal - globalDiscountShare);
      const montoImpuestos =
        totals.discountedSubtotal > 0
          ? (montoNeto / totals.discountedSubtotal) * totals.totalTaxAmount
          : 0;
      const categoryId = resolveAccountingCategoryId(item, productCategoryById);

      if (item.type === "product" && !categoryId) {
        console.warn("Accounting account could not be resolved for sale item", {
          saleId: sale.id,
          itemId: item.id,
          productId: item.productId,
          productName: item.name,
        });
      }

      return {
        montoNeto,
        montoImpuestos,
        accountCode: categoryId
          ? (categoryAccountById.get(categoryId) ?? null)
          : null,
      };
    });
  }, [categories, items, products, totals, sale.id]);

  const dueDate = computeDueDate(
    saleDateString,
    expirationDateString,
    normalizedExpirationDays ?? sale.credit_days
  );

  const weightUnitLabel = useMemo(() => {
    const weightItem = items.find(
      (item) => item.type === "product" && item.tracksStockUnits
    );
    return weightItem
      ? unitOfMeasureLabels[weightItem.unitOfMeasure]
      : unitOfMeasureLabels.KG;
  }, [items]);

  const handleQuantityChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const quantity = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.type !== "adjustment"
          ? {
              ...item,
              quantity,
              weightQuantity:
                item.tracksStockUnits &&
                item.averageQuantityPerUnit &&
                item.averageQuantityPerUnit > 0 &&
                (item.weightQuantity === null ||
                  item.weightQuantity === undefined ||
                  Math.abs(
                    item.weightQuantity -
                      item.quantity * item.averageQuantityPerUnit
                  ) <= WEIGHT_AUTO_TOLERANCE)
                  ? quantity * item.averageQuantityPerUnit
                  : item.weightQuantity,
            }
          : item
      )
    );
  };

  const handleWeightChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const weight = Number.isNaN(parsed) ? null : Math.max(0, parsed);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.type !== "adjustment"
          ? {
              ...item,
              weightQuantity: weight,
            }
          : item
      )
    );
  };

  const handleDiscountChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const discount = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), 100);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.type !== "adjustment"
          ? {
              ...item,
              discountPercent: discount,
            }
          : item
      )
    );
  };

  const handleUnitPriceChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? updateSaleDetailItemPrice(item, parsed) : item
      )
    );
  };

  const handleAdjustmentNameChange = (id: string, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              name: value,
              description: value,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleTax = (taxId: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(taxId)
        ? prev.filter((id) => id !== taxId)
        : [...prev, taxId]
    );
  };

  const handleAddProduct = () => {
    if (!selectedProductId) {
      setError("Selecciona un producto para agregarlo");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);

    if (!product) {
      setError("Producto no encontrado");
      return;
    }

    if (!selectedQuantity || selectedQuantity <= 0) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }

    const appliedUnitPrice = resolveAppliedUnitPrice(product);
    const weightEstimate =
      product.tracksStockUnits && product.averageQuantityPerUnit
        ? product.averageQuantityPerUnit * selectedQuantity
        : null;

    setItems((prev) => {
      const exists = prev.find(
        (item) => item.type === "product" && item.productId === product.id
      );

      if (exists) {
        return prev.map((item) =>
          item.id === exists.id
            ? {
                ...item,
                quantity: item.quantity + selectedQuantity,
                unitPrice: appliedUnitPrice,
                basePrice: product.price,
                categoryId: product.categoryId ?? null,
                averageQuantityPerUnit: product.averageQuantityPerUnit,
                weightQuantity: item.weightQuantity ?? weightEstimate,
                unitOfMeasure: product.unitOfMeasure,
                tracksStockUnits: product.tracksStockUnits,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "product",
          productId: product.id,
          categoryId: product.categoryId ?? null,
          description: null,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          quantity: selectedQuantity,
          weightQuantity: weightEstimate,
          unitPrice: appliedUnitPrice,
          basePrice: product.price,
          discountPercent: 0,
          subtotal: 0,
          unitOfMeasure: product.unitOfMeasure,
          tracksStockUnits: product.tracksStockUnits,
          averageQuantityPerUnit: product.averageQuantityPerUnit,
        },
      ];
    });

    setSelectedProductId("");
    setSelectedQuantity(0);
    setError(null);
  };

  const handleAddAdjustment = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `adjustment-${Date.now()}`;

    setItems((prev) => [
      ...prev,
      {
        id,
        type: "adjustment",
        productId: null,
        description: "Ajuste manual",
        name: "Ajuste manual",
        sku: "AJUSTE",
        brand: null,
        quantity: 1,
        weightQuantity: null,
        unitPrice: 0,
        basePrice: 0,
        discountPercent: 0,
        subtotal: 0,
        unitOfMeasure: "UN",
        tracksStockUnits: false,
        averageQuantityPerUnit: null,
      },
    ]);
  };

  const canConfirm =
    canManageSale &&
    isDraftSale &&
    Boolean(customerId) &&
    Boolean(sellerId) &&
    items.length > 0;
  const isSaving = confirmSale.isPending;
  const isSavingDraft = updateSale.isPending;
  const isDispatching = dispatchSale.isPending;
  const isDeliverMutationPending = deliverSale.isPending || isDelivering;
  const canSaveDraft =
    canManageSale &&
    (isDraftSale || isConfirmedSale || isDispatchedSale || isDeliveredSale) &&
    isEditingDetails &&
    Boolean(customerId) &&
    Boolean(sellerId) &&
    items.length > 0;
  const saveDraftButtonLabel = useMemo(() => {
    if (isSavingDraft) {
      return "Guardando...";
    }

    return "Guardar cambios";
  }, [isSavingDraft]);

  const toggleEditingDetails = async () => {
    if (!canManageSale) {
      return;
    }

    if (isEditingDetails) {
      const isSavableSale =
        isDraftSale || isConfirmedSale || isDispatchedSale || isDeliveredSale;

      if (!isSavableSale) {
        // CANCELLED or unknown status — just exit edit mode without saving
        setIsEditingDetails(false);
        setError(null);
        setSuccessMessage(null);
        return;
      }

      const result = await handleSaveDraft();
      if (result !== false) {
        setIsEditingDetails(false);
      }
    } else {
      setIsEditingDetails(true);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const buildSaleMutationPayload = (accountingInformalEntryId?: string) => ({
    orgSlug,
    saleId: sale.id,
    customerId,
    sellerId,
    saleDate: saleDateString,
    expirationDate: expirationDateString ?? null,
    creditDays: resolveCreditDays(
      normalizedExpirationDays,
      sale.credit_days ?? null
    ),
    invoiceType,
    tipoFactura,
    invoiceNumber: invoiceNumber || null,
    remittanceNumber: remittanceNumber || null,
    observations: observations || null,
    globalDiscountPercentage: clampPercentage(globalDiscountPercent),
    accountingInformalEntryId,
    items: items.map(mapItemToInput),
    taxes: buildTaxPayload(selectedTaxes),
  });

  const handleAccountingConfirm = async (informalEntryId: string) => {
    setAccountingPayload(null);
    try {
      await confirmSale.mutateAsync(buildSaleMutationPayload(informalEntryId));
      setSuccessMessage("Venta confirmada correctamente.");
      router.push(`/org/${orgSlug}/ventas?estado=CONFIRMED`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo confirmar la venta, intenta nuevamente."
      );
    }
  };

  const handleAccountingCancel = () => {
    setAccountingPayload(null);
  };

  const handleConfirm = () => {
    if (!canManageSale) {
      setError("No tienes permisos para gestionar esta venta.");
      return;
    }

    if (!canConfirm) {
      setError("Completa los datos requeridos antes de confirmar la venta.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    const payload = buildFacturaVentaManual(
      {
        id: sale.id,
        organization_id: sale.organization_id,
        customer_id: customerId,
        sale_date: saleDateString,
        expiration_date: expirationDateString ?? null,
        invoice_number: invoiceNumber || null,
      },
      { total: totals.total, totalTaxAmount: totals.totalTaxAmount },
      { items: accountingLineItems, tipoFactura }
    );
    setAccountingPayload(payload);
  };

  const handleSaveDraft = async () => {
    if (!canManageSale) {
      setError("No tienes permisos para gestionar esta venta.");
      return false;
    }

    if (!canSaveDraft) {
      setError(getDraftRequiredMessage(isDraftSale));
      return false;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await updateSale.mutateAsync(buildSaleMutationPayload());

      setSuccessMessage(getDraftSuccessMessage(isDraftSale));
    } catch (mutationError) {
      setError(getDraftErrorMessage(mutationError, isDraftSale));
      return false;
    }
  };

  const handleDispatch = async () => {
    if (!canManageSale) {
      setError("No tienes permisos para gestionar esta venta.");
      return;
    }

    if (!(remittanceNumber.trim() || remittanceSettings?.autoEnabled)) {
      setError("Ingresa el número de remito para despachar la venta.");
      return;
    }

    if (requireCarrier && !selectedCarrierId) {
      setError("Seleccioná un transporte para despachar.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await dispatchSale.mutateAsync({
        orgSlug,
        saleId: sale.id,
        remittanceNumber: remittanceNumber.trim(),
        carrierId: selectedCarrierId,
      });
      setIsDispatchDialogOpen(false);
      setSuccessMessage("Venta despachada correctamente.");
      router.push(`/org/${orgSlug}/ventas?estado=DISPATCH`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo despachar la venta, intenta nuevamente."
      );
    }
  };

  const handleDeliver = async () => {
    if (!canManageSale) {
      setError("No tienes permisos para gestionar esta venta.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsDelivering(true);

    try {
      await deliverSale.mutateAsync({
        orgSlug,
        saleId: sale.id,
      });
      setSuccessMessage("Venta marcada como entregada.");
      router.push(`/org/${orgSlug}/ventas?estado=DELIVERED`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo marcar como entregada, intenta nuevamente."
      );
    } finally {
      setIsDelivering(false);
    }
  };

  const handleEmitInvoice = async () => {
    setError(null);
    setSuccessMessage(null);
    setArcaError(null);
    setArcaSuccessMessage(null);
    setInvoiceEmailError(null);
    setInvoiceEmailSuccess(null);

    try {
      const result = await emitSaleInvoice.mutateAsync({
        orgSlug,
        saleId: sale.id,
      });

      setArcaSuccessMessage(
        result.idempotent
          ? "La venta ya tenía una factura fiscal emitida."
          : "Factura fiscal emitida correctamente."
      );
      router.refresh();
    } catch (mutationError) {
      setArcaError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo emitir la factura fiscal en ARCA."
      );
    }
  };

  const getInvoiceEmailRecipientValidationMessage = () => {
    if (invoiceEmailRecipients.length === 0) {
      return "Cargá al menos un destinatario de email.";
    }

    if (invalidInvoiceEmailRecipients.length > 0) {
      return `Hay emails inválidos: ${invalidInvoiceEmailRecipients.join(", ")}.`;
    }

    return null;
  };

  const openInvoiceEmailSendDialog = () => {
    setInvoiceEmailFromNameInput(invoiceEmailDraft.fromName);
    setInvoiceEmailSubjectInput(invoiceEmailDraft.subject);
    setInvoiceEmailBodyInput(invoiceEmailDraft.bodyText);
    setInvoiceEmailAttachPdf(invoiceEmailDraft.attachPdf);
    setInvoiceEmailError(null);
    setInvoiceEmailSuccess(null);
    setInvoiceEmailRecipientFormError(null);
    setIsInvoiceEmailSendDialogOpen(true);
  };

  const handleSendInvoiceEmail = async () => {
    const validationMessage = getInvoiceEmailRecipientValidationMessage();

    setInvoiceEmailError(null);
    setInvoiceEmailSuccess(null);

    if (validationMessage) {
      setInvoiceEmailError(validationMessage);
      setInvoiceEmailRecipientFormError(validationMessage);
      return;
    }

    if (!invoiceEmailSubjectInput.trim()) {
      setInvoiceEmailError("Cargá el asunto del email.");
      return;
    }

    if (!invoiceEmailBodyInput.trim()) {
      setInvoiceEmailError("Cargá el contenido del email.");
      return;
    }

    setInvoiceEmailRecipientFormError(null);
    setIsSendingInvoiceEmail(true);

    try {
      const result = await sendSaleInvoiceEmailAction({
        orgSlug,
        saleId: sale.id,
        recipients: invoiceEmailRecipients,
        fromName: invoiceEmailFromNameInput,
        subject: invoiceEmailSubjectInput,
        bodyText: invoiceEmailBodyInput,
        attachPdf: invoiceEmailAttachPdf,
      });

      if (!result.success) {
        setInvoiceEmailError(result.error);
        router.refresh();
        return;
      }

      setInvoiceEmailRecipientInput(result.recipient);
      setInvoiceEmailSuccess(`Factura enviada a ${result.recipient}.`);
      setIsInvoiceEmailSendDialogOpen(false);
      router.refresh();
    } catch (sendError) {
      setInvoiceEmailError(
        sendError instanceof Error
          ? sendError.message
          : "No se pudo enviar la factura por email."
      );
    } finally {
      setIsSendingInvoiceEmail(false);
    }
  };

  const handleGenerateRemittance = async () => {
    try {
      const type =
        isDispatchedSale || isDeliveredSale ? "REMITO_FINAL" : "PRESUPUESTO";
      await generateRemittance(type);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al generar el remito"
      );
    }
  };

  const handleGenerateBudget = async () => {
    try {
      await generateRemittance("PRESUPUESTO");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al generar el presupuesto"
      );
    }
  };

  const handleGenerateInvoicePdf = async () => {
    setArcaError(null);
    try {
      await generateInvoicePdf();
    } catch (err) {
      setArcaError(
        err instanceof Error
          ? err.message
          : "Error al generar la factura fiscal"
      );
    }
  };

  const statusInfo = statusLabels[sale.status];

  let remittancePlaceholder = "Ej: 0001-00012345";
  if (remittanceSettings?.autoEnabled) {
    remittancePlaceholder = "Generado automáticamente";
  }
  if (isGeneratingRemittance) {
    remittancePlaceholder = "Generando...";
  }

  return (
    <div className="space-y-6">
      {accountingPayload && (
        <AsientoModal
          eventoPayload={accountingPayload}
          mode="gate"
          onCancel={handleAccountingCancel}
          onConfirm={handleAccountingConfirm}
          open={!!accountingPayload}
          persistAs="informal"
          sourceType={
            invoiceType === "NOTA_DE_VENTA"
              ? "NOTA_DE_VENTA"
              : "FACTURA_PENDIENTE"
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/org/${orgSlug}/ventas`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a ventas
          </Button>
        </Link>

        <Badge
          className={cn("border px-3 py-1", statusInfo.badgeClass)}
          variant="outline"
        >
          {statusInfo.label}
        </Badge>

        <div className="ml-auto flex gap-2">
          {isDraftSale ? (
            <Button
              disabled={isGeneratingRemittance}
              onClick={handleGenerateBudget}
              size="sm"
              type="button"
              variant="outline"
            >
              {isGeneratingRemittance ? (
                "Generando..."
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Generar Presupuesto
                </>
              )}
            </Button>
          ) : null}
          {isConfirmedSale || isDispatchedSale ? (
            <Button
              disabled={isGeneratingRemittance}
              onClick={handleGenerateRemittance}
              size="sm"
              type="button"
              variant="outline"
            >
              {isGeneratingRemittance ? (
                "Generando..."
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {isConfirmedSale ? "Generar Presupuesto" : "Generar Remito"}
                </>
              )}
            </Button>
          ) : null}
          {canManageSale && isDispatchedSale ? (
            <Button
              disabled={isDeliverMutationPending}
              onClick={handleDeliver}
              size="sm"
              type="button"
              variant="outline"
            >
              {isDeliverMutationPending
                ? "Marcando..."
                : "Marcar como entregada"}
            </Button>
          ) : null}
          {canManageSale && isConfirmedSale ? (
            <Button
              disabled={isDispatching}
              onClick={() => setIsDispatchDialogOpen(true)}
              size="sm"
              type="button"
            >
              <Truck className="mr-2 h-4 w-4" />
              {isDispatching ? "Despachando..." : "Despachar"}
            </Button>
          ) : null}
          {canManageSale && (isDispatchedSale || isDeliveredSale) ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/org/${orgSlug}/ventas/${sale.id}/devolucion`}>
                Devolver productos
              </Link>
            </Button>
          ) : null}
          {canManageSale ? (
            <Button
              disabled={isSavingDraft}
              onClick={toggleEditingDetails}
              size="sm"
              type="button"
              variant={isEditingDetails ? "secondary" : "outline"}
            >
              {isEditingDetails ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  {isSavingDraft ? "Guardando..." : "Guardar y bloquear"}
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar venta
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">
          Venta #
          {sale.sale_number ?? sale.invoice_number ?? sale.id.slice(0, 6)}
        </h1>
      </div>

      {canShowArcaCard ? (
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Factura fiscal ARCA</CardTitle>
              <CardDescription>
                Emisión manual para esta venta usando la configuración fiscal de
                la organización.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  "border",
                  arcaStatusBadgeClassNames[normalizedArcaStatus]
                )}
                variant="outline"
              >
                {arcaStatusLabels[normalizedArcaStatus]}
              </Badge>
              {isArcaAuthorized ? (
                <Button
                  disabled={isGeneratingInvoicePdf}
                  onClick={handleGenerateInvoicePdf}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isGeneratingInvoicePdf ? (
                    "Generando PDF..."
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Imprimir factura
                    </>
                  )}
                </Button>
              ) : null}
              {isArcaAuthorized ? (
                <Button
                  disabled={isSendingInvoiceEmail}
                  onClick={openInvoiceEmailSendDialog}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isSendingInvoiceEmail ? (
                    "Enviando..."
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      {invoiceEmailButtonLabel}
                    </>
                  )}
                </Button>
              ) : null}
              {canEmitArcaInvoice ? (
                <Button
                  disabled={isEmittingInvoice}
                  onClick={handleEmitInvoice}
                  size="sm"
                  type="button"
                >
                  {isEmittingInvoice ? "Emitiendo..." : "Emitir factura"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isArcaAuthorized ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Comprobante</p>
                  <p className="font-medium">{sale.invoice_number ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">CAE</p>
                  <p className="font-medium">{sale.arca_cae ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">
                    Vencimiento CAE
                  </p>
                  <p className="font-medium">
                    {sale.arca_cae_expires_at
                      ? formatDateOnly(sale.arca_cae_expires_at)
                      : "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">
                    Punto y número
                  </p>
                  <p className="font-medium">
                    {sale.arca_point_of_sale && sale.arca_voucher_number
                      ? `${String(sale.arca_point_of_sale).padStart(4, "0")} / ${String(
                          sale.arca_voucher_number
                        ).padStart(8, "0")}`
                      : "—"}
                  </p>
                </div>
              </div>
            ) : null}

            {isArcaAuthorized ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">Email de factura</p>
                    <p className="text-muted-foreground">
                      {invoiceEmailRecipientLabel ||
                        "Sin destinatarios cargados"}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border",
                      invoiceEmailStatusBadgeClassNames[invoiceEmailStatus]
                    )}
                    variant="outline"
                  >
                    {invoiceEmailStatusLabels[invoiceEmailStatus]}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Último intento</p>
                    <p className="font-medium">
                      {formatDateTimeLabel(sale.invoice_email_last_attempt_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Aceptado por Resend</p>
                    <p className="font-medium">
                      {formatDateTimeLabel(sale.invoice_email_sent_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Entregado</p>
                    <p className="font-medium">
                      {formatDateTimeLabel(sale.invoice_email_delivered_at)}
                    </p>
                  </div>
                </div>

                {sale.invoice_email_last_error ? (
                  <div className="mt-3 rounded-md border border-red-200 bg-white px-3 py-2 text-red-700">
                    <p className="font-medium">Último error de email</p>
                    <p>{sale.invoice_email_last_error}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {normalizedArcaStatus === "error" &&
            sale.arca_last_error &&
            !hasPendingFiscalChanges ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                <p className="font-medium">Último error fiscal</p>
                <p>{sale.arca_last_error}</p>
              </div>
            ) : null}

            {arcaError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                <p className="font-medium">Error al emitir factura</p>
                <p>{arcaError}</p>
              </div>
            ) : null}

            {arcaSuccessMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                <p>{arcaSuccessMessage}</p>
              </div>
            ) : null}

            {invoiceEmailError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                <p className="font-medium">Error al enviar email</p>
                <p>{invoiceEmailError}</p>
              </div>
            ) : null}

            {invoiceEmailSuccess ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                <p>{invoiceEmailSuccess}</p>
              </div>
            ) : null}

            {arcaBlockMessage ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 text-sm">
                <p>{arcaBlockMessage}</p>
                {!arcaReadiness.isActive && arcaReadiness.lastError ? (
                  <p className="mt-2 text-red-700">
                    Último estado ARCA: {arcaReadiness.lastError}
                  </p>
                ) : null}
                {!arcaReadiness.isActive && arcaReadiness.canManageSettings ? (
                  <p className="mt-2">
                    <Link
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={`/org/${orgSlug}/configuracion/arca`}
                    >
                      Ir a configuración ARCA
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                {sale.is_historical && sale.supplier ? (
                  <div className="space-y-2">
                    <Label>Proveedor</Label>
                    <p className="font-medium text-sm leading-none">
                      {sale.supplier.name}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="customer">Cliente</Label>
                  <Popover
                    onOpenChange={setIsCustomerPickerOpen}
                    open={isCustomerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isCustomerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="customer"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedCustomer
                            ? selectedCustomer.fantasy_name ||
                              selectedCustomer.business_name
                            : "Selecciona un cliente"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => {
                              const label =
                                customer.fantasy_name ||
                                customer.business_name ||
                                "Cliente sin nombre";
                              return (
                                <CommandItem
                                  key={customer.id}
                                  onSelect={() => {
                                    setCustomerId(customer.id);
                                    setIsCustomerPickerOpen(false);
                                  }}
                                  value={label}
                                >
                                  <span className="flex-1 truncate">
                                    {label}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      customerId === customer.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Cliente asignado a la venta.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seller">Vendedor</Label>
                  <Popover
                    onOpenChange={setIsSellerPickerOpen}
                    open={isSellerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isSellerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="seller"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">{selectedSellerLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar vendedor..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {availableSellers
                              .filter((member) => Boolean(member.user_id))
                              .map((seller) => (
                                <CommandItem
                                  key={seller.user_id}
                                  keywords={[buildSellerLabel(seller)]}
                                  onSelect={() => {
                                    setSellerId(seller.user_id);
                                    setIsSellerPickerOpen(false);
                                  }}
                                  value={seller.user_id}
                                >
                                  <span className="flex-1 truncate">
                                    {buildSellerLabel(seller)}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      sellerId === seller.user_id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Usamos los usuarios de la organización como vendedores.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="saleDate">Fecha de venta</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !saleDate && "text-muted-foreground"
                        )}
                        disabled={!isEditingDetails}
                        id="saleDate"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {saleDate ? (
                          format(saleDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => setSaleDate(date ?? new Date())}
                        selected={saleDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expirationDays">Fecha de vencimiento</Label>
                  <Input
                    disabled={!isEditingDetails}
                    id="expirationDays"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setExpirationDays(
                        Number.isNaN(parsed) ? null : Math.max(0, parsed)
                      );
                    }}
                    placeholder="Días hasta el vencimiento"
                    step="1"
                    type="number"
                    value={normalizedExpirationDays ?? ""}
                  />
                  <p className="text-muted-foreground text-xs">
                    {expirationDateString ? (
                      <>
                        Vence el {formatDateOnly(expirationDateString)}
                        {normalizedExpirationDays !== null
                          ? ` (hoy + ${normalizedExpirationDays} días)`
                          : ""}
                        .
                      </>
                    ) : (
                      "Si lo dejas vacío, usamos la fecha de venta."
                    )}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="invoiceType">Tipo de comprobante</Label>
                  <Select
                    disabled={!isEditingDetails}
                    onValueChange={(value) =>
                      setInvoiceType(value as InvoiceType)
                    }
                    value={invoiceType}
                  >
                    <SelectTrigger className="w-full" id="invoiceType">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoiceTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipoFactura">Tipo contable</Label>
                  <Select
                    disabled={!isEditingDetails}
                    onValueChange={(value) =>
                      setTipoFactura(value as SaleAccountingInvoiceKind)
                    }
                    value={tipoFactura}
                  >
                    <SelectTrigger className="w-full" id="tipoFactura">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountingInvoiceKindOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxes">Impuestos</Label>
                  <Popover
                    onOpenChange={setIsTaxesPickerOpen}
                    open={isTaxesPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isTaxesPickerOpen}
                        className="h-auto min-h-9 w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="taxes"
                        role="combobox"
                        variant="outline"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 pr-2.5">
                          {selectedTaxes.length > 0 ? (
                            selectedTaxes.map((tax) => (
                              <Badge
                                className="rounded-sm"
                                key={tax.id}
                                variant="outline"
                              >
                                {tax.name} ({tax.rate}%)
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">
                              Seleccione impuestos (opcional)
                            </span>
                          )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-(--radix-popover-trigger-width) p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar impuesto..." />
                        <CommandList>
                          <CommandEmpty>
                            No se encontraron impuestos.
                          </CommandEmpty>
                          <CommandGroup>
                            {availableTaxes.map((tax) => (
                              <CommandItem
                                key={tax.id}
                                onSelect={() => handleToggleTax(tax.id)}
                                value={tax.name}
                              >
                                <span className="flex-1 truncate">
                                  {tax.name} ({tax.rate}%)
                                </span>
                                {selectedTaxIds.includes(tax.id) ? (
                                  <Check className="h-4 w-4 shrink-0 text-primary" />
                                ) : null}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Selecciona los impuestos aplicados a esta venta.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Número de comprobante</Label>
                  <Input
                    disabled={!isEditingDetails}
                    id="invoiceNumber"
                    onChange={(event) =>
                      setInvoiceNumber(event.target.value.slice(0, 50))
                    }
                    placeholder="Opcional"
                    value={invoiceNumber ?? ""}
                  />
                </div>
                {sale.remittance_number ? (
                  <div className="space-y-2">
                    <Label htmlFor="remittanceNumberDisplay">
                      Número de remito
                    </Label>
                    <Input
                      disabled={!isEditingDetails}
                      id="remittanceNumberDisplay"
                      onChange={(event) =>
                        setRemittanceNumber(event.target.value.slice(0, 100))
                      }
                      value={remittanceNumber}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="observations">Observaciones</Label>
                  <textarea
                    className={textareaBaseClasses}
                    disabled={!isEditingDetails}
                    id="observations"
                    onChange={(event) => setObservations(event.target.value)}
                    placeholder="Notas internas o comentarios del cliente"
                    value={observations ?? ""}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Productos de la venta</CardTitle>
              <CardDescription>
                Solo puedes ajustar cantidades y peso para los productos por
                kilo/litro. En modo edición también puedes agregar productos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingDetails ? (
                <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="supplierFilter">Proveedor</Label>
                      <Popover
                        onOpenChange={setIsSupplierFilterOpen}
                        open={isSupplierFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isSupplierFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="supplierFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {supplierFilterLabel || "Todos"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar proveedor..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setSupplierFilter("");
                                    setIsSupplierFilterOpen(false);
                                  }}
                                  value="Todos"
                                >
                                  <span className="flex-1 truncate">Todos</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      supplierFilter
                                        ? "opacity-0"
                                        : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {supplierOptions.map((supplier) => (
                                  <CommandItem
                                    key={supplier.id}
                                    onSelect={() => {
                                      setSupplierFilter(supplier.id);
                                      setIsSupplierFilterOpen(false);
                                    }}
                                    value={supplier.label}
                                  >
                                    <span className="flex-1 truncate">
                                      {supplier.label}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        supplierFilter === supplier.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="brandFilter">Marca</Label>
                      <Popover
                        onOpenChange={setIsBrandFilterOpen}
                        open={isBrandFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isBrandFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="brandFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {brandFilterLabel || "Todas"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar marca..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setBrandFilter("");
                                    setIsBrandFilterOpen(false);
                                  }}
                                  value="Todas"
                                >
                                  <span className="flex-1 truncate">Todas</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      brandFilter ? "opacity-0" : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {brandOptions.map((brand) => (
                                  <CommandItem
                                    key={brand}
                                    onSelect={() => {
                                      setBrandFilter(brand);
                                      setIsBrandFilterOpen(false);
                                    }}
                                    value={brand}
                                  >
                                    <span className="flex-1 truncate">
                                      {brand}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        brandFilter === brand
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="categoryFilter">Categoría</Label>
                      <Popover
                        onOpenChange={setIsCategoryFilterOpen}
                        open={isCategoryFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isCategoryFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="categoryFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {categoryFilterLabel || "Todas"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar categoría..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setCategoryFilter("");
                                    setIsCategoryFilterOpen(false);
                                  }}
                                  value="Todas"
                                >
                                  <span className="flex-1 truncate">Todas</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      categoryFilter
                                        ? "opacity-0"
                                        : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {categoryOptions.map((category) => (
                                  <CommandItem
                                    key={category.id}
                                    onSelect={() => {
                                      setCategoryFilter(category.id);
                                      setIsCategoryFilterOpen(false);
                                    }}
                                    value={category.label}
                                  >
                                    <span className="flex-1 truncate">
                                      {category.label}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        categoryFilter === category.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,_2fr)_140px_auto] md:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="product">Producto</Label>
                      <Popover
                        onOpenChange={setIsProductPickerOpen}
                        open={isProductPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isProductPickerOpen}
                            className="w-full justify-between text-left font-normal"
                            id="product"
                            role="combobox"
                            variant="outline"
                          >
                            {selectedProduct ? (
                              <div className="flex flex-1 flex-col text-left leading-tight">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-medium">
                                    {selectedProduct.name}
                                  </span>
                                  {(selectedProduct.totalQuantity === null ||
                                    selectedProduct.totalQuantity <= 0) && (
                                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 font-semibold text-[10px] text-amber-700">
                                      Sin stock
                                    </span>
                                  )}
                                </div>
                                <span className="truncate text-muted-foreground text-xs">
                                  {selectedProduct.sku} ·{" "}
                                  {formatPriceByMeasure(
                                    selectedProduct.price,
                                    selectedProduct.unitOfMeasure
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                Selecciona un producto
                              </span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[520px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar producto por nombre o SKU..." />
                            <CommandList>
                              <CommandEmpty>
                                No se encontraron productos para los filtros
                                aplicados.
                              </CommandEmpty>
                              <CommandGroup>
                                {filteredProducts.map((product) => {
                                  const averageLabel =
                                    product.tracksStockUnits &&
                                    product.averageQuantityPerUnit !== null &&
                                    product.averageQuantityPerUnit > 0
                                      ? formatAveragePerUnit(
                                          product.averageQuantityPerUnit,
                                          product.unitOfMeasure
                                        )
                                      : null;
                                  const appliedPrice =
                                    resolveAppliedUnitPrice(product);

                                  return (
                                    <CommandItem
                                      key={product.id}
                                      keywords={[
                                        product.name,
                                        product.sku,
                                        product.brand ?? "",
                                        product.supplierName ?? "",
                                        product.categoryName ?? "",
                                      ]}
                                      onSelect={() => {
                                        setSelectedProductId(product.id);
                                        setIsProductPickerOpen(false);
                                      }}
                                      value={product.id}
                                    >
                                      <div className="flex w-full items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <p className="truncate font-medium">
                                              {product.name}
                                            </p>
                                            {(product.totalQuantity === null ||
                                              product.totalQuantity <= 0) && (
                                              <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 font-semibold text-[10px] text-amber-700">
                                                Sin stock
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-muted-foreground text-xs">
                                            {product.sku} ·{" "}
                                            {formatPriceByMeasure(
                                              product.price,
                                              product.unitOfMeasure
                                            )}
                                          </p>
                                          {averageLabel ? (
                                            <p className="text-[11px] text-muted-foreground">
                                              Prom: {averageLabel} · Precio
                                              aplicado:{" "}
                                              {formatCurrency(appliedPrice)} x
                                              unidad
                                            </p>
                                          ) : null}
                                        </div>
                                        <Check
                                          className={cn(
                                            "h-4 w-4 shrink-0 text-primary transition-opacity",
                                            selectedProductId === product.id
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Cantidad</Label>
                      <Input
                        id="quantity"
                        inputMode="decimal"
                        min={0}
                        onChange={(event) => {
                          const parsed = Number.parseFloat(event.target.value);
                          setSelectedQuantity(
                            Number.isNaN(parsed) ? 0 : parsed
                          );
                        }}
                        placeholder="0"
                        step="0.01"
                        type="number"
                        value={
                          !selectedQuantity || Number.isNaN(selectedQuantity)
                            ? ""
                            : selectedQuantity
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-2 md:items-end">
                      <Button
                        className="w-full md:w-auto"
                        onClick={handleAddAdjustment}
                        type="button"
                        variant="outline"
                      >
                        <PlusMinus className="mr-2 h-4 w-4" />
                        Agregar ajuste manual
                      </Button>
                      <Button
                        className="w-full md:w-auto"
                        onClick={handleAddProduct}
                        type="button"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No hay productos cargados en esta preventa.
                  </div>
                ) : (
                  <div className="divide-y">
                    {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                    {items.map((item) => {
                      const isAdjustment = item.type === "adjustment";
                      const averageLabel = formatAveragePerUnit(
                        item.averageQuantityPerUnit,
                        item.unitOfMeasure
                      );
                      const showWeightInput =
                        !isAdjustment && item.tracksStockUnits;
                      let unitPriceValue: number | "";
                      if (showWeightInput) {
                        unitPriceValue =
                          !item.basePrice || Number.isNaN(item.basePrice)
                            ? ""
                            : item.basePrice;
                      } else {
                        unitPriceValue =
                          !item.unitPrice || Number.isNaN(item.unitPrice)
                            ? ""
                            : item.unitPrice;
                      }

                      if (isAdjustment) {
                        const subtotal = calculateItemTotals(item).subtotal;
                        return (
                          <div
                            className="grid gap-4 bg-amber-50/60 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_minmax(120px,_1fr)_minmax(120px,_1fr)_auto] sm:items-center sm:pr-0"
                            key={item.id}
                          >
                            <div className="min-w-0 space-y-2">
                              <div className="flex items-center gap-2 text-amber-600 text-xs">
                                <PlusMinus className="h-4 w-4" />
                                Ajuste manual
                              </div>
                              <Input
                                className="h-8 w-full"
                                disabled={!isEditingDetails}
                                onChange={(event) =>
                                  handleAdjustmentNameChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                placeholder="Descripción del ajuste"
                                value={item.name}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Monto
                              </span>
                              <Input
                                className="h-8 w-full min-w-[96px]"
                                disabled={!isEditingDetails}
                                inputMode="decimal"
                                onChange={(event) =>
                                  handleUnitPriceChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                step="0.01"
                                type="number"
                                value={unitPriceValue}
                              />
                            </div>

                            <div className="flex items-center justify-between sm:justify-end">
                              <div className="flex flex-col items-start gap-1 sm:items-end">
                                <span className="text-muted-foreground text-xs">
                                  Subtotal
                                </span>
                                <p
                                  className={cn(
                                    "font-medium",
                                    subtotal < 0 ? "text-destructive" : ""
                                  )}
                                >
                                  {formatCurrency(subtotal)}
                                </p>
                              </div>
                              <Button
                                className="ml-2"
                                disabled={!isEditingDetails}
                                onClick={() => handleRemoveItem(item.id)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,_1fr)_auto] sm:pr-0"
                          key={item.id}
                        >
                          <div className="min-w-0 sm:col-span-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{item.name}</p>
                              {item.brand ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.brand}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-[minmax(88px,_1fr)_minmax(96px,_1fr)_minmax(88px,_1fr)_minmax(96px,_1fr)_minmax(148px,_max-content)_auto] sm:items-end">
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Cantidad (uds)
                              </span>
                              <Input
                                className="h-8 w-full min-w-[80px]"
                                disabled={!isEditingDetails}
                                inputMode="decimal"
                                min={0}
                                onChange={(event) =>
                                  handleQuantityChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                placeholder="0"
                                step="0.01"
                                type="number"
                                value={
                                  !item.quantity || Number.isNaN(item.quantity)
                                    ? ""
                                    : item.quantity
                                }
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Precio unitario
                              </span>
                              <Input
                                className="h-8 w-full min-w-[96px]"
                                disabled={!isEditingDetails}
                                inputMode="decimal"
                                min={0}
                                onChange={(event) =>
                                  handleUnitPriceChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                step="0.01"
                                type="number"
                                value={unitPriceValue}
                              />
                            </div>

                            {showWeightInput ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-muted-foreground text-xs">
                                  {`Peso (${unitOfMeasureLabels[item.unitOfMeasure]})`}
                                </span>
                                <Input
                                  className="h-8 w-full min-w-[80px]"
                                  disabled={!isEditingDetails}
                                  inputMode="decimal"
                                  min={0}
                                  onChange={(event) =>
                                    handleWeightChange(
                                      item.id,
                                      event.target.value
                                    )
                                  }
                                  placeholder="0"
                                  step="0.01"
                                  type="number"
                                  value={
                                    !item.weightQuantity ||
                                    item.weightQuantity === null ||
                                    Number.isNaN(item.weightQuantity)
                                      ? ""
                                      : item.weightQuantity
                                  }
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="text-muted-foreground text-xs">
                                  Peso
                                </span>
                                <Input
                                  className="h-8 w-full"
                                  disabled
                                  value="No aplica"
                                />
                              </div>
                            )}

                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Descuento %
                              </span>
                              <Input
                                className="h-8 w-full min-w-[80px]"
                                disabled={!isEditingDetails}
                                inputMode="decimal"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                  handleDiscountChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                step="0.01"
                                type="number"
                                value={
                                  Number.isNaN(item.discountPercent) ||
                                  item.discountPercent === 0
                                    ? ""
                                    : item.discountPercent
                                }
                              />
                            </div>

                            <div className="flex items-center justify-between sm:justify-end">
                              <div className="flex flex-col items-start gap-1 sm:items-end">
                                <span className="text-muted-foreground text-xs">
                                  Subtotal
                                </span>
                                <p className="whitespace-nowrap text-right font-medium tabular-nums">
                                  {formatCurrency(
                                    calculateItemTotals(item).subtotal
                                  )}
                                </p>
                                {isEditingDetails ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    Desc.: {item.discountPercent || 0}%
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                className="ml-2"
                                disabled={!isEditingDetails}
                                onClick={() => handleRemoveItem(item.id)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="min-w-0 text-muted-foreground sm:col-span-2">
                            <p className="text-sm">
                              {item.sku} · {formatCurrency(item.basePrice)} x{" "}
                              {unitOfMeasureLabels[item.unitOfMeasure]}
                            </p>
                            {averageLabel ? (
                              <p className="text-xs">Prom: {averageLabel}</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <div className="sticky top-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de venta</CardTitle>
                <CardDescription>
                  Totales y detalle de los productos agregados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Productos ({items.length})
                    </span>
                    <span>{items.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Unidades totales
                    </span>
                    <span>{totals.totalUnits}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Peso estimado</span>
                    <span>
                      {totals.totalWeight > 0
                        ? `${totals.totalWeight.toFixed(2)} ${weightUnitLabel}`
                        : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(summaryTotals.subtotal)}</span>
                  </div>
                  {totals.adjustmentsTotal !== 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Ajustes manuales
                      </span>
                      <span
                        className={cn(
                          totals.adjustmentsTotal < 0 ? "text-destructive" : ""
                        )}
                      >
                        {formatCurrency(totals.adjustmentsTotal)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">
                        Descuento{" "}
                        {globalDiscountPercent
                          ? `(orden ${globalDiscountPercent}%)`
                          : "(prod. + orden)"}
                      </span>
                      {summaryTotals.lineDiscountAmount > 0 ||
                      summaryTotals.globalDiscountAmount > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {summaryTotals.lineDiscountAmount > 0
                            ? `Prod: -${formatCurrency(summaryTotals.lineDiscountAmount)}`
                            : ""}
                          {summaryTotals.lineDiscountAmount > 0 &&
                          summaryTotals.globalDiscountAmount > 0
                            ? " · "
                            : ""}
                          {summaryTotals.globalDiscountAmount > 0
                            ? `Orden: -${formatCurrency(summaryTotals.globalDiscountAmount)}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-medium">
                      -{formatCurrency(summaryTotals.totalDiscountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Subtotal con desc.
                    </span>
                    <span>
                      {formatCurrency(summaryTotals.discountedSubtotal)}
                    </span>
                  </div>
                  {summaryTotals.taxDetails.map(({ tax, amount }) => (
                    <div
                      className="flex items-center justify-between"
                      key={tax.id}
                    >
                      <span className="text-muted-foreground">
                        {tax.name} ({tax.rate}%)
                      </span>
                      <span>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(summaryTotals.total)}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Vence el {formatDateOnly(dueDate)}
                  </p>
                </div>

                {error ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {error}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                    {successMessage}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {canManageSale &&
                (isDraftSale ||
                  isConfirmedSale ||
                  isDispatchedSale ||
                  isDeliveredSale) &&
                isEditingDetails ? (
                  <Button
                    className="w-full justify-between"
                    disabled={!canSaveDraft || isSavingDraft}
                    onClick={handleSaveDraft}
                    type="button"
                    variant="outline"
                  >
                    {saveDraftButtonLabel}
                  </Button>
                ) : null}
                {canManageSale ? (
                  <Button
                    className="w-full justify-between"
                    disabled={!canConfirm || isSaving}
                    onClick={handleConfirm}
                    title={
                      isDraftSale
                        ? undefined
                        : "Solo preventas en borrador pueden confirmarse."
                    }
                    type="button"
                  >
                    {isSaving ? (
                      "Confirmando..."
                    ) : (
                      <div className="flex items-center">
                        <CheckCircleIcon
                          className="mr-2 h-4 w-4"
                          weight="duotone"
                        />
                        Confirmar venta
                      </div>
                    )}
                  </Button>
                ) : null}
                <div className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-muted-foreground text-xs">
                  <span>Descuento %</span>
                  <Input
                    className="h-8 w-24 text-right"
                    disabled={!isEditingDetails}
                    inputMode="decimal"
                    max={100}
                    min={0}
                    onChange={(event) => {
                      const parsed = Number.parseFloat(event.target.value);
                      setGlobalDiscountPercent(
                        Number.isNaN(parsed)
                          ? 0
                          : Math.min(Math.max(0, parsed), 100)
                      );
                    }}
                    step="0.01"
                    type="number"
                    value={
                      Number.isNaN(globalDiscountPercent) ||
                      globalDiscountPercent === 0
                        ? ""
                        : globalDiscountPercent
                    }
                  />
                </div>
              </CardFooter>
            </Card>

            {sale.receivable && !isDraftSale ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cobranza</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span>
                      {formatCurrency(sale.receivable.total_amount ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pendiente</span>
                    <span
                      className={cn(
                        "font-medium",
                        (sale.receivable.pending_balance ?? 0) === 0
                          ? "text-green-600"
                          : "text-orange-600"
                      )}
                    >
                      {formatCurrency(sale.receivable.pending_balance ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cobrado</span>
                    <span className="text-green-600">
                      {formatCurrency(
                        Math.max(
                          0,
                          (sale.receivable.total_amount ?? 0) -
                            (sale.receivable.pending_balance ?? 0)
                        )
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {creditNotes.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Notas de Crédito
                    <Badge variant="secondary">{creditNotes.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {creditNotes.map((nc, idx) => (
                    <div key={nc.id}>
                      {idx > 0 && <Separator />}
                      <CreditNoteRow nc={nc} orgSlug={orgSlug} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {saleReturns.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Devoluciones
                    <Badge variant="secondary">{saleReturns.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {saleReturns.map((ret, idx) => (
                    <div className="space-y-1.5" key={ret.id}>
                      {idx > 0 && <Separator />}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          {formatDateOnly(ret.return_date)}
                        </span>
                        <span className="font-medium text-red-600 text-xs">
                          -{formatCurrency(ret.total)}
                        </span>
                      </div>
                      {ret.items.map((item, i) => (
                        <div
                          className="flex items-center justify-between text-xs"
                          key={`${ret.id}-${i}`}
                        >
                          <span className="truncate text-muted-foreground">
                            {item.productName} ×{item.quantity}
                          </span>
                          <span className="shrink-0 pl-2">
                            {formatCurrency(item.creditAmount)}
                          </span>
                        </div>
                      ))}
                      {ret.reason ? (
                        <p className="text-muted-foreground text-xs italic">
                          {ret.reason}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {saleReturns.length > 1 ? (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between font-medium">
                        <span>Total devuelto</span>
                        <span className="text-red-600">
                          -
                          {formatCurrency(
                            saleReturns.reduce((a, r) => a + r.total, 0)
                          )}
                        </span>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        onOpenChange={setIsInvoiceEmailSendDialogOpen}
        open={isInvoiceEmailSendDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {invoiceEmailButtonLabel === "Reenviar email"
                ? "Reenviar factura por email"
                : "Enviar factura por email"}
            </DialogTitle>
            <DialogDescription>
              Revisá y editá el email antes de enviarlo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invoiceEmailRecipients">Destinatarios</Label>
              <Textarea
                id="invoiceEmailRecipients"
                onChange={(event) => {
                  setInvoiceEmailRecipientInput(event.target.value);
                  setInvoiceEmailRecipientFormError(null);
                }}
                placeholder="cliente@empresa.com, administracion@empresa.com"
                value={invoiceEmailRecipientInput}
              />
              <p className="text-muted-foreground text-sm">
                Para enviar a más de una dirección, separá los emails con coma,
                punto y coma, espacio o enter.
              </p>
              {invoiceEmailRecipientFormError ? (
                <p className="text-red-600 text-sm">
                  {invoiceEmailRecipientFormError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceEmailFromName">Remitente</Label>
                <Input
                  id="invoiceEmailFromName"
                  onChange={(event) =>
                    setInvoiceEmailFromNameInput(event.target.value)
                  }
                  placeholder={organizationName}
                  value={invoiceEmailFromNameInput}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceEmailSubject">Asunto</Label>
                <Input
                  id="invoiceEmailSubject"
                  onChange={(event) =>
                    setInvoiceEmailSubjectInput(event.target.value)
                  }
                  value={invoiceEmailSubjectInput}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceEmailBody">Contenido</Label>
              <Textarea
                className="min-h-36"
                id="invoiceEmailBody"
                onChange={(event) =>
                  setInvoiceEmailBodyInput(event.target.value)
                }
                value={invoiceEmailBodyInput}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
              <div>
                <p className="font-medium text-sm">Adjuntar factura fiscal</p>
                <p className="text-muted-foreground text-sm">
                  Incluye el PDF autorizado por ARCA en el email.
                </p>
              </div>
              <Switch
                checked={invoiceEmailAttachPdf}
                onCheckedChange={setInvoiceEmailAttachPdf}
              />
            </div>

            {invoiceEmailError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                {invoiceEmailError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setIsInvoiceEmailSendDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isSendingInvoiceEmail}
              onClick={handleSendInvoiceEmail}
              type="button"
            >
              {isSendingInvoiceEmail ? "Enviando..." : "Enviar email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={setIsDispatchDialogOpen}
        open={isDispatchDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Despachar venta</DialogTitle>
            <DialogDescription>
              {remittanceSettings?.autoEnabled
                ? "El número de remito se genera automáticamente."
                : "Ingresa el número de remito para marcar esta venta como despachada."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="remittanceNumber">Número de remito</Label>
              <Input
                autoFocus={!remittanceSettings?.autoEnabled}
                disabled={isGeneratingRemittance}
                id="remittanceNumber"
                onChange={(event) =>
                  setRemittanceNumber(event.target.value.slice(0, 100))
                }
                placeholder={remittancePlaceholder}
                value={remittanceNumber}
              />
              {remittanceSettings?.autoEnabled && (
                <p className="text-muted-foreground text-xs">
                  Podés editar el número antes de confirmar.
                </p>
              )}
            </div>

            {carriers.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="dispatchCarrier">
                  Transporte{requireCarrier ? "" : " (opcional)"}
                </Label>
                <Select
                  onValueChange={(v) =>
                    setSelectedCarrierId(v === "none" ? null : v)
                  }
                  value={selectedCarrierId ?? "none"}
                >
                  <SelectTrigger id="dispatchCarrier">
                    <SelectValue placeholder="Seleccionar transporte..." />
                  </SelectTrigger>
                  <SelectContent>
                    {!requireCarrier && (
                      <SelectItem value="none">Sin transporte</SelectItem>
                    )}
                    {carriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setIsDispatchDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDispatching || isGeneratingRemittance}
              onClick={handleDispatch}
              type="button"
            >
              {isDispatching ? "Despachando..." : "Confirmar despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
