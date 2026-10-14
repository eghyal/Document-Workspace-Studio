import Database from "better-sqlite3";

export function initWorkspaceSchema(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS document_sequences (
      scope TEXT PRIMARY KEY,
      next_value INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_documents (
      id TEXT PRIMARY KEY,
      document_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      document_type TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REVISION_REQUIRED','ARCHIVED')),
      layout_preset TEXT NOT NULL DEFAULT 'A4_PORTRAIT',
      content_format TEXT NOT NULL DEFAULT 'LEGACY_BLOCKS',
      current_version INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_by_username TEXT NOT NULL,
      authorization_department TEXT,
      authorization_role TEXT,
      approved_by_user_id TEXT,
      approved_by_username TEXT,
      approved_by_role TEXT,
      approved_at TEXT,
      revision_note TEXT,
      locked_by_user_id TEXT,
      locked_at TEXT,
      lock_expires_at TEXT,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content_format TEXT NOT NULL DEFAULT 'LEGACY_BLOCKS',
      file_path TEXT,
      content_json TEXT,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      change_summary TEXT,
      UNIQUE(document_id, version),
      FOREIGN KEY(document_id) REFERENCES workspace_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_document_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES workspace_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactional_outbox (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}
