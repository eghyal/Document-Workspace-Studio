import { z } from "zod";
import { OFFICIAL_DEPARTMENTS, OFFICIAL_ROLES } from "../constants/rbac";

export const InlineRunSchema = z.object({
  text: z.string().max(10000),
  isBold: z.boolean().optional(),
  isItalic: z.boolean().optional(),
  isUnderline: z.boolean().optional(),
  isStrikethrough: z.boolean().optional(),
  textColor: z.string().max(32).optional(),
  highlightColor: z.string().max(32).optional(),
});

export const DocBlockSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum([
    "letterhead",
    "heading",
    "paragraph",
    "callout",
    "list",
    "table",
    "metadata",
    "address",
    "signature",
  ]),
  category: z.string().max(64).optional(),
  title: z.string().max(500).optional(),
  subtitle: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  runs: z.array(InlineRunSchema).max(500).optional(),
  isBold: z.boolean().optional(),
  isItalic: z.boolean().optional(),
  isUnderline: z.boolean().optional(),
  isStrikethrough: z.boolean().optional(),
  textColor: z.string().max(32).optional(),
  highlightColor: z.string().max(32).optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  fontSize: z.number().min(6).max(120).optional(),
  listItems: z.array(z.string().max(2000)).max(200).optional(),
  addressData: z
    .object({
      recipientName: z.string().max(255),
      companyName: z.string().max(255),
      addressLine1: z.string().max(500),
      cityPostal: z.string().max(255),
    })
    .optional(),
  tableData: z
    .object({
      headers: z.array(z.string().max(500)).max(30),
      rows: z.array(z.array(z.string().max(2000)).max(30)).max(200),
    })
    .optional(),
  metaData: z
    .object({
      docNumber: z.string().max(128).optional(),
      date: z.string().max(64).optional(),
      subject: z.string().max(500).optional(),
      priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
    })
    .optional(),
  x: z.number().min(0).max(5000).optional(),
  y: z.number().min(0).max(10000).optional(),
  width: z.number().min(20).max(5000).optional(),
  height: z.number().min(10).max(5000).optional(),
  locked: z.boolean().optional(),
  targetDepartment: z.enum(OFFICIAL_DEPARTMENTS).optional(),
  targetRole: z.enum(OFFICIAL_ROLES).optional(),
  signatoryTitle: z.string().max(255).optional(),
  signatoryName: z.string().max(255).optional(),
});

export const CreateWorkspaceDocumentSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(255),
  document_type: z.string().trim().min(2).max(64).default("GENERAL_DOCUMENT"),
  department: z.enum(OFFICIAL_DEPARTMENTS),
  layout_preset: z.enum(["A4_PORTRAIT", "A4_LANDSCAPE", "EXECUTIVE_MEMO"]).default("A4_PORTRAIT"),
  content_format: z.enum(["LEGACY_BLOCKS", "DOCX"]).default("LEGACY_BLOCKS"),
  content: z.array(DocBlockSchema).min(1, "Dokumen harus memiliki minimal 1 blok").max(300),
  authorization_department: z.enum(OFFICIAL_DEPARTMENTS).nullable().optional(),
  authorization_role: z.enum(OFFICIAL_ROLES).nullable().optional(),
});

// P0-01 FIX: 'status' sengaja TIDAK dimasukkan ke dalam schema update umum!
export const UpdateWorkspaceDocumentSchema = z
  .object({
    title: z.string().trim().min(3).max(255).optional(),
    document_type: z.string().trim().min(2).max(64).optional(),
    department: z.enum(OFFICIAL_DEPARTMENTS).optional(),
    layout_preset: z.enum(["A4_PORTRAIT", "A4_LANDSCAPE", "EXECUTIVE_MEMO"]).optional(),
    content: z.array(DocBlockSchema).min(1).max(300).optional(),
    authorization_department: z.enum(OFFICIAL_DEPARTMENTS).nullable().optional(),
    authorization_role: z.enum(OFFICIAL_ROLES).nullable().optional(),
    expected_version: z.number().int().positive().optional(),
    change_summary: z.string().max(500).optional(),
  })
  .strict();

export const SubmitWorkspaceDocumentSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  layout_preset: z.enum(["A4_PORTRAIT", "A4_LANDSCAPE", "EXECUTIVE_MEMO"]).optional(),
  content: z.array(DocBlockSchema).min(1).max(300),
  authorization_department: z.enum(OFFICIAL_DEPARTMENTS).optional(),
  authorization_role: z.enum(OFFICIAL_ROLES).optional(),
  expected_version: z.number().int().positive().optional(),
  idempotency_key: z.string().max(128).optional(),
  note: z.string().max(1000).optional(),
});

export const ApproveDocumentSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const ReviseDocumentSchema = z.object({
  revision_note: z.string().trim().min(5, "Catatan revisi wajib diisi minimal 5 karakter").max(2000),
});
