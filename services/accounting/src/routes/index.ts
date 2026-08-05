import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import asientosRouter from "./asientos.routes";
import cuentasRouter from "./cuentas.routes";
import eventosRouter from "./eventos.routes";
import informalEntriesRouter from "./informal-entries.routes";
import librosRouter from "./libros.routes";
import tesoreriaRouter from "./tesoreria.routes";

const router: ReturnType<typeof Router> = Router();

// Health check — sin autenticación, usado por UptimeRobot para evitar cold start
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "accounting", ts: new Date().toISOString() });
});

// Todos los endpoints de negocio requieren autenticación
router.use(authMiddleware);

// Rutas implementadas en Semana 1
router.use("/cuentas", cuentasRouter);

// Rutas implementadas en Semana 2
router.use("/", eventosRouter); // POST /preview  POST /eventos
router.use("/asientos", asientosRouter); // GET /asientos/:id  PUT /asientos/:id/completar

// Rutas implementadas en Semana 3
router.use("/", librosRouter); // GET /diario  /mayor/:id  /libros/iva  /libros/iibb

// Rutas de asientos informales (Fase A)
router.use("/", informalEntriesRouter); // POST /eventos/informal  POST /informal-entries/:id/formalizar  GET /informal-entries

// Módulo de Tesorería
router.use("/tesoreria", tesoreriaRouter);

export default router;
