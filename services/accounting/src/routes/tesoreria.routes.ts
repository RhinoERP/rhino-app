import { type Router as ExpressRouter, Router } from "express";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  getBankAccountById,
  getIssuedCheckById,
  getReceivedCheckById,
  listBankAccounts,
  listDepositSlips,
  listIssuedChecks,
  listReceivedChecks,
} from "../modules/treasury/treasury.queries";
import {
  createBankAccountService,
  createCashDepositSlipService,
  createCheckDepositSlipService,
  createIssuedCheckService,
  createMovementService,
  createReceivedCheckService,
  debitIssuedCheckService,
  listMovementsService,
  rejectIssuedCheckService,
  rejectReceivedCheckService,
  toggleBankAccountEstadoService,
  updateBankAccountService,
} from "../modules/treasury/treasury.service";
import {
  BankAccountQuerySchema,
  CreateBankAccountSchema,
  CreateBankMovementSchema,
  CreateCashDepositSlipSchema,
  CreateCheckDepositSlipSchema,
  CreateIssuedCheckSchema,
  CreateReceivedCheckSchema,
  DebitIssuedCheckSchema,
  DepositSlipsQuerySchema,
  IssuedChecksQuerySchema,
  MovementsQuerySchema,
  ReceivedChecksQuerySchema,
  RejectIssuedCheckSchema,
  RejectReceivedCheckSchema,
  ToggleBankAccountEstadoSchema,
  UpdateBankAccountSchema,
} from "../schemas/tesoreria.schema";

const router: ExpressRouter = Router();

// ── Cuentas Bancarias ─────────────────────────────────────────────────────────

/**
 * GET /tesoreria/cuentas-bancarias?org_id=&solo_activas=
 */
router.get(
  "/cuentas-bancarias",
  validateQuery(BankAccountQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, solo_activas } = req.query as {
        org_id: string;
        solo_activas?: string;
      };
      const soloActivas = solo_activas === "true" ? true : undefined;
      const data = await listBankAccounts(org_id, soloActivas);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tesoreria/cuentas-bancarias/:id?org_id=
 */
router.get(
  "/cuentas-bancarias/:id",
  validateQuery(BankAccountQuerySchema.pick({ org_id: true })),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id: string };
      const id = req.params.id;
      const data = await getBankAccountById(id, org_id);
      if (!data) {
        res
          .status(404)
          .json({ ok: false, error: "Cuenta bancaria no encontrada" });
        return;
      }
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/cuentas-bancarias
 */
router.post(
  "/cuentas-bancarias",
  validateBody(CreateBankAccountSchema),
  async (req, res, next) => {
    try {
      const data = await createBankAccountService(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /tesoreria/cuentas-bancarias/:id
 */
router.put(
  "/cuentas-bancarias/:id",
  validateBody(UpdateBankAccountSchema),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id?: string };
      if (!org_id) {
        res.status(400).json({ ok: false, error: "org_id es requerido" });
        return;
      }
      const data = await updateBankAccountService(
        req.params.id,
        org_id,
        req.body
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /tesoreria/cuentas-bancarias/:id/estado
 */
router.patch(
  "/cuentas-bancarias/:id/estado",
  validateBody(ToggleBankAccountEstadoSchema),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id?: string };
      if (!org_id) {
        res.status(400).json({ ok: false, error: "org_id es requerido" });
        return;
      }
      const { activa } = req.body as { activa: boolean };
      const data = await toggleBankAccountEstadoService(
        req.params.id,
        org_id,
        activa
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ── Movimientos bancarios ─────────────────────────────────────────────────────

/**
 * GET /tesoreria/movimientos?org_id=&cuenta_id=&desde=&hasta=&tipo=
 */
router.get(
  "/movimientos",
  validateQuery(MovementsQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, cuenta_id, desde, hasta, tipo } = req.query as {
        org_id: string;
        cuenta_id?: string;
        desde?: string;
        hasta?: string;
        tipo?: string;
      };
      const data = await listMovementsService({
        orgId: org_id,
        cuentaId: cuenta_id,
        desde,
        hasta,
        tipo: tipo as Parameters<typeof listMovementsService>[0]["tipo"],
      });
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/movimientos-bancarios
 * Manual bank debit/credit (DEBITO_BANCARIO | CREDITO_BANCARIO)
 */
router.post(
  "/movimientos-bancarios",
  validateBody(CreateBankMovementSchema),
  async (req, res, next) => {
    try {
      const {
        orgId,
        operationId,
        cuentaBancariaId,
        tipo,
        fecha,
        descripcion,
        importe,
        cuentaContrapartidaCode,
        creadoPor,
      } = req.body as {
        orgId: string;
        operationId?: string;
        cuentaBancariaId: string;
        tipo: "DEBITO_BANCARIO" | "CREDITO_BANCARIO";
        fecha: string;
        descripcion: string;
        importe: string;
        cuentaContrapartidaCode: string;
        creadoPor?: string;
      };

      const lado = tipo === "CREDITO_BANCARIO" ? "HABER" : "DEBE";

      const data = await createMovementService({
        orgId,
        operationId,
        cuentaBancariaId,
        tipo,
        fecha,
        descripcion,
        importe,
        lado,
        cuentaContrapartidaCode,
        creadoPor,
      });
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ── Cheques recibidos ─────────────────────────────────────────────────────────

/**
 * GET /tesoreria/cheques/recibidos?org_id=&estado=
 */
router.get(
  "/cheques/recibidos",
  validateQuery(ReceivedChecksQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, estado } = req.query as {
        org_id: string;
        estado?: string;
      };
      const data = await listReceivedChecks(
        org_id,
        estado as Parameters<typeof listReceivedChecks>[1]
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tesoreria/cheques/recibidos/:id?org_id=
 */
router.get(
  "/cheques/recibidos/:id",
  validateQuery(BankAccountQuerySchema.pick({ org_id: true })),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id: string };
      const data = await getReceivedCheckById(req.params.id, org_id);
      if (!data) {
        res.status(404).json({ ok: false, error: "Cheque no encontrado" });
        return;
      }
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/cheques/recibidos
 */
router.post(
  "/cheques/recibidos",
  validateBody(CreateReceivedCheckSchema),
  async (req, res, next) => {
    try {
      const data = await createReceivedCheckService(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /tesoreria/cheques/recibidos/:id/rechazar
 */
router.put(
  "/cheques/recibidos/:id/rechazar",
  validateBody(RejectReceivedCheckSchema),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id?: string };
      if (!org_id) {
        res.status(400).json({ ok: false, error: "org_id es requerido" });
        return;
      }
      const data = await rejectReceivedCheckService(
        req.params.id,
        org_id,
        req.body
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ── Cheques emitidos ──────────────────────────────────────────────────────────

/**
 * GET /tesoreria/cheques/emitidos?org_id=&estado=
 */
router.get(
  "/cheques/emitidos",
  validateQuery(IssuedChecksQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, estado } = req.query as {
        org_id: string;
        estado?: string;
      };
      const data = await listIssuedChecks(org_id, estado);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tesoreria/cheques/emitidos/:id?org_id=
 */
router.get(
  "/cheques/emitidos/:id",
  validateQuery(BankAccountQuerySchema.pick({ org_id: true })),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id: string };
      const data = await getIssuedCheckById(req.params.id, org_id);
      if (!data) {
        res.status(404).json({ ok: false, error: "Cheque no encontrado" });
        return;
      }
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/cheques/emitidos
 */
router.post(
  "/cheques/emitidos",
  validateBody(CreateIssuedCheckSchema),
  async (req, res, next) => {
    try {
      const data = await createIssuedCheckService(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /tesoreria/cheques/emitidos/:id/debitar
 */
router.put(
  "/cheques/emitidos/:id/debitar",
  validateBody(DebitIssuedCheckSchema),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id?: string };
      if (!org_id) {
        res.status(400).json({ ok: false, error: "org_id es requerido" });
        return;
      }
      const { creadoPor } = req.body as { creadoPor?: string };
      const data = await debitIssuedCheckService(
        req.params.id,
        org_id,
        creadoPor
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /tesoreria/cheques/emitidos/:id/rechazar
 */
router.put(
  "/cheques/emitidos/:id/rechazar",
  validateBody(RejectIssuedCheckSchema),
  async (req, res, next) => {
    try {
      const { org_id } = req.query as { org_id?: string };
      if (!org_id) {
        res.status(400).json({ ok: false, error: "org_id es requerido" });
        return;
      }
      const data = await rejectIssuedCheckService(
        req.params.id,
        org_id,
        req.body
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ── Boletas de depósito ───────────────────────────────────────────────────────

/**
 * GET /tesoreria/boletas?org_id=&cuenta_id=
 */
router.get(
  "/boletas",
  validateQuery(DepositSlipsQuerySchema),
  async (req, res, next) => {
    try {
      const { org_id, cuenta_id } = req.query as {
        org_id: string;
        cuenta_id?: string;
      };
      const data = await listDepositSlips(org_id, cuenta_id);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/boletas/deposito-cheques
 */
router.post(
  "/boletas/deposito-cheques",
  validateBody(CreateCheckDepositSlipSchema),
  async (req, res, next) => {
    try {
      const data = await createCheckDepositSlipService(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tesoreria/boletas/deposito-efectivo
 */
router.post(
  "/boletas/deposito-efectivo",
  validateBody(CreateCashDepositSlipSchema),
  async (req, res, next) => {
    try {
      const data = await createCashDepositSlipService(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
