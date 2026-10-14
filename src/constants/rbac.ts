export const OFFICIAL_DEPARTMENTS = [
  "SALES",
  "PURCHASING",
  "ENGINEERING",
  "PRODUCTION",
  "QC",
  "LOGISTICS",
  "FINANCE",
  "HR_GA",
  "FC",
] as const;

export type OfficialDepartment = (typeof OFFICIAL_DEPARTMENTS)[number];

export const OFFICIAL_ROLES = [
  "SALES",
  "SALES_HEAD",
  "PURCHASING",
  "PURCHASING_HEAD",
  "ENGINEERING",
  "ENGINEERING_HEAD",
  "PRODUCTION",
  "PRODUCTION_HEAD",
  "QC",
  "QC_HEAD",
  "LOGISTICS",
  "LOGISTICS_HEAD",
  "FINANCE",
  "FINANCE_HEAD",
  "HR_GA",
  "HR_GA_HEAD",
  "FC",
  "ADMIN",
] as const;

export type OfficialRole = (typeof OFFICIAL_ROLES)[number];

export const DEPARTMENT_APPROVAL_MAP: Record<OfficialDepartment, OfficialRole[]> = {
  SALES: ["SALES_HEAD", "FC", "ADMIN"],
  PURCHASING: ["PURCHASING_HEAD", "FC", "ADMIN"],
  ENGINEERING: ["ENGINEERING_HEAD", "FC", "ADMIN"],
  PRODUCTION: ["PRODUCTION_HEAD", "FC", "ADMIN"],
  QC: ["QC_HEAD", "FC", "ADMIN"],
  LOGISTICS: ["LOGISTICS_HEAD", "FC", "ADMIN"],
  FINANCE: ["FINANCE_HEAD", "FC", "ADMIN"],
  HR_GA: ["HR_GA_HEAD", "FC", "ADMIN"],
  FC: ["FC", "ADMIN"],
};

export function normalizeDepartment(input?: string | null): OfficialDepartment {
  const raw = (input || "").trim().toUpperCase();
  if (raw.includes("FINANCE") || raw.includes("ACCOUNTING") || raw.includes("KEUANGAN")) {
    return "FINANCE";
  }
  if (raw.includes("PURCH") || raw.includes("PROCUREMENT")) return "PURCHASING";
  if (raw.includes("ENG")) return "ENGINEERING";
  if (raw.includes("PROD") || raw.includes("MANUF")) return "PRODUCTION";
  if (raw.includes("QC") || raw.includes("QA") || raw.includes("QUALITY")) return "QC";
  if (raw.includes("LOG") || raw.includes("WAREHOUSE") || raw.includes("GUDANG")) return "LOGISTICS";
  if (raw.includes("HR") || raw.includes("GA") || raw.includes("PERSONALIA")) return "HR_GA";
  if (raw.includes("FC") || raw.includes("CONTROLLER") || raw.includes("DIREKSI")) return "FC";
  return "SALES";
}

export function canUserApproveDepartment(
  userRole: string | undefined,
  userDept: string | undefined,
  targetDepartment: string | null | undefined,
  targetRole?: string | null | undefined
): boolean {
  if (!userRole) return false;
  const normalizedRole = userRole.trim().toUpperCase() as OfficialRole;
  if (normalizedRole === "FC" || normalizedRole === "ADMIN") return true;

  if (!targetDepartment) return false;
  const normTargetDept = normalizeDepartment(targetDepartment);
  const allowedRoles = DEPARTMENT_APPROVAL_MAP[normTargetDept] || [];

  if (targetRole) {
    const normTargetRole = targetRole.trim().toUpperCase();
    if (normalizedRole === normTargetRole) return true;
  }

  return allowedRoles.includes(normalizedRole);
}
