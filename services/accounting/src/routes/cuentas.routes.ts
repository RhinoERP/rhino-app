import { type Router as ExpressRouter, Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  createCuentaService,
  listCuentasService,
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

export default router;
