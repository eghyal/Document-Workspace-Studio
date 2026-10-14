import crypto from "crypto";
import jwt from "jsonwebtoken";
import { WorkspaceDocument } from "../types/workspace";
import { AuthenticatedUser } from "../middleware/auth";

const ONLYOFFICE_JWT_SECRET =
  process.env.ONLYOFFICE_JWT_SECRET || "onlyoffice-self-hosted-secret-2026";
const ONLYOFFICE_SERVER_URL =
  process.env.ONLYOFFICE_SERVER_URL || "http://localhost:8080";

export interface OnlyOfficeEditorSession {
  documentServerUrl: string;
  config: Record<string, unknown>;
  token: string;
}

/**
 * Membangun konfigurasi embed OnlyOffice Document Server (Solusi Konvergen Opsi E)
 * di mana ERP memegang kendali penuh atas RBAC, status workflow, dan callback.
 */
export function createOnlyOfficeSession(
  doc: WorkspaceDocument,
  user: AuthenticatedUser,
  erpBaseUrl: string
): OnlyOfficeEditorSession {
  const isOwner = doc.created_by_user_id === user.id;
  const isEditableStatus =
    doc.status === "DRAFT" || doc.status === "REVISION_REQUIRED";
  const canEdit = isOwner && isEditableStatus;
  const canComment = doc.status === "PENDING_APPROVAL";

  const documentKey = crypto
    .createHash("sha256")
    .update(`${doc.id}:v${doc.current_version}:${doc.updated_at}`)
    .digest("hex")
    .slice(0, 32);

  const fileAccessToken = jwt.sign(
    { docId: doc.id, userId: user.id, version: doc.current_version, scope: "file_download" },
    ONLYOFFICE_JWT_SECRET,
    { expiresIn: "1h" }
  );

  const config = {
    documentType: "word",
    document: {
      fileType: "docx",
      key: documentKey,
      title: `${doc.document_code} - ${doc.title}.docx`,
      url: `${erpBaseUrl}/api/workspace-documents/${doc.id}/file?token=${encodeURIComponent(fileAccessToken)}`,
      permissions: {
        edit: canEdit,
        comment: canComment || canEdit,
        review: canComment,
        download: true,
        print: true,
        fillForms: canEdit,
      },
    },
    editorConfig: {
      mode: canEdit || canComment ? "edit" : "view",
      callbackUrl: `${erpBaseUrl}/api/workspace-documents/${doc.id}/onlyoffice-callback`,
      lang: "id",
      user: {
        id: user.id,
        name: `${user.username} (${user.role})`,
        group: user.department,
      },
      customization: {
        autosave: true,
        forcesave: true,
        comments: true,
        compactHeader: false,
      },
    },
  };

  const token = jwt.sign(config, ONLYOFFICE_JWT_SECRET, { expiresIn: "2h" });

  return {
    documentServerUrl: ONLYOFFICE_SERVER_URL,
    config: { ...config, token },
    token,
  };
}

export function verifyOnlyOfficeToken(token: string): Record<string, any> {
  return jwt.verify(token, ONLYOFFICE_JWT_SECRET) as Record<string, any>;
}
