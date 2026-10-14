import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { initWorkspaceSchema } from "./src/db/schema";
import { populateUserSession } from "./src/middleware/auth";
import { createWorkspaceDocumentsRouter } from "./src/routes/workspace_documents";

export function createApp(dbPath = ":memory:") {
  const db = new Database(dbPath);
  initWorkspaceSchema(db);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "fhtbs-erp-workspace-studio" });
  });

  // Semua endpoint /api/workspace-documents wajib melewati JWT verification
  app.use("/api/workspace-documents", populateUserSession, createWorkspaceDocumentsRouter(db));

  return { app, db };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3001);
  const { app } = createApp(process.env.SQLITE_PATH || "fhtbs_erp.sqlite");
  app.listen(port, () => {
    console.log(`[FHTBS-ERP] Hardened Workspace Server listening on http://localhost:${port}`);
  });
}
