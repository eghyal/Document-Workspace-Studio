import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../server";
import { signUserToken, AuthenticatedUser } from "../middleware/auth";
import { DEPARTMENT_ROUTING_CONFIG } from "../components/erp/workspace/CanvaStudioEditor";

async function startTestServer() {
  const { app, db } = createApp(":memory:");
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

const salesStaff: AuthenticatedUser = {
  id: "usr-sales-01",
  username: "budi.sales",
  email: "budi@fhtbs.co.id",
  role: "SALES",
  department: "SALES",
};

const purchasingHead: AuthenticatedUser = {
  id: "usr-purch-head-01",
  username: "rina.purchasing",
  email: "rina@fhtbs.co.id",
  role: "PURCHASING_HEAD",
  department: "PURCHASING",
};

const financeHead: AuthenticatedUser = {
  id: "usr-fin-head-01",
  username: "eko.finance",
  email: "eko@fhtbs.co.id",
  role: "FINANCE_HEAD",
  department: "FINANCE",
};

const sampleBlocks = [
  {
    id: "blk-1",
    type: "letterhead",
    title: "PT FHTBS INDUSTRIAL",
  },
  {
    id: "blk-2",
    type: "paragraph",
    content: "Permohonan pengadaan plat baja SS400.",
  },
  {
    id: "blk-3",
    type: "signature",
    targetDepartment: "PURCHASING",
    targetRole: "PURCHASING_HEAD",
    signatoryTitle: "Purchasing Manager",
  },
];

describe("Audit Remediation Suite — Document Workshop Studio (P0 & P1)", () => {
  test("P0-01 & P0-03: Mencegah bypass status melalui PUT dan mengabaikan spoofing header identitas", async () => {
    const env = await startTestServer();
    try {
      const token = signUserToken(salesStaff);

      // Buat dokumen dengan header palsu
      const createRes = await fetch(`${env.baseUrl}/api/workspace-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-user-username": "spoofed.ceo",
          "x-user-name": "Spoofed CEO",
        },
        body: JSON.stringify({
          title: "Memo Pengadaan Sparepart Hidrolik",
          department: "SALES",
          content: sampleBlocks,
        }),
      });

      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      assert.equal(created.created_by_username, "budi.sales");
      assert.equal(created.created_by_user_id, "usr-sales-01");
      assert.equal(created.status, "DRAFT");

      // Coba bypass status = APPROVED lewat PUT
      const bypassRes = await fetch(`${env.baseUrl}/api/workspace-documents/${created.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "APPROVED",
        }),
      });

      assert.equal(bypassRes.status, 400);
      const bypassBody = await bypassRes.json();
      assert.equal(bypassBody.error, "STATUS_MUTATION_FORBIDDEN");
    } finally {
      await env.close();
    }
  });

  test("P0-02, P0-04, P0-07: Submit atomik, penegakan RBAC lintas departemen, dan immutability dokumen APPROVED", async () => {
    const env = await startTestServer();
    try {
      const salesToken = signUserToken(salesStaff);
      const purchHeadToken = signUserToken(purchasingHead);

      const createRes = await fetch(`${env.baseUrl}/api/workspace-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          title: "Purchase Requisition Hydraulic Valve",
          department: "SALES",
          content: sampleBlocks,
        }),
      });
      const created = await createRes.json();

      // Submit secara atomik ke PURCHASING
      const submitRes = await fetch(
        `${env.baseUrl}/api/workspace-documents/${created.id}/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${salesToken}`,
          },
          body: JSON.stringify({
            content: sampleBlocks,
            expected_version: 1,
            idempotency_key: "idem-001",
          }),
        }
      );
      assert.equal(submitRes.status, 200);
      const submitted = await submitRes.json();
      assert.equal(submitted.status, "PENDING_APPROVAL");
      assert.equal(submitted.authorization_department, "PURCHASING");

      // User SALES mencoba approve dokumen PURCHASING -> harus ditolak 403!
      const illegalApprove = await fetch(
        `${env.baseUrl}/api/workspace-documents/${created.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${salesToken}`,
          },
          body: JSON.stringify({ note: "Self approve" }),
        }
      );
      assert.equal(illegalApprove.status, 403);

      // PURCHASING_HEAD melakukan approve -> harus berhasil 200!
      const legalApprove = await fetch(
        `${env.baseUrl}/api/workspace-documents/${created.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${purchHeadToken}`,
          },
          body: JSON.stringify({ note: "Disetujui pengadaan valve" }),
        }
      );
      assert.equal(legalApprove.status, 200);
      const approved = await legalApprove.json();
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.approved_by_username, "rina.purchasing");

      // P0-07: Coba ubah dokumen yang sudah APPROVED -> harus ditolak 409!
      const mutateApproved = await fetch(
        `${env.baseUrl}/api/workspace-documents/${created.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${salesToken}`,
          },
          body: JSON.stringify({
            title: "Judul Diubah Diam-diam Setelah Approved",
          }),
        }
      );
      assert.equal(mutateApproved.status, 409);
      const mutateBody = await mutateApproved.json();
      assert.equal(mutateBody.error, "DOCUMENT_IMMUTABLE");
    } finally {
      await env.close();
    }
  });

  test("P0-05: Penomoran dokumen tetap unik dan bebas collision meskipun dokumen non-terbaru dihapus", async () => {
    const env = await startTestServer();
    try {
      const token = signUserToken(salesStaff);

      const createDoc = async (title: string) => {
        const res = await fetch(`${env.baseUrl}/api/workspace-documents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title,
            department: "SALES",
            content: sampleBlocks,
          }),
        });
        assert.equal(res.status, 201);
        return res.json();
      };

      const d1 = await createDoc("Dokumen Pertama");
      const d2 = await createDoc("Dokumen Kedua");

      // Hapus dokumen pertama (non-terbaru)
      const delRes = await fetch(`${env.baseUrl}/api/workspace-documents/${d1.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(delRes.status, 200);

      // Buat dokumen ketiga -> pada kode lama COUNT(*)+1 menghasilkan nomor duplikat dengan d2 dan gagal 500
      const d3 = await createDoc("Dokumen Ketiga Setelah Delete");
      assert.notEqual(d2.document_code, d3.document_code);
      assert.match(d3.document_code, /-0003$/);
    } finally {
      await env.close();
    }
  });

  test("P0-06 & P1-01: Payload rusak menghasilkan HTTP 400 (bukan 500) dan FINANCE terpetakan ke FINANCE_HEAD", async () => {
    const env = await startTestServer();
    try {
      const token = signUserToken(financeHead);

      // P1-01: Pastikan konfigurasi editor memetakan FINANCE ke FINANCE_HEAD
      assert.equal(DEPARTMENT_ROUTING_CONFIG.FINANCE.role, "FINANCE_HEAD");

      // P0-06: Kirim content rusak
      const badRes = await fetch(`${env.baseUrl}/api/workspace-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Dokumen Rusak",
          department: "FINANCE",
          content: "INI_BUKAN_ARRAY_BLOK",
        }),
      });

      assert.equal(badRes.status, 400);
      const badBody = await badRes.json();
      assert.equal(badBody.error, "VALIDATION_ERROR");
    } finally {
      await env.close();
    }
  });
});
