import { type Router as ExpressRouter, Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  getCuentaById,
  getCuentasArbol,
} from "../modules/accounts/accounts.queries";
import {
  createCuentaService,
  listCuentasService,
  toggleCuentaEstadoService,
  updateCuentaService,
} from "../modules/accounts/accounts.service";
import {
  CreateCuentaSchema,
  ListCuentasQuerySchema,
  UpdateCuentaSchema,
} from "../schemas/libros.schema";

const OrgIdQuery = z.object({ org_id: z.string().uuid() });

const router: ExpressRouter = Router();

/**
 * GET /cuentas/reglas?org_id=
 * Devuelve todas las reglas contables con sus líneas para una organización.
 */
router.get("/reglas", validateQuery(OrgIdQuery), async (req, res, next) => {
  try {
    const { org_id } = req.query as z.infer<typeof OrgIdQuery>;

    const rules = await db
      .selectFrom("accounting.accounting_rules")
      .selectAll()
      .where("org_id", "=", org_id)
      .orderBy("tipo_evento", "asc")
      .orderBy("prioridad", "desc")
      .execute();

    if (rules.length === 0) {
      res.json({ ok: true, data: [] });
      return;
    }

    const ruleIds = rules.map((r) => r.id);
    const lines = await db
      .selectFrom("accounting.accounting_rule_lines")
      .selectAll()
      .where("rule_id", "in", ruleIds)
      .execute();

    const linesByRule = new Map<string, typeof lines>();
    for (const line of lines) {
      const existing = linesByRule.get(line.rule_id) ?? [];
      existing.push(line);
      linesByRule.set(line.rule_id, existing);
    }

    const data = rules.map((rule) => ({
      ...rule,
      lines: linesByRule.get(rule.id) ?? [],
    }));

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /cuentas?org_id=&solo_activas=true
 * Lista cuentas del plan de cuentas de una organización.
 */
router.get(
  "/",
  validateQuery(ListCuentasQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, solo_activas } = req.query as z.infer<
        typeof ListCuentasQuerySchema
      >;
      const cuentas = await listCuentasService(org_id, solo_activas === "true");
      res.json({ ok: true, data: cuentas });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /cuentas
 * Crea una cuenta en el plan de cuentas.
 */
router.post("/", validateBody(CreateCuentaSchema), async (req, res, next) => {
  try {
    const cuenta = await createCuentaService(req.body);
    res.status(201).json({ ok: true, data: cuenta });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /cuentas/:id
 * Actualiza una cuenta existente (incluyendo activar/desactivar).
 */
router.put("/:id", validateBody(UpdateCuentaSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const cuenta = await updateCuentaService(id, req.body);
    res.json({ ok: true, data: cuenta });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /cuentas/arbol?org_id=
 * Devuelve el plan de cuentas como árbol jerárquico (padre → hijos).
 * DEBE registrarse antes de /:id para evitar que "arbol" sea tratado como UUID.
 */
router.get(
  "/arbol",
  validateQuery(z.object({ org_id: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id: string };
      const data = await getCuentasArbol(org_id);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /cuentas/:id?org_id=
 * Detalle de una cuenta con su cuenta padre resuelta.
 */
router.get(
  "/:id",
  validateQuery(z.object({ org_id: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id: string };
      const cuenta = await getCuentaById(req.params.id);

      if (!cuenta || cuenta.org_id !== org_id) {
        res.status(404).json({ ok: false, error: "Cuenta no encontrada" });
        return;
      }

      let padre: Awaited<ReturnType<typeof getCuentaById>>;
      if (cuenta.padre_id) {
        padre = await getCuentaById(cuenta.padre_id);
      }

      res.json({ ok: true, data: { ...cuenta, padre: padre ?? null } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /cuentas/:id/estado
 * Activa o desactiva una cuenta.
 * Rechaza si tiene asientos ACTIVO o cuentas hijas activas.
 */
router.patch(
  "/:id/estado",
  validateBody(z.object({ activa: z.boolean() })),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const { activa } = req.body as { activa: boolean };
      const cuenta = await toggleCuentaEstadoService(id, activa);
      res.json({ ok: true, data: cuenta });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
