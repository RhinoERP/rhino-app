import type {
  CustomerStatus,
  LeverKey,
  OpportunityStage,
  OpportunityType,
} from "./types";

export const OPPORTUNITY_TYPES: Record<
  OpportunityType,
  { label: string; className: string }
> = {
  riesgo: {
    label: "En riesgo",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  },
  reactivar: {
    label: "Reactivar",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  faltante: {
    label: "Producto faltante",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  },
  cross: {
    label: "Cross-sell",
    className:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  },
};

export const STAGES: Record<
  OpportunityStage,
  { label: string; className: string }
> = {
  nueva: { label: "Nueva", className: "bg-muted text-muted-foreground" },
  contactada: {
    label: "Contactada",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  respondio: {
    label: "Respondió",
    className:
      "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  ganada: {
    label: "Ganada",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  perdida: {
    label: "Perdida",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  ignorada: {
    label: "Ignorada",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  despues: {
    label: "Para después",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
};

export const OPEN_STAGES: OpportunityStage[] = [
  "nueva",
  "contactada",
  "respondio",
  "despues",
];

export const CUSTOMER_STATUS: Record<
  CustomerStatus,
  { label: string; dotClassName: string }
> = {
  activo: { label: "Activo", dotClassName: "bg-emerald-500" },
  riesgo: { label: "En riesgo", dotClassName: "bg-red-500" },
  dormido: { label: "Dormido", dotClassName: "bg-amber-500" },
};

export const LEVERS: { key: LeverKey; label: string; help: string }[] = [
  {
    key: "base",
    label: "Mantener la base",
    help: "Lo que compran los clientes activos hasta su promedio de los 3 meses anteriores.",
  },
  {
    key: "rec",
    label: "Recuperar",
    help: "Clientes que vuelven después de 60 días o más sin comprar.",
  },
  {
    key: "vm",
    label: "Venderle más",
    help: "Lo que los clientes compran por encima de su promedio.",
  },
  {
    key: "nue",
    label: "Clientes nuevos",
    help: "Clientes sin compras en los meses anteriores.",
  },
];

export const STAGE_EVENT_TEXT: Partial<Record<OpportunityStage, string>> = {
  contactada: "Contactada",
  respondio: "Respondió",
  ganada: "Ganada",
  perdida: "Perdida",
  ignorada: "Ignorada",
  nueva: "Reabierta",
};

export const SUGGESTED_QUESTIONS = {
  vendedor: [
    "¿Qué tengo para hoy?",
    "¿A quién llamo primero y por qué?",
    "¿Cómo voy con mi meta del mes?",
    "Armame un mensaje para el cliente en riesgo más grande",
  ],
  gerente: [
    "¿Cómo viene el equipo este mes?",
    "¿Qué clientes tienen deuda vencida?",
    "¿Qué clientes se nos están yendo?",
    "¿Qué oportunidades valen más?",
  ],
} as const;
