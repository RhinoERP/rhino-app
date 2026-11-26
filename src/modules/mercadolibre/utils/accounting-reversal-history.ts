import type { parseMeliJournalEntriesByOrigin } from "./accounting-origin";

type Entry = ReturnType<typeof parseMeliJournalEntriesByOrigin>[number];
type Component = {
  key: string;
  originalEntryId: string;
  reversalEntryId: string | null;
};

function expectedEntries(components: Component[], issues: string[]) {
  const expected = new Map<string, Component>();
  const reversals = new Map<string, Component>();
  for (const component of components) {
    const original = component.originalEntryId.toLowerCase();
    const reversal = component.reversalEntryId?.toLowerCase();
    if (expected.has(original) || (reversal && reversals.has(reversal))) {
      issues.push("La reserva contiene asientos vinculados más de una vez.");
    }
    expected.set(original, component);
    if (reversal) {
      reversals.set(reversal, component);
    }
  }
  return { expected, reversals };
}

function reviewEntries(
  entries: Entry[],
  expected: Map<string, Component>,
  reversals: Map<string, Component>,
  issues: string[]
) {
  const foundOriginals = new Set<string>();
  const foundReversals = new Set<string>();
  for (const entry of entries) {
    const id = entry.id.toLowerCase();
    if (entry.tipo_evento === "CONTRA_ASIENTO") {
      const component = reversals.get(id);
      if (
        !component ||
        entry.referencia_tabla !== "accounting.journal_entries" ||
        entry.referencia_id.toLowerCase() !==
          component.originalEntryId.toLowerCase() ||
        entry.estado !== "ACTIVO" ||
        entry.anulado_por_id !== null
      ) {
        issues.push(`Contra-asiento ${entry.id} inesperado o no vigente.`);
      } else {
        foundReversals.add(id);
      }
      continue;
    }
    if (
      !expected.has(id) ||
      entry.tipo_evento !== "MELI_COBRO" ||
      entry.estado !== "ACTIVO" ||
      entry.anulado_por_id !== null
    ) {
      issues.push(`Asiento ${entry.id} inesperado o no vigente.`);
    } else {
      foundOriginals.add(id);
    }
  }
  return { foundOriginals, foundReversals };
}

export function reviewMeliReversalHistory(
  entries: Entry[],
  components: Component[]
): string[] {
  const issues: string[] = [];
  const { expected, reversals } = expectedEntries(components, issues);
  const { foundOriginals, foundReversals } = reviewEntries(
    entries,
    expected,
    reversals,
    issues
  );
  for (const [id, component] of expected) {
    if (!foundOriginals.has(id)) {
      issues.push(
        `${component.key}: el asiento original no aparece en la historia.`
      );
    }
  }
  for (const [id, component] of reversals) {
    if (!foundReversals.has(id)) {
      issues.push(
        `${component.key}: el contra-asiento no aparece en la historia.`
      );
    }
  }
  return [...new Set(issues)];
}
