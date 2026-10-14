import React, { useEffect, useState } from "react";
import { WorkspaceDocument, DocBlock, LayoutPreset } from "../../types/workspace";
import { CanvaStudioEditor } from "../../components/erp/workspace/CanvaStudioEditor";
import { SharedDocumentRenderer } from "../../components/erp/workspace/SharedDocumentRenderer";
import { apiFetch } from "../../utils/api";

export const DocumentWorkspace: React.FC = () => {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [activeDoc, setActiveDoc] = useState<WorkspaceDocument | null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [revisionNoteInput, setRevisionNoteInput] = useState("");

  const fetchDocuments = async () => {
    try {
      const res = await apiFetch<{ data: WorkspaceDocument[] }>("/api/workspace-documents");
      setDocuments(res.data);
    } catch (err: any) {
      setBanner({ type: "error", text: err.message || "Gagal memuat daftar dokumen" });
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const openDocument = async (id: string, asPreview = false) => {
    try {
      const fullDoc = await apiFetch<WorkspaceDocument>(`/api/workspace-documents/${id}`);
      setActiveDoc(fullDoc);
      setPreviewMode(asPreview);
      setBanner(null);
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  const handleSaveDraft = async (snapshot: {
    title: string;
    layoutPreset: LayoutPreset;
    blocks: DocBlock[];
  }) => {
    if (!activeDoc) return;
    try {
      const updated = await apiFetch<WorkspaceDocument>(
        `/api/workspace-documents/${activeDoc.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: snapshot.title,
            layout_preset: snapshot.layoutPreset,
            content: snapshot.blocks,
            expected_version: activeDoc.current_version,
          }),
        }
      );
      setActiveDoc(updated);
      setBanner({
        type: "success",
        text: `Draft berhasil disimpan (Versi ${updated.current_version}).`,
      });
      await fetchDocuments();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message || "Gagal menyimpan draft." });
    }
  };

  /**
   * P0-04 FIX: Submit approval dieksekusi dalam SATU request transaksi atomik (/submit)
   * dan status respons diperiksa secara ketat sebelum menampilkan notifikasi sukses.
   */
  const handleSubmitApproval = async (snapshot: {
    title: string;
    layoutPreset: LayoutPreset;
    blocks: DocBlock[];
  }) => {
    if (!activeDoc) return;
    try {
      const submitted = await apiFetch<WorkspaceDocument>(
        `/api/workspace-documents/${activeDoc.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            title: snapshot.title,
            layout_preset: snapshot.layoutPreset,
            content: snapshot.blocks,
            expected_version: activeDoc.current_version,
            idempotency_key: `submit-${activeDoc.id}-v${activeDoc.current_version}`,
          }),
        }
      );
      setActiveDoc(submitted);
      setBanner({
        type: "success",
        text: `Dokumen ${submitted.document_code} berhasil diajukan ke departemen ${submitted.authorization_department}.`,
      });
      await fetchDocuments();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: `Gagal mengajukan approval: ${err.message}`,
      });
    }
  };

  const handleApprove = async () => {
    if (!activeDoc) return;
    try {
      const approved = await apiFetch<WorkspaceDocument>(
        `/api/workspace-documents/${activeDoc.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ note: "Approved via Workspace Studio" }),
        }
      );
      setActiveDoc(approved);
      setBanner({
        type: "success",
        text: `Dokumen disahkan (APPROVED) oleh ${approved.approved_by_username}.`,
      });
      await fetchDocuments();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  const handleRevise = async () => {
    if (!activeDoc) return;
    try {
      const revised = await apiFetch<WorkspaceDocument>(
        `/api/workspace-documents/${activeDoc.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({ revision_note: revisionNoteInput }),
        }
      );
      setActiveDoc(revised);
      setRevisionNoteInput("");
      setBanner({ type: "success", text: "Permintaan revisi berhasil dikirim." });
      await fetchDocuments();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="no-print flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              FHTBS-ERP — Document Workshop Studio (Hardened v2.0)
            </h1>
            <p className="text-xs text-slate-500">
              RBAC Enforced • Atomic Sequence • Transactional Outbox • OnlyOffice DOCX Ready
            </p>
          </div>
          {activeDoc && (
            <button
              type="button"
              onClick={() => setActiveDoc(null)}
              className="px-3 py-1.5 text-xs font-semibold border rounded hover:bg-slate-50"
            >
              Kembali ke Daftar
            </button>
          )}
        </header>

        {banner && (
          <div
            className={`no-print p-3 rounded-lg text-xs font-medium border ${
              banner.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-rose-50 border-rose-300 text-rose-900"
            }`}
          >
            {banner.text}
          </div>
        )}

        {!activeDoc ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                <tr>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Judul</th>
                  <th className="py-3 px-4">Departemen</th>
                  <th className="py-3 px-4">Target Otorisasi</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Versi</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold">{d.document_code}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{d.title}</td>
                    <td className="py-3 px-4">{d.department}</td>
                    <td className="py-3 px-4">{d.authorization_department || "-"}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border">
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">v{d.current_version}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openDocument(d.id, false)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => openDocument(d.id, true)}
                        className="text-slate-600 hover:underline font-medium"
                      >
                        Preview & Approval
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : previewMode ? (
          <div className="space-y-4">
            <div className="no-print bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs space-y-1">
                <div>
                  <span className="font-semibold">Status:</span> {activeDoc.status} |{" "}
                  <span className="font-semibold">Pembuat:</span> {activeDoc.created_by_username} |{" "}
                  <span className="font-semibold">Target Approval:</span>{" "}
                  {activeDoc.authorization_department} ({activeDoc.authorization_role})
                </div>
                {activeDoc.approved_by_username && (
                  <div className="text-emerald-700 font-semibold">
                    Disahkan oleh: {activeDoc.approved_by_username} ({activeDoc.approved_by_role}) pada{" "}
                    {activeDoc.approved_at}
                  </div>
                )}
              </div>

              {activeDoc.status === "PENDING_APPROVAL" && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={revisionNoteInput}
                    onChange={(e) => setRevisionNoteInput(e.target.value)}
                    placeholder="Catatan revisi (min. 5 karakter)..."
                    className="border border-slate-300 rounded px-2.5 py-1.5 text-xs w-64"
                  />
                  <button
                    type="button"
                    onClick={handleRevise}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded hover:bg-amber-700"
                  >
                    Minta Revisi
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                  >
                    Setujui (Approve)
                  </button>
                </div>
              )}
            </div>

            {/* P0-09 FIX: Preview Modal menggunakan SharedDocumentRenderer yang persis sama dengan Editor */}
            <SharedDocumentRenderer
              blocks={activeDoc.content}
              layoutPreset={activeDoc.layout_preset}
              interactive={false}
            />
          </div>
        ) : (
          <CanvaStudioEditor
            initialTitle={activeDoc.title}
            initialLayoutPreset={activeDoc.layout_preset}
            initialBlocks={activeDoc.content}
            readOnly={
              activeDoc.status === "APPROVED" ||
              activeDoc.status === "PENDING_APPROVAL" ||
              activeDoc.status === "ARCHIVED"
            }
            onSaveDraft={handleSaveDraft}
            onSubmitApproval={handleSubmitApproval}
          />
        )}
      </div>
    </div>
  );
};
