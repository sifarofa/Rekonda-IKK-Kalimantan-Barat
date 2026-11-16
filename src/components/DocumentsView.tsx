import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Search,
  Edit3,
  Check,
  X,
  FolderOpen,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  RefreshCw,
  Cloud,
  Lock,
  AlertCircle
} from 'lucide-react';
import { AppDocument } from '../types/documents';
import { Komoditas, UserAuth } from '../types/rekonda';
import { KABUPATEN_KALBAR_LIST } from '../data/kabupatenList';
import {
  uploadDocumentToSupabase,
  updateAppDocument,
  deleteDocumentFromSupabase
} from '../services/supabaseDocuments';

interface DocumentsViewProps {
  documents: AppDocument[];
  isLoadingDocs: boolean;
  docsError: string | null;
  currentUser: UserAuth;
  komoditasList: Komoditas[];
  onRefreshDocuments: () => Promise<void>;
  onOpenAuth: () => void;
  onSuccessToast: (msg: string) => void;
}

const DOC_CATEGORIES = [
  'Semua Kategori',
  'Berita Acara Rekon',
  'Data Tabel 7.1',
  'Data Rekonda 2026',
  'LK & Bukti Sewa Alat',
  'Surat Tugas / Pendukung'
];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  isLoadingDocs,
  docsError,
  currentUser,
  komoditasList,
  onRefreshDocuments,
  onOpenAuth,
  onSuccessToast
}) => {
  const isPemilik = currentUser.role === 'pemilik' || currentUser.isOwner;
  const isKabupaten = currentUser.role === 'kabupaten' && Boolean(currentUser.kabupatenKode);

  // Upload form state
  const [title, setTitle] = useState<string>('');
  const [kategori, setKategori] = useState<string>('Berita Acara Rekon');
  const [kabKode, setKabKode] = useState<string>(
    isKabupaten && currentUser.kabupatenKode ? currentUser.kabupatenKode : 'ALL'
  );
  const [komKode, setKomKode] = useState<string>('ALL');
  const [catatan, setCatatan] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('Semua Kategori');

  // Inline Edit & Delete states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editCatatan, setEditCatatan] = useState<string>('');
  const [editKategori, setEditKategori] = useState<string>('Berita Acara Rekon');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filterCategory !== 'Semua Kategori') {
        const docCat = String(doc.metadata?.kategori || '');
        if (docCat !== filterCategory) return false;
      }
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.file_name.toLowerCase().includes(q) ||
        String(doc.metadata?.kategori || '').toLowerCase().includes(q) ||
        String(doc.metadata?.catatan || '').toLowerCase().includes(q) ||
        String(doc.metadata?.kabupaten_nama || '').toLowerCase().includes(q) ||
        String(doc.metadata?.komoditas_nama || '').toLowerCase().includes(q)
      );
    });
  }, [documents, filterCategory, searchTerm]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadError(null);
    if (file && !title.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser.isLoggedIn) {
      onOpenAuth();
      return;
    }
    if (!selectedFile) {
      setUploadError('Silakan pilih berkas terlebih dahulu.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const targetKab =
        isKabupaten && currentUser.kabupatenKode
          ? KABUPATEN_KALBAR_LIST.find((k) => k.kode === currentUser.kabupatenKode)
          : kabKode !== 'ALL'
          ? KABUPATEN_KALBAR_LIST.find((k) => k.kode === kabKode)
          : null;

      const targetKom =
        komKode !== 'ALL' ? komoditasList.find((k) => k.kode === komKode) : null;

      await uploadDocumentToSupabase({
        file: selectedFile,
        title: title.trim() || selectedFile.name,
        metadata: {
          kategori,
          catatan: catatan.trim(),
          kabupaten_kode: targetKab?.kode || 'ALL',
          kabupaten_nama: targetKab?.nama || 'Semua Wilayah (Kalbar)',
          komoditas_kode: targetKom?.kode || 'ALL',
          komoditas_nama: targetKom?.nama || 'Umum / Seluruh Kualitas',
          uploaded_by: currentUser.email || currentUser.name || 'Admin',
          uploaded_role: currentUser.role
        }
      });

      setTitle('');
      setCatatan('');
      setSelectedFile(null);
      const inputEl = document.getElementById('cloud-doc-file-input') as HTMLInputElement | null;
      if (inputEl) inputEl.value = '';
      onSuccessToast('Dokumen berhasil diunggah ke Supabase & disinkronkan ke seluruh perangkat!');
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsUploading(false);
    }
  };

  const canModifyDoc = (doc: AppDocument): boolean => {
    if (!currentUser.isLoggedIn) return false;
    if (isPemilik) return true;
    if (isKabupaten) {
      return (
        doc.metadata?.kabupaten_kode === currentUser.kabupatenKode ||
        doc.metadata?.uploaded_by === currentUser.email
      );
    }
    return false;
  };

  const handleStartEdit = (doc: AppDocument) => {
    setEditingId(doc.id);
    setEditTitle(doc.title);
    setEditCatatan(String(doc.metadata?.catatan || ''));
    setEditKategori(String(doc.metadata?.kategori || 'Berita Acara Rekon'));
  };

  const handleSaveEdit = async (doc: AppDocument) => {
    if (!editTitle.trim()) return;
    setSavingEditId(doc.id);
    try {
      await updateAppDocument(doc.id, {
        title: editTitle.trim(),
        metadata: {
          ...(doc.metadata || {}),
          kategori: editKategori,
          catatan: editCatatan.trim(),
          updated_at: new Date().toISOString()
        }
      });
      setEditingId(null);
      onSuccessToast('Informasi dokumen berhasil diperbarui.');
    } catch (err: any) {
      setUploadError(err.message || 'Gagal memperbarui dokumen.');
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDeleteDoc = async (doc: AppDocument) => {
    setDeletingId(doc.id);
    try {
      await deleteDocumentFromSupabase(doc);
      setConfirmDeleteId(null);
      onSuccessToast(`Dokumen "${doc.title}" beserta filenya telah dihapus dari Supabase.`);
    } catch (err: any) {
      setUploadError(err.message || 'Gagal menghapus dokumen.');
    } finally {
      setDeletingId(null);
    }
  };

  const renderFileIcon = (fileType: string, fileName: string) => {
    const lower = `${fileType} ${fileName}`.toLowerCase();
    if (lower.includes('sheet') || lower.includes('excel') || lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />;
    }
    if (lower.includes('image') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return <ImageIcon className="w-5 h-5 text-sky-600 shrink-0" />;
    }
    if (lower.includes('pdf') || lower.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-rose-600 shrink-0" />;
    }
    return <File className="w-5 h-5 text-slate-500 shrink-0" />;
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Arsip &amp; Dokumen Rekonda Cloud
              </h2>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                Realtime Multi-Perangkat
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh dokumen terunggah disimpan di Supabase Storage &amp; tersinkron otomatis di semua perangkat tanpa reload.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRefreshDocuments()}
          disabled={isLoadingDocs}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isLoadingDocs ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Upload Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Unggah Dokumen Baru ke Cloud</span>
          </h3>
          {!currentUser.isLoggedIn && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-md cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>Masuk untuk Mengunggah</span>
            </button>
          )}
        </div>

        {uploadError && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div className="md:col-span-4">
            <label className="block font-bold text-slate-700 mb-1">Judul Dokumen *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Berita Acara Rekon TW I 2027"
              disabled={!currentUser.isLoggedIn || isUploading}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:bg-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block font-bold text-slate-700 mb-1">Kategori</label>
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              disabled={!currentUser.isLoggedIn || isUploading}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:bg-slate-100 cursor-pointer"
            >
              {DOC_CATEGORIES.slice(1).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">Wilayah</label>
            <select
              value={isKabupaten && currentUser.kabupatenKode ? currentUser.kabupatenKode : kabKode}
              onChange={(e) => setKabKode(e.target.value)}
              disabled={!currentUser.isLoggedIn || isKabupaten || isUploading}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:bg-slate-100 cursor-pointer"
            >
              {!isKabupaten && <option value="ALL">Semua Kab/Kota</option>}
              {KABUPATEN_KALBAR_LIST.map((k) => (
                <option key={k.kode} value={k.kode}>
                  [{k.kode}] {k.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block font-bold text-slate-700 mb-1">Komoditas Terkait</label>
            <select
              value={komKode}
              onChange={(e) => setKomKode(e.target.value)}
              disabled={!currentUser.isLoggedIn || isUploading}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:bg-slate-100 cursor-pointer"
            >
              <option value="ALL">Umum / Seluruh Kualitas</option>
              {komoditasList.map((k) => (
                <option key={k.kode} value={k.kode}>
                  [{k.kode}] {k.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block font-bold text-slate-700 mb-1">Catatan / Keterangan</label>
            <input
              type="text"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan tambahan (opsional)"
              disabled={!currentUser.isLoggedIn || isUploading}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:bg-slate-100"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block font-bold text-slate-700 mb-1">Pilih Berkas *</label>
            <input
              id="cloud-doc-file-input"
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.zip"
              onChange={handleFilePick}
              disabled={!currentUser.isLoggedIn || isUploading}
              className="w-full text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer disabled:opacity-50"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={!currentUser.isLoggedIn || !selectedFile || isUploading}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengunggah...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unggah</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Document List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Dokumen Tersimpan ({filteredDocuments.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              {DOC_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari judul, file, wilayah..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56"
              />
            </div>
          </div>
        </div>

        {docsError && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{docsError}</span>
          </div>
        )}

        {isLoadingDocs && documents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Memuat daftar dokumen dari Supabase...</span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            Belum ada dokumen tersimpan di Supabase untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Dokumen</th>
                  <th className="py-2.5 px-3">Kategori &amp; Metadata</th>
                  <th className="py-2.5 px-3">Pengunggah &amp; Waktu</th>
                  <th className="py-2.5 px-3 text-center w-44">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDocuments.map((doc) => {
                  const isEditing = editingId === doc.id;
                  const editable = canModifyDoc(doc);
                  const isConfirmingDel = confirmDeleteId === doc.id;

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">{renderFileIcon(doc.file_type, doc.file_name)}</div>
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full border border-emerald-400 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                              />
                            ) : (
                              <div className="font-bold text-slate-900 break-words">{doc.title}</div>
                            )}
                            <div className="text-[11px] font-mono text-slate-500 truncate max-w-xs" title={doc.file_name}>
                              {doc.metadata?.original_name || doc.file_name}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {doc.file_type || 'file'} · {formatBytes(doc.metadata?.file_size)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-top">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <select
                              value={editKategori}
                              onChange={(e) => setEditKategori(e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-[11px]"
                            >
                              {DOC_CATEGORIES.slice(1).map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editCatatan}
                              onChange={(e) => setEditCatatan(e.target.value)}
                              placeholder="Catatan dokumen"
                              className="w-full border border-slate-300 rounded px-2 py-1 text-[11px]"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {doc.metadata?.kategori && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                                  {String(doc.metadata.kategori)}
                                </span>
                              )}
                              {doc.metadata?.kabupaten_nama && doc.metadata.kabupaten_kode !== 'ALL' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  [{String(doc.metadata.kabupaten_kode)}] {String(doc.metadata.kabupaten_nama)}
                                </span>
                              )}
                              {doc.metadata?.komoditas_kode && doc.metadata.komoditas_kode !== 'ALL' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                  [{String(doc.metadata.komoditas_kode)}] {String(doc.metadata.komoditas_nama || '')}
                                </span>
                              )}
                            </div>
                            {doc.metadata?.catatan && (
                              <p className="text-[11px] text-slate-600">{String(doc.metadata.catatan)}</p>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 align-top">
                        <div className="font-semibold text-slate-800">
                          {String(doc.metadata?.uploaded_by || 'Admin')}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatDateTime(doc.created_at)}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-top text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={savingEditId === doc.id}
                              onClick={() => handleSaveEdit(doc)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>Simpan</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                              title="Batal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : isConfirmingDel ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={deletingId === doc.id}
                              onClick={() => handleDeleteDoc(doc)}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              {deletingId === doc.id ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Unduh / Buka Dokumen"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[11px] font-bold transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Buka</span>
                            </a>

                            {editable && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(doc)}
                                  title="Edit Judul & Metadata"
                                  className="p-1.5 rounded-md text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(doc.id)}
                                  title="Hapus Dokumen & File Storage"
                                  className="p-1.5 rounded-md text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
