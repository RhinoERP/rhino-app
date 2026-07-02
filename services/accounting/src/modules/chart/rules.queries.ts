import { db } from "../../db/client";
import type { AccountingRuleLine } from "../../db/types";
import type { RuleWithLines } from "./rules.types";

/**
 * Carga todas las reglas activas para un tipo de evento de una organización,
 * ordenadas por prioridad DESC (mayor prioridad primero).
 * Incluye las líneas de cada regla via JOIN.
 */
export async function loadRulesWithLines(
  orgId: string,
  tipoEvento: string
): Promise<RuleWithLines[]> {
  // Cargar reglas
  const rules = await db
    .selectFrom("accounting.accounting_rules")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("tipo_evento", "=", tipoEvento)
    .where("activa", "=", true)
    .orderBy("prioridad", "desc")
    .execute();

  if (rules.length === 0) {
    return [];
  }

  const ruleIds = rules.map((r) => r.id);

  // Cargar líneas de todas las reglas en una sola query
  const lines = await db
    .selectFrom("accounting.accounting_rule_lines")
    .selectAll()
    .where("rule_id", "in", ruleIds)
    .execute();

  // Agrupar líneas por rule_id
  const linesByRule = new Map<string, AccountingRuleLine[]>();
  for (const line of lines) {
    const existing = linesByRule.get(line.rule_id) ?? [];
    existing.push(line);
    linesByRule.set(line.rule_id, existing);
  }

  return rules.map((rule) => ({
    ...rule,
    lines: linesByRule.get(rule.id) ?? [],
  }));
}
