# FHTBS-ERP — Document Workshop Studio (Hardened Full-Bundle v2.0)

Bundle ini merupakan implementasi perbaikan komprehensif (Fase 0 Stabilisasi Darurat + Kerangka Integrasi OnlyOffice DOCX-native Fase 1/2) berdasarkan laporan audit terhadap repositori `https://github.com/eghyal/FHTBS-ERP` (Commit `66bea280abd732238b0e1d1d9e70180c1ff0ef91`).

## Ringkasan Perbaikan P0 & P1 yang Diimplementasikan

1. **P0-01 (Anti Status Bypass):** Menghapus kolom `status` dari endpoint `PUT /api/workspace-documents/:id` dan menolak eksplisit setiap usaha mutasi status di luar state machine.
2. **P0-02 (RBAC Approval Enforcement):** Menambahkan verifikasi `canUserApproveDepartment` pada `/approve` dan `/revise` berdasarkan role JWT dan target departemen dokumen.
3. **P0-03 (Verified Session Identity):** Menghapus pembacaan `req.headers["x-user-username"]` dan `req.headers["x-user-name"]`; seluruh identitas pembuat dan approver diambil dari payload JWT terverifikasi (`populateUserSession`).
4. **P0-04 (Atomic Submit Approval):** Menggabungkan penyimpanan konten akhir, transisi status `PENDING_APPROVAL`, histori versi, audit event, dan transactional outbox ke dalam satu endpoint transaksi SQLite `POST /api/workspace-documents/:id/submit`.
5. **P0-05 (Atomic Sequence Generator):** Mengganti `SELECT COUNT(*) + 1` dengan tabel `document_sequences` per scope `DOC-{DEPT}-{YYYYMM}` di dalam transaksi atomik sehingga bebas collision walau ada dokumen yang dihapus.
6. **P0-06 (Strict Schema Validation):** Menggunakan Zod (`src/validation/workspaceSchema.ts`) sehingga payload rusak selalu mengembalikan HTTP 400 beserta `fieldErrors`, bukan HTTP 500.
7. **P0-07 (Immutable Approved Documents):** Mengunci dokumen berstatus `APPROVED` dan `ARCHIVED` dari modifikasi (`PUT`) maupun penghapusan (`DELETE`).
8. **P0-08 & P0-09 (Unified Renderer & Deterministic Print):** Menyatukan renderer editor dan preview modal melalui `SharedDocumentRenderer.tsx` serta menambahkan dukungan `@media print` untuk `.printing-workspace`.
9. **P1-01 (FINANCE RBAC Alignment):** Menambahkan `FINANCE` dan `FINANCE_HEAD` ke dalam `src/constants/rbac.ts` dan memperbaiki `DEPARTMENT_ROUTING_CONFIG` agar tidak lagi salah diarahkan ke `SALES`.
10. **Solusi Konvergen Opsi E (OnlyOffice Integration):** Menyediakan `src/services/onlyofficeService.ts` beserta endpoint `/editor-session` dan `/onlyoffice-callback` ber-token JWT.

## Cara Menjalankan di Lokal (Fedora Linux / Node.js >= 20)

```bash
# 1. Ekstrak zip dan masuk ke direktori
unzip fhtbs-erp-document-studio-hardened.zip
cd fhtbs-erp-document-studio-hardened

# 2. Install dependencies
npm install

# 3. Jalankan verifikasi TypeScript & Test Suite Keamanan (P0/P1)
npm run lint
npm test

# 4. Jalankan server pengembangan
npm run dev:server
```
