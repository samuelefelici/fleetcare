/**
 * Il processo del container finché l'applicazione web non c'è: risponde
 * all'healthcheck di Coolify con l'autocontrollo (selfcheck.ts) eseguito
 * con la connessione dell'app. Quando arriverà apps/web, il suo
 * `/api/health` userà lo stesso `selfCheck` e questo file sparirà;
 * prepare.ts resta il primo passo dell'avvio.
 *
 *   GET /health  →  200 {"ok":true} oppure 503 {"ok":false,"failing":[…]}
 *
 * Fuori va solo l'esito e il nome dei controlli che non passano; il
 * dettaglio (nome del database, utenza, tabelle) va nei log, quando
 * l'esito cambia.
 *
 * Su SIGTERM (Coolify che sostituisce il container) chiude il server e la
 * connessione ed esce.
 *
 *   node --import tsx src/ops/server.ts
 */
import { createServer } from "node:http";
import postgres from "postgres";
import { describeSelfCheck, selfCheck } from "./selfcheck";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[fleetcare] DATABASE_URL mancante");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);

const sql = postgres(url, { max: 1, idle_timeout: 30, onnotice: () => {} });
let lastOk: boolean | null = null;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const result = await selfCheck(sql);
    if (result.ok !== lastOk) {
      lastOk = result.ok;
      console.log(
        `[fleetcare] autocontrollo ${result.ok ? "ok" : "NON superato"}:\n${describeSelfCheck(result)}`,
      );
    }
    res.writeHead(result.ok ? 200 : 503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(
      JSON.stringify(
        result.ok
          ? { ok: true }
          : { ok: false, failing: result.checks.filter((c) => !c.ok).map((c) => c.name) },
      ),
    );
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("FleetCare: il database è pronto, l'applicazione non è ancora pubblicata.\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[fleetcare] in ascolto sulla porta ${port} (GET /health)`);
});

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[fleetcare] ${signal}: chiudo`);
    server.close(() => {
      void sql.end({ timeout: 5 }).then(() => process.exit(0));
    });
    // le connessioni keep-alive non tengono in vita il processo oltre il necessario
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
