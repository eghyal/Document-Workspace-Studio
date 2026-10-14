import React from "react";
import { DocBlock, LayoutPreset } from "../../../types/workspace";

interface SharedDocumentRendererProps {
  blocks: DocBlock[];
  layoutPreset: LayoutPreset;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
  interactive?: boolean;
}

/**
 * P0-09 FIX: Satu renderer terpadu yang dipakai bersama oleh:
 * 1. CanvaStudioEditor (Mode Edit & Preview)
 * 2. DocumentWorkspace (Approval & Preview Modal)
 * 3. Output Cetak / Print View
 */
export const SharedDocumentRenderer: React.FC<SharedDocumentRendererProps> = ({
  blocks,
  layoutPreset,
  selectedBlockId,
  onSelectBlock,
  interactive = false,
}) => {
  const pageClass =
    layoutPreset === "A4_LANDSCAPE"
      ? "w-[297mm] min-h-[210mm]"
      : "w-[210mm] min-h-[297mm]";

  return (
    <div
      data-layout-preset={layoutPreset}
      className={`workspace-print-sheet bg-white text-slate-900 shadow-lg mx-auto p-10 flex flex-col gap-4 ${pageClass}`}
    >
      {blocks.map((block) => {
        const isSelected = interactive && selectedBlockId === block.id;
        const alignClass =
          block.align === "center"
            ? "text-center"
            : block.align === "right"
            ? "text-right"
            : block.align === "justify"
            ? "text-justify"
            : "text-left";

        const textStyle: React.CSSProperties = {
          fontWeight: block.isBold ? 700 : undefined,
          fontStyle: block.isItalic ? "italic" : undefined,
          textDecoration: [
            block.isUnderline ? "underline" : "",
            block.isStrikethrough ? "line-through" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
          color: block.textColor || undefined,
          backgroundColor: block.highlightColor || undefined,
          fontSize: block.fontSize ? `${block.fontSize}px` : undefined,
        };

        const renderRichContent = () => {
          if (block.runs && block.runs.length > 0) {
            return block.runs.map((run, idx) => (
              <span
                key={idx}
                style={{
                  fontWeight: run.isBold ? 700 : undefined,
                  fontStyle: run.isItalic ? "italic" : undefined,
                  textDecoration: [
                    run.isUnderline ? "underline" : "",
                    run.isStrikethrough ? "line-through" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined,
                  color: run.textColor || undefined,
                  backgroundColor: run.highlightColor || undefined,
                }}
              >
                {run.text}
              </span>
            ));
          }
          return block.content;
        };

        return (
          <div
            key={block.id}
            onClick={() => interactive && onSelectBlock?.(block.id)}
            className={`rounded transition-all ${alignClass} ${
              interactive ? "cursor-pointer hover:ring-2 hover:ring-blue-300 p-2" : "p-1"
            } ${isSelected ? "ring-2 ring-blue-600 bg-blue-50/30" : ""}`}
            style={textStyle}
          >
            {block.type === "letterhead" && (
              <div className="border-b-2 border-slate-800 pb-3 mb-2 flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-bold tracking-tight uppercase">
                    {block.title || "PT FHTBS INDUSTRIAL ERP"}
                  </h1>
                  <p className="text-xs text-slate-600">
                    {block.subtitle || "Manufacturing & Engineering Division — Dokumen Resmi"}
                  </p>
                </div>
                <span className="text-xs font-mono px-2 py-1 bg-slate-100 rounded border">
                  RESMI / TERKENDALI
                </span>
              </div>
            )}

            {block.type === "metadata" && block.metaData && (
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-semibold text-slate-500">Nomor: </span>
                  <span className="font-mono">{block.metaData.docNumber || "-"}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Tanggal: </span>
                  <span>{block.metaData.date || "-"}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Perihal: </span>
                  <span>{block.metaData.subject || "-"}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Prioritas: </span>
                  <span className="font-semibold">{block.metaData.priority || "NORMAL"}</span>
                </div>
              </div>
            )}

            {block.type === "heading" && (
              <h2 className="text-lg font-bold text-slate-900">{renderRichContent()}</h2>
            )}

            {block.type === "paragraph" && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{renderRichContent()}</p>
            )}

            {block.type === "callout" && (
              <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 rounded-r">
                <div className="font-semibold mb-1">{block.title || "Catatan Penting"}</div>
                <div>{renderRichContent()}</div>
              </div>
            )}

            {block.type === "list" && (
              <ul className="list-disc list-inside text-sm space-y-1">
                {(block.listItems || []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}

            {block.type === "table" && block.tableData && (
              <table className="w-full border-collapse border border-slate-300 text-xs my-2">
                <thead>
                  <tr className="bg-slate-100">
                    {block.tableData.headers.map((h, i) => (
                      <th key={i} className="border border-slate-300 px-2 py-1.5 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.tableData.rows.map((r, rIdx) => (
                    <tr key={rIdx} className="even:bg-slate-50">
                      {r.map((cell, cIdx) => (
                        <td key={cIdx} className="border border-slate-300 px-2 py-1">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {block.type === "signature" && (
              <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
                <div className="w-64 text-center border border-slate-300 rounded p-3 bg-slate-50/50">
                  <p className="text-xs text-slate-500 uppercase font-semibold">
                    Otorisasi Departemen: {block.targetDepartment || "FINANCE"}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {block.signatoryTitle || "Kepala Departemen"}
                  </p>
                  <div className="h-14 flex items-center justify-center text-[11px] text-slate-400 italic">
                    [Ruang Tanda Tangan Digital / Elektronik]
                  </div>
                  <p className="text-xs font-bold underline">
                    {block.signatoryName || "( Pejabat Berwenang )"}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500">
                    Target Role: {block.targetRole || `${block.targetDepartment || "FINANCE"}_HEAD`}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
