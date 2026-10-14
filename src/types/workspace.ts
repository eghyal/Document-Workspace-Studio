import { OfficialDepartment, OfficialRole } from "../constants/rbac";

export type DocumentStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REVISION_REQUIRED"
  | "ARCHIVED";

export type LayoutPreset = "A4_PORTRAIT" | "A4_LANDSCAPE" | "EXECUTIVE_MEMO";

export type ContentFormat = "LEGACY_BLOCKS" | "DOCX";

export type BlockType =
  | "letterhead"
  | "heading"
  | "paragraph"
  | "callout"
  | "list"
  | "table"
  | "metadata"
  | "address"
  | "signature";

export interface InlineRun {
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  textColor?: string;
  highlightColor?: string;
}

export interface DocBlock {
  id: string;
  type: BlockType;
  category?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  runs?: InlineRun[];
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  textColor?: string;
  highlightColor?: string;
  align?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  fontSize?: number;
  listItems?: string[];
  addressData?: {
    recipientName: string;
    companyName: string;
    addressLine1: string;
    cityPostal: string;
  };
  tableData?: {
    headers: string[];
    rows: string[][];
  };
  metaData?: {
    docNumber?: string;
    date?: string;
    subject?: string;
    priority?: "NORMAL" | "HIGH" | "URGENT";
  };
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  locked?: boolean;
  targetDepartment?: OfficialDepartment;
  targetRole?: OfficialRole;
  signatoryTitle?: string;
  signatoryName?: string;
}

export interface WorkspaceDocument {
  id: string;
  document_code: string;
  title: string;
  document_type: string;
  department: OfficialDepartment;
  status: DocumentStatus;
  layout_preset: LayoutPreset;
  content_format: ContentFormat;
  current_version: number;
  content: DocBlock[];
  created_by_user_id: string;
  created_by_username: string;
  authorization_department: OfficialDepartment | null;
  authorization_role: OfficialRole | null;
  approved_by_user_id: string | null;
  approved_by_username: string | null;
  approved_by_role: OfficialRole | null;
  approved_at: string | null;
  revision_note: string | null;
  locked_by_user_id: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content_format: ContentFormat;
  file_path: string | null;
  content_json: string | null;
  file_hash: string;
  file_size: number;
  created_by_user_id: string;
  created_at: string;
  change_summary: string | null;
}

export interface WorkspaceDocumentEvent {
  id: string;
  document_id: string;
  actor_user_id: string;
  actor_username: string;
  actor_role: string;
  event_type: string;
  from_status: DocumentStatus | null;
  to_status: DocumentStatus | null;
  note: string | null;
  created_at: string;
}
