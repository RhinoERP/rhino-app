// Cargar variables de entorno desde .env en desarrollo
// En producción (Render) las inyecta la plataforma
import "node:process";
import "dotenv/config";

const PORT = process.env.PORT ?? "3001";

import { createApp } from "./index";

const app = createApp();

app.listen(Number(PORT), () => {
  console.log(`[accounting] Servicio contable corriendo en puerto ${PORT}`);
  console.log(`[accounting] NODE_ENV=${process.env.NODE_ENV ?? "development"}`);
});
