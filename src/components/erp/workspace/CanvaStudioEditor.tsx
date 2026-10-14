import React, { useState } from "react";
import { DocBlock, LayoutPreset } from "../../../types/workspace";
import { OfficialDepartment, OfficialRole } from "../../../constants/rbac";
import { SharedDocumentRenderer } from "./SharedDocumentRenderer";

/**
 * P1-01 FIX: Routing departemen diselaraskan penuh dengan RBAC resmi.
 * FINANCE diarahkan secara akurat ke FINANCE / FINANCE_HEAD (bukan SALES).
 */
export const DEPARTMENT_ROUTING_CONFIG: Record<
  OfficialDepartment,
  { role: OfficialRole; deptNameId: string; defaultTitle: string }
> = {
  SALES: { role: "SALES_HEAD", deptNameId: "Sales & Marketing", defaultTitle: "Head of Sales" },
  PURCHASING: { role: "PURCHASING_HEAD", deptNameId: "Purchasing & Procurement", defaultTitle: "Purchasing Manager" },
  ENGINEERING: { role: "ENGINEERING_HEAD", deptNameId: "Engineering", defaultTitle: "Chief Engineer" },
  PRODUCTION: { role: "PRODUCTION_HEAD", deptNameId: "Production", defaultTitle: "Production Manager" },
  QC: { role: "QC_HEAD", deptNameId: "Quality Control", defaultTitle: "QC Manager" },
  LOGISTICS: { role: "LOGISTICS_HEAD", deptNameId: "Logistics & Warehouse", defaultTitle: "Logistics Manager" },
  FINANCE: { role: "FINANCE_HEAD", deptNameId: "Finance & Accounting", defaultTitle: "Finance Manager" },
  HR_GA: { role: "HR_GA_HEAD", deptNameId: "HR & General Affairs", defaultTitle: "HR & GA Manager" },
  FC: { role: "FC", deptNameId: "Financial Controller", defaultTitle: "Financial Controller" },
};

interface EditorSnapshot {
  title: string;
  layoutPreset: LayoutPreset;
  blocks: DocBlock[];
}

interface CanvaStudioEditorProps {
  initialTitle: string;
  initialLayoutPreset: LayoutPreset;
  initialBlocks: DocBlock[];
  readOnly?: boolean;
  onSaveDraft: (snapshot: EditorSnapshot) => Promise<void>;
  onSubmitApproval: (snapshot: EditorSnapshot) => Promise<void>;
  onOpenOnlyOffice?: () => void;
}

export const CanvaStudioEditor: React.FC<CanvaStudioEditorProps> = ({
  initialTitle,
  initialLayoutPreset,
  initialBlocks,
  readOnly = false,
  onSaveDraft,
  onSubmitApproval,
  onOpenOnlyOffice,
}) => {
  // P1-03 FIX: Undo/Redo mencakup seluruh EditorSnapshot (title, layoutPreset, blocks)
  const [present, setPresent] = useState<EditorSnapshot>({
    title: initialTitle,
    layoutPreset: initialLayoutPreset,
    blocks: initialBlocks,
  });
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialBlocks[0]?.id || null
  );
  const [isSaving, setIsSaving] = useState(false);

  const commitChange = (updater: (prev: EditorSnapshot) => EditorSnapshot) => {
    if (readOnly) return;
    setPast((p) => [...p.slice(-29), present]);
    setFuture([]);
    setPresent((prev) => updater(prev));
  };

  const handleUndo = () => {
    if (past.length === 0 || readOnly) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [present, ...f]);
    setPresent(previous);
  };

  const handleRedo = () => {
    if (future.length === 0 || readOnly) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, present]);
    setPresent(next);
  };

  const selectedBlock = present.blocks.find((b) => b.id === selectedBlockId) || null;

  const updateSelectedBlock = (patch: Partial<DocBlock>) => {
    if (!selectedBlockId) return;
    commitChange((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === selectedBlockId ? { ...b, ...patch } : b)),
    }));
  };

  const handlePrintDraft = () => {
    document.body.setAttribute("data-print-orientation", present.layoutPreset);
    document.body.classList.add("printing-workspace");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-workspace");
    }, 500);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar Atas */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled={readOnly}
            value={present.title}
            onChange={(e) => commitChange((prev) => ({ ...prev, title: e.target.value }))}
            className="border border-slate-300 rounded px-3 py-1.5 text-sm font-semibold w-72"
            placeholder="Judul Dokumen..."
          />
          <select
            disabled={readOnly}
            value={present.layoutPreset}
            onChange={(e) =>
              commitChange((prev) => ({
                ...prev,
                layoutPreset: e.target.value as LayoutPreset,
              }))
            }
            className="border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium bg-slate-50"
          >
            <option value="A4_PORTRAIT">A4 Portrait</option>
            <option value="A4_LANDSCAPE">A4 Landscape</option>
            <option value="EXECUTIVE_MEMO">Executive Memo</option>
          </select>
          <button
            type="button"
            onClick={handleUndo}
            disabled={past.length === 0 || readOnly}
            className="px-2.5 py-1.5 text-xs border rounded disabled:opacity-40"
          >
            Undo ({past.length})
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={future.length === 0 || readOnly}
            className="px-2.5 py-1.5 text-xs border rounded disabled:opacity-40"
          >
            Redo ({future.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onOpenOnlyOffice && (
            <button
              type="button"
              onClick={onOpenOnlyOffice}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
            >
              Buka di OnlyOffice DOCX Engine
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintDraft}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-100"
          >
            Print / Export PDF Preview
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await onSaveDraft(present);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded hover:bg-slate-900 disabled:opacity-50"
              >
                Simpan Draft
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await onSubmitApproval(present);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Ajukan Approval (Atomik)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inspector Blok Terpilih */}
      {!readOnly && selectedBlock && (
        <div className="no-print bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono font-semibold uppercase text-slate-600">
            Blok: {selectedBlock.type}
          </span>
          {(selectedBlock.type === "paragraph" ||
            selectedBlock.type === "heading" ||
            selectedBlock.type === "callout") && (
            <input
              type="text"
              value={selectedBlock.content || ""}
              onChange={(e) => updateSelectedBlock({ content: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1 flex-1 min-w-[240px]"
              placeholder="Isi teks blok..."
            />
          )}
          {selectedBlock.type === "signature" && (
            <div className="flex items-center gap-2">
              <label className="font-medium">Target Departemen:</label>
              <select
                value={selectedBlock.targetDepartment || "FINANCE"}
                onChange={(e) => {
                  const dept = e.target.value as OfficialDepartment;
                  const cfg = DEPARTMENT_ROUTING_CONFIG[dept];
                  updateSelectedBlock({
                    targetDepartment: dept,
                    targetRole: cfg.role,
                    signatoryTitle: cfg.defaultTitle,
                  });
                }}
                className="border border-slate-300 rounded px-2 py-1 bg-white"
              >
                {Object.keys(DEPARTMENT_ROUTING_CONFIG).map((d) => (
                  <option key={d} value={d}>
                    {d} ({DEPARTMENT_ROUTING_CONFIG[d as OfficialDepartment].role})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Kanvas Dokumen Menggunakan Shared Renderer (P0-09) */}
      <div className="bg-slate-200/70 p-6 rounded-xl overflow-auto">
        <SharedDocumentRenderer
          blocks={present.blocks}
          layoutPreset={present.layoutPreset}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          interactive={!readOnly}
        />
      </div>
    </div>
  );
};
