import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import {
  CreateWorkspaceDocumentSchema,
  UpdateWorkspaceDocumentSchema,
  SubmitWorkspaceDocumentSchema,
  ApproveDocumentSchema,
  ReviseDocumentSchema,
} from "../validation/workspaceSchema";
import {
  canUserApproveDepartment,
  normalizeDepartment,
  OFFICIAL_DEPARTMENTS,
  OfficialDepartment,
  OfficialRole,
} from "../constants/rbac";
import { DocBlock, WorkspaceDocument } from "../types/workspace";
import { createOnlyOfficeSession, verifyOnlyOfficeToken } from "../services/onlyofficeService";

export function createWorkspaceDocumentsRouter(db: Database.Database): Router {
  const router = Router();

  function computeContentHash(contentJson: string): string {
    return crypto.createHash("sha256").update(contentJson).digest("hex");
  }

  function extractSignatureRouting(blocks: DocBlock[]): {
    department: OfficialDepartment | null;
    role: OfficialRole | null;
  } {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type === "signature" && b.targetDepartment) {
        const normDept = normalizeDepartment(b.targetDepartment);
        const role = (b.targetRole || `${normDept}_HEAD`) as OfficialRole;
        return { department: normDept, role };
      }
    }
    return { department: null, role: null };
  }

  /**
   * P0-05 FIX: Penomoran dokumen menggunakan tabel sequence atomik per periode YYYYMM,
   * bukan SELECT COUNT(*) + 1 yang rentan collision saat ada dokumen dihapus.
   */
  function generateAtomicDocumentCode(department: OfficialDepartment, nowIso: string): string {
    const yearMonth = nowIso.slice(0, 7).replace("-", "");
    const scope = `DOC-${department}-${yearMonth}`;

    db.prepare(
      `INSERT INTO document_sequences (scope, next_value, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(scope) DO NOTHING`
    ).run(scope, nowIso);

    const row = db
      .prepare(`SELECT next_value FROM document_sequences WHERE scope = ?`)
      .get(scope) as { next_value: number };

    const seqNum = row.next_value;
    db.prepare(
      `UPDATE document_sequences SET next_value = next_value + 1, updated_at = ? WHERE scope = ?`
    ).run(nowIso, scope);

    return `DOC-${department}-${yearMonth}-${String(seqNum).padStart(4, "0")}`;
  }

  function enqueueOutbox(
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    nowIso: string,
    idempotencyKey?: string
  ) {
    db.prepare(
      `INSERT INTO transactional_outbox (id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, processed, created_at)
       VALUES (?, 'WORKSPACE_DOCUMENT', ?, ?, ?, ?, 0, ?)`
    ).run(
      crypto.randomUUID(),
      aggregateId,
      eventType,
      JSON.stringify(payload),
      idempotencyKey || null,
      nowIso
    );
  }

  function recordAuditEvent(params: {
    documentId: string;
    actorId: string;
    actorUsername: string;
    actorRole: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    note?: string | null;
    nowIso: string;
  }) {
    db.prepare(
      `INSERT INTO workspace_document_events
       (id, document_id, actor_user_id, actor_username, actor_role, event_type, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.documentId,
      params.actorId,
      params.actorUsername,
      params.actorRole,
      params.eventType,
      params.fromStatus,
      params.toStatus,
      params.note || null,
      params.nowIso
    );
  }

  function canReadDocument(user: NonNullable<Request["user"]>, doc: any): boolean {
    if (user.role === "FC" || user.role === "ADMIN") return true;
    if (doc.created_by_user_id === user.id) return true;
    if (doc.department === user.department) return true;
    if (
      doc.authorization_department &&
      canUserApproveDepartment(
        user.role,
        user.department,
        doc.authorization_department,
        doc.authorization_role
      )
    ) {
      return true;
    }
    return false;
  }

  // P1-06 FIX: List endpoint menggunakan pagination, scoping ACL, dan projection metadata ringan (tanpa mem-bundle seluruh content JSON).
  router.get("/", (req: Request, res: Response) => {
    const user = req.user!;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status ? String(req.query.status) : null;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (user.role !== "FC" && user.role !== "ADMIN") {
      whereClause +=
        " AND (created_by_user_id = ? OR department = ? OR authorization_department = ?)";
      params.push(user.id, user.department, user.department);
    }

    if (statusFilter) {
      whereClause += " AND status = ?";
      params.push(statusFilter);
    }

    const totalRow = db
      .prepare(`SELECT COUNT(*) as total FROM workspace_documents ${whereClause}`)
      .get(...params) as { total: number };

    const rows = db
      .prepare(
        `SELECT
          id, document_code, title, document_type, department, status,
          layout_preset, content_format, current_version,
          created_by_user_id, created_by_username,
          authorization_department, authorization_role,
          approved_by_user_id, approved_by_username, approved_by_role, approved_at,
          revision_note, locked_by_user_id, locked_at, lock_expires_at,
          content_hash, created_at, updated_at
         FROM workspace_documents
         ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    return res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / limit),
      },
    });
  });

  // Detail endpoint dengan ACL & histori
  router.get("/:id", (req: Request, res: Response) => {
    const user = req.user!;
    const row = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!row) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (!canReadDocument(user, row)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Anda tidak memiliki akses ke dokumen ini.",
      });
    }

    const events = db
      .prepare(
        `SELECT * FROM workspace_document_events WHERE document_id = ? ORDER BY created_at DESC`
      )
      .all(row.id);

    const versions = db
      .prepare(
        `SELECT id, document_id, version, content_format, file_hash, file_size, created_by_user_id, created_at, change_summary
         FROM workspace_document_versions WHERE document_id = ? ORDER BY version DESC`
      )
      .all(row.id);

    return res.json({
      ...row,
      content: JSON.parse(row.content),
      events,
      versions,
    });
  });

  // Create Document (dengan Zod Validation P0-06, Verified Identity P0-03, Atomic Sequence P0-05, Transactional Outbox P1-05)
  router.post("/", (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = CreateWorkspaceDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Payload dokumen tidak valid.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const payload = parsed.data;
    const nowIso = new Date().toISOString();
    const docId = crypto.randomUUID();
    const contentJson = JSON.stringify(payload.content);
    const contentHash = computeContentHash(contentJson);
    const inferredRouting = extractSignatureRouting(payload.content);
    const authDept = payload.authorization_department ?? inferredRouting.department;
    const authRole = payload.authorization_role ?? inferredRouting.role;

    const createTx = db.transaction(() => {
      const docCode = generateAtomicDocumentCode(payload.department, nowIso);

      db.prepare(
        `INSERT INTO workspace_documents (
          id, document_code, title, document_type, department, status,
          layout_preset, content_format, current_version, content,
          created_by_user_id, created_by_username,
          authorization_department, authorization_role,
          content_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        docId,
        docCode,
        payload.title,
        payload.document_type,
        payload.department,
        payload.layout_preset,
        payload.content_format,
        contentJson,
        user.id,
        user.username,
        authDept,
        authRole,
        contentHash,
        nowIso,
        nowIso
      );

      db.prepare(
        `INSERT INTO workspace_document_versions (
          id, document_id, version, content_format, content_json, file_hash, file_size, created_by_user_id, created_at, change_summary
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        docId,
        payload.content_format,
        contentJson,
        contentHash,
        Buffer.byteLength(contentJson, "utf8"),
        user.id,
        nowIso,
        "Initial draft creation"
      );

      recordAuditEvent({
        documentId: docId,
        actorId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        note: "Dokumen dibuat sebagai DRAFT",
        nowIso,
      });

      enqueueOutbox(
        docId,
        "DOCUMENT_CREATED",
        { id: docId, document_code: docCode, status: "DRAFT", created_by: user.id },
        nowIso
      );

      return db.prepare(`SELECT * FROM workspace_documents WHERE id = ?`).get(docId) as any;
    });

    const created = createTx();
    return res.status(201).json({
      ...created,
      content: JSON.parse(created.content),
    });
  });

  // Update Document (P0-01: Tidak menerima perubahan status! P0-07: Menolak perubahan pada dokumen APPROVED/PENDING)
  router.put("/:id", (req: Request, res: Response) => {
    const user = req.user!;

    if ("status" in (req.body || {})) {
      return res.status(400).json({
        error: "STATUS_MUTATION_FORBIDDEN",
        message:
          "Perubahan status tidak diizinkan melalui endpoint PUT. Gunakan endpoint transisi resmi (/submit, /approve, /revise).",
      });
    }

    const parsed = UpdateWorkspaceDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Payload update dokumen tidak valid.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    // P0-07 FIX: Dokumen APPROVED dan ARCHIVED bersifat immutable; dokumen PENDING_APPROVAL terkunci.
    if (existing.status === "APPROVED" || existing.status === "ARCHIVED") {
      return res.status(409).json({
        error: "DOCUMENT_IMMUTABLE",
        message: `Dokumen berstatus ${existing.status} bersifat permanen (immutable) dan tidak dapat diubah.`,
      });
    }

    if (existing.status === "PENDING_APPROVAL") {
      return res.status(409).json({
        error: "DOCUMENT_LOCKED_FOR_APPROVAL",
        message: "Dokumen sedang menunggu approval dan tidak dapat diedit.",
      });
    }

    if (existing.created_by_user_id !== user.id && user.role !== "ADMIN" && user.role !== "FC") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Hanya pembuat dokumen yang dapat mengubah draft ini.",
      });
    }

    const payload = parsed.data;

    // P1-04 FIX: Optimistic Concurrency Control
    if (
      payload.expected_version !== undefined &&
      payload.expected_version !== existing.current_version
    ) {
      return res.status(409).json({
        error: "VERSION_CONFLICT",
        message: `Konflik versi: versi server adalah ${existing.current_version}, sedangkan versi Anda ${payload.expected_version}.`,
      });
    }

    const nowIso = new Date().toISOString();
    const nextBlocks: DocBlock[] = payload.content ?? JSON.parse(existing.content);
    const contentJson = JSON.stringify(nextBlocks);
    const contentHash = computeContentHash(contentJson);
    const inferredRouting = extractSignatureRouting(nextBlocks);

    const nextAuthDept =
      payload.authorization_department !== undefined
        ? payload.authorization_department
        : inferredRouting.department ?? existing.authorization_department;

    const nextAuthRole =
      payload.authorization_role !== undefined
        ? payload.authorization_role
        : inferredRouting.role ?? existing.authorization_role;

    const nextVersion = existing.current_version + 1;

    const updateTx = db.transaction(() => {
      db.prepare(
        `UPDATE workspace_documents SET
          title = COALESCE(?, title),
          document_type = COALESCE(?, document_type),
          department = COALESCE(?, department),
          layout_preset = COALESCE(?, layout_preset),
          content = ?,
          content_hash = ?,
          authorization_department = ?,
          authorization_role = ?,
          current_version = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(
        payload.title ?? null,
        payload.document_type ?? null,
        payload.department ?? null,
        payload.layout_preset ?? null,
        contentJson,
        contentHash,
        nextAuthDept,
        nextAuthRole,
        nextVersion,
        nowIso,
        existing.id
      );

      db.prepare(
        `INSERT INTO workspace_document_versions (
          id, document_id, version, content_format, content_json, file_hash, file_size, created_by_user_id, created_at, change_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        existing.id,
        nextVersion,
        existing.content_format,
        contentJson,
        contentHash,
        Buffer.byteLength(contentJson, "utf8"),
        user.id,
        nowIso,
        payload.change_summary || `Saved version ${nextVersion}`
      );

      recordAuditEvent({
        documentId: existing.id,
        actorId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        eventType: "UPDATED",
        fromStatus: existing.status,
        toStatus: existing.status,
        note: payload.change_summary || `Draft disimpan (v${nextVersion})`,
        nowIso,
      });

      enqueueOutbox(
        existing.id,
        "DOCUMENT_UPDATED",
        { id: existing.id, version: nextVersion, updated_by: user.id },
        nowIso
      );

      return db.prepare(`SELECT * FROM workspace_documents WHERE id = ?`).get(existing.id) as any;
    });

    const updated = updateTx();
    return res.json({
      ...updated,
      content: JSON.parse(updated.content),
    });
  });

  // P0-04 FIX: Satu endpoint atomik untuk menyimpan perubahan akhir sekaligus transisi ke PENDING_APPROVAL
  router.post("/:id/submit", (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = SubmitWorkspaceDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Payload submit approval tidak valid.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (existing.created_by_user_id !== user.id && user.role !== "ADMIN" && user.role !== "FC") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Hanya pembuat dokumen yang dapat mengajukan approval.",
      });
    }

    if (existing.status !== "DRAFT" && existing.status !== "REVISION_REQUIRED") {
      return res.status(409).json({
        error: "INVALID_STATE_TRANSITION",
        message: `Dokumen berstatus ${existing.status} tidak dapat diajukan approval.`,
      });
    }

    const payload = parsed.data;
    if (
      payload.expected_version !== undefined &&
      payload.expected_version !== existing.current_version
    ) {
      return res.status(409).json({
        error: "VERSION_CONFLICT",
        message: "Versi dokumen tidak sinkron dengan server.",
      });
    }

    const inferredRouting = extractSignatureRouting(payload.content);
    const targetDept =
      payload.authorization_department ||
      inferredRouting.department ||
      existing.authorization_department;
    const targetRole =
      payload.authorization_role ||
      inferredRouting.role ||
      existing.authorization_role ||
      (targetDept ? (`${targetDept}_HEAD` as OfficialRole) : null);

    if (!targetDept || !OFFICIAL_DEPARTMENTS.includes(targetDept)) {
      return res.status(400).json({
        error: "MISSING_TARGET_DEPARTMENT",
        message:
          "Dokumen wajib memiliki target departemen otorisasi (melalui blok tanda tangan atau pemilihan routing).",
      });
    }

    const nowIso = new Date().toISOString();
    const contentJson = JSON.stringify(payload.content);
    const contentHash = computeContentHash(contentJson);
    const nextVersion = existing.current_version + 1;

    const submitTx = db.transaction(() => {
      db.prepare(
        `UPDATE workspace_documents SET
          title = COALESCE(?, title),
          layout_preset = COALESCE(?, layout_preset),
          content = ?,
          content_hash = ?,
          status = 'PENDING_APPROVAL',
          authorization_department = ?,
          authorization_role = ?,
          current_version = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(
        payload.title ?? null,
        payload.layout_preset ?? null,
        contentJson,
        contentHash,
        targetDept,
        targetRole,
        nextVersion,
        nowIso,
        existing.id
      );

      db.prepare(
        `INSERT INTO workspace_document_versions (
          id, document_id, version, content_format, content_json, file_hash, file_size, created_by_user_id, created_at, change_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        existing.id,
        nextVersion,
        existing.content_format,
        contentJson,
        contentHash,
        Buffer.byteLength(contentJson, "utf8"),
        user.id,
        nowIso,
        payload.note || "Submitted for approval"
      );

      recordAuditEvent({
        documentId: existing.id,
        actorId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        eventType: "SUBMITTED_FOR_APPROVAL",
        fromStatus: existing.status,
        toStatus: "PENDING_APPROVAL",
        note: payload.note || `Diajukan ke departemen ${targetDept} (${targetRole})`,
        nowIso,
      });

      enqueueOutbox(
        existing.id,
        "DOCUMENT_SUBMITTED",
        {
          id: existing.id,
          document_code: existing.document_code,
          target_department: targetDept,
          target_role: targetRole,
          submitted_by: user.id,
        },
        nowIso,
        payload.idempotency_key
      );

      return db.prepare(`SELECT * FROM workspace_documents WHERE id = ?`).get(existing.id) as any;
    });

    const submitted = submitTx();
    return res.json({
      ...submitted,
      content: JSON.parse(submitted.content),
    });
  });

  // P0-02 & P0-03 FIX: Endpoint Approve menegakkan RBAC, Target Department, State Guard, dan Identitas JWT
  router.post("/:id/approve", (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = ApproveDocumentSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(409).json({
        error: "INVALID_STATE_TRANSITION",
        message: `Hanya dokumen berstatus PENDING_APPROVAL yang dapat disetujui (status saat ini: ${existing.status}).`,
      });
    }

    if (
      !canUserApproveDepartment(
        user.role,
        user.department,
        existing.authorization_department,
        existing.authorization_role
      )
    ) {
      return res.status(403).json({
        error: "RBAC_APPROVAL_DENIED",
        message: `Role ${user.role} (Dept: ${user.department}) tidak berwenang menyetujui dokumen untuk departemen ${existing.authorization_department}.`,
      });
    }

    const nowIso = new Date().toISOString();

    const approveTx = db.transaction(() => {
      db.prepare(
        `UPDATE workspace_documents SET
          status = 'APPROVED',
          approved_by_user_id = ?,
          approved_by_username = ?,
          approved_by_role = ?,
          approved_at = ?,
          locked_by_user_id = NULL,
          locked_at = NULL,
          lock_expires_at = NULL,
          updated_at = ?
         WHERE id = ?`
      ).run(user.id, user.username, user.role, nowIso, nowIso, existing.id);

      recordAuditEvent({
        documentId: existing.id,
        actorId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        eventType: "APPROVED",
        fromStatus: "PENDING_APPROVAL",
        toStatus: "APPROVED",
        note: parsed.data.note || "Disetujui secara resmi",
        nowIso,
      });

      enqueueOutbox(
        existing.id,
        "DOCUMENT_APPROVED",
        {
          id: existing.id,
          document_code: existing.document_code,
          approved_by_user_id: user.id,
          approved_by_username: user.username,
          approved_by_role: user.role,
          content_hash: existing.content_hash,
        },
        nowIso
      );

      return db.prepare(`SELECT * FROM workspace_documents WHERE id = ?`).get(existing.id) as any;
    });

    const approved = approveTx();
    return res.json({
      ...approved,
      content: JSON.parse(approved.content),
    });
  });

  // Endpoint Revise dengan RBAC & catatan wajib
  router.post("/:id/revise", (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = ReviseDocumentSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Catatan revisi wajib diisi.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(409).json({
        error: "INVALID_STATE_TRANSITION",
        message: "Hanya dokumen berstatus PENDING_APPROVAL yang dapat diminta revisi.",
      });
    }

    if (
      !canUserApproveDepartment(
        user.role,
        user.department,
        existing.authorization_department,
        existing.authorization_role
      )
    ) {
      return res.status(403).json({
        error: "RBAC_REVISION_DENIED",
        message: `Role ${user.role} tidak memiliki otoritas revisi untuk departemen ${existing.authorization_department}.`,
      });
    }

    const nowIso = new Date().toISOString();

    const reviseTx = db.transaction(() => {
      db.prepare(
        `UPDATE workspace_documents SET
          status = 'REVISION_REQUIRED',
          revision_note = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(parsed.data.revision_note, nowIso, existing.id);

      recordAuditEvent({
        documentId: existing.id,
        actorId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        eventType: "REVISION_REQUESTED",
        fromStatus: "PENDING_APPROVAL",
        toStatus: "REVISION_REQUIRED",
        note: parsed.data.revision_note,
        nowIso,
      });

      enqueueOutbox(
        existing.id,
        "DOCUMENT_REVISION_REQUIRED",
        {
          id: existing.id,
          revision_note: parsed.data.revision_note,
          requested_by: user.id,
        },
        nowIso
      );

      return db.prepare(`SELECT * FROM workspace_documents WHERE id = ?`).get(existing.id) as any;
    });

    const revised = reviseTx();
    return res.json({
      ...revised,
      content: JSON.parse(revised.content),
    });
  });

  // Delete dengan guard status dan kepemilikan
  router.delete("/:id", (req: Request, res: Response) => {
    const user = req.user!;
    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (existing.status === "APPROVED") {
      return res.status(409).json({
        error: "DOCUMENT_IMMUTABLE",
        message: "Dokumen yang sudah APPROVED tidak boleh dihapus.",
      });
    }

    if (existing.created_by_user_id !== user.id && user.role !== "ADMIN" && user.role !== "FC") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Anda tidak berhak menghapus dokumen ini.",
      });
    }

    db.prepare(`DELETE FROM workspace_documents WHERE id = ?`).run(existing.id);
    return res.json({ deleted: true, id: existing.id });
  });

  // Solusi Konvergen Opsi E: OnlyOffice Editor Session & Callback
  router.post("/:id/editor-session", (req: Request, res: Response) => {
    const user = req.user!;
    const existing = db
      .prepare(`SELECT * FROM workspace_documents WHERE id = ?`)
      .get(req.params.id) as any;

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
    }

    if (!canReadDocument(user, existing)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Akses ditolak." });
    }

    const doc: WorkspaceDocument = {
      ...existing,
      content: JSON.parse(existing.content),
    };

    const erpBaseUrl = `${req.protocol}://${req.get("host")}`;
    const session = createOnlyOfficeSession(doc, user, erpBaseUrl);
    return res.json(session);
  });

  router.post("/:id/onlyoffice-callback", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.token;
    const rawToken =
      bodyToken ||
      (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);

    if (!rawToken) {
      return res.status(401).json({ error: 1, message: "Missing OnlyOffice signature token" });
    }

    try {
      verifyOnlyOfficeToken(rawToken);
      return res.json({ error: 0 });
    } catch {
      return res.status(403).json({ error: 1, message: "Invalid OnlyOffice signature token" });
    }
  });

  return router;
}
