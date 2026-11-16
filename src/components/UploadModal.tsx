import React, { useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileText,
  Lock,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { KabupatenRekon, Komoditas, UserAuth } from '../types/rekonda';
import { formatRupiahNumber, formatPercent } from '../utils/formatters';
import {
  downloadTemplateTabel71,
  downloadTemplateIKKResponden,
  downloadTemplateIKKWebentry
} from '../utils/templateGenerators';
import {
  parseFileToRows,
  detectTemplateType,
  processMultiCommodityUpload,
  MultiParseResult
} from '../utils/templateParsers';
import { uploadDocumentToSupabase } from '../services/supabaseDocuments';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAuth;
  onOpenAuth: () => void;
  currentData: KabupatenRekon[];
  database: Record<string, KabupatenRekon[]>;
  komoditasList: Komoditas[];
  provinsiKode: string;
  onApplyData: (
    updatedDatabase: Record<string, KabupatenRekon[]>,
    sheetType: 'rekonda26' | 'tabel71',
    summary?: { updatedCommoditiesCount: number; isMultiCommodity: boolean }
  ) => void;
  selectedKomoditas: Komoditas;
  onQuickLoginAsOwner?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenAuth,
  currentData,
  database,
  komoditasList,
  provinsiKode,
  onApplyData,
  selectedKomoditas,
  onQuickLoginAsOwner
}) => {
  // Tab: 'tabel71' (Harga Tahun Berjalan -> Harga 2027) | 'rekonda26' (Harga Tahun Sebelumnya -> Harga 2026)
  const [activeTab, setActiveTab] = useState<'tabel71' | 'rekonda26'>('tabel71');

  // Sub-source for 2026: 'auto_merge' | 'rekonnas' | 'webentry'
  const [source2026, setSource2026] = useState<'auto_merge' | 'rekonnas' | 'webentry'>('auto_merge');

  const [fileName, setFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>('');
  const [successInfo, setSuccessInfo] = useState<string>('');
  const [multiResult, setMultiResult] = useState<MultiParseResult | null>(null);

  if (!isOpen) return null;

  const parseResult = multiResult?.previewResult || null;
  const previewKomObj =
    komoditasList.find((k) => k.kode === multiResult?.previewKomoditasKode) || selectedKomoditas;

  // Process uploaded rows across ALL commodities/qualities present in the file
  const runParser = (
    rows: any[],
    tab: 'tabel71' | 'rekonda26',
    subSource: 'auto_merge' | 'rekonnas' | 'webentry' = source2026
  ) => {
    try {
      let mode: 'tabel71' | 'rekonnas' | 'webentry' = 'tabel71';
      if (tab === 'rekonda26') {
        const detected = detectTemplateType(rows);
        if (subSource === 'webentry' || (subSource === 'auto_merge' && detected === 'rekonda_webentry')) {
          mode = 'webentry';
        } else {
          mode = 'rekonnas';
        }
      }

      const result = processMultiCommodityUpload({
        mode,
        rows,
        database,
        provinsiKode,
        komoditasList,
        selectedKomoditasKode: selectedKomoditas.kode,
        fallbackList: currentData
      });

      setMultiResult(result);

      if (result.totalAffectedKabEntries === 0) {
        setParseError(
          'Tidak ditemukan data kabupaten/kota yang cocok dengan kode kualitas pada berkas. Pastikan berkas memuat kolom Kode Kabupaten (6101–6172) dan kode kualitas rekon.'
        );
        return;
      }

      const previewKom =
        komoditasList.find((k) => k.kode === result.previewKomoditasKode) || selectedKomoditas;

      if (tab === 'tabel71') {
        if (result.isMultiCommodity) {
          setSuccessInfo(
            `Berhasil memproses ${result.totalRows.toLocaleString('id-ID')} baris data untuk SELURUH ${result.updatedCommoditiesCount} komoditas/kualitas (${result.totalAffectedKabEntries} data kab/kota terisi) ke kolom Harga Tahun Berjalan (2027). Pratinjau di bawah menampilkan [${previewKom.kode}] ${previewKom.nama}; seluruh ${result.updatedCommoditiesCount} komoditas akan otomatis diperbarui saat Anda klik Terapkan.`
          );
        } else {
          setSuccessInfo(
            `Berhasil memproses ${result.totalRows.toLocaleString('id-ID')} baris data ([${previewKom.kode}] ${previewKom.nama}). Menemukan ${result.previewResult.affectedKabCount} kabupaten/kota untuk diperbarui ke kolom Harga 2027.`
          );
        }
      } else {
        if (result.isMultiCommodity) {
          setSuccessInfo(
            `Berhasil memproses ${result.totalRows.toLocaleString('id-ID')} baris data tahun sebelumnya untuk SELURUH ${result.updatedCommoditiesCount} komoditas/kualitas (${result.totalAffectedKabEntries} data kab/kota) ke kolom Harga 2026. Pratinjau di bawah menampilkan [${previewKom.kode}] ${previewKom.nama}; seluruh ${result.updatedCommoditiesCount} komoditas akan otomatis diperbarui saat Anda klik Terapkan.`
          );
        } else {
          setSuccessInfo(
            `Berhasil memproses data tahun sebelumnya (${result.previewResult.affectedKabCount} kabupaten/kota) untuk [${previewKom.kode}] ${previewKom.nama} ke kolom Harga 2026.`
          );
        }
      }
      setParseError('');
    } catch (err: any) {
      setParseError(`Gagal memproses berkas: ${err.message || 'Format tidak sesuai'}`);
      setMultiResult(null);
    }
  };

  // Handle local File selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFile = e.target.files?.[0];
    if (!pickedFile) return;

    setSelectedFile(pickedFile);
    setFileName(pickedFile.name);
    setParseError('');
    setSuccessInfo('');
    setIsProcessing(true);

    try {
      const rows = await parseFileToRows(pickedFile);
      if (!rows || rows.length === 0) {
        setParseError('Berkas Excel / CSV kosong.');
        setMultiResult(null);
        setIsProcessing(false);
        return;
      }

      runParser(rows, activeTab, source2026);
    } catch (err: any) {
      setParseError(`Gagal membaca berkas: ${err.message || 'Format berkas tidak didukung'}`);
      setMultiResult(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Load Built-in Official Files across ALL commodities
  const handleLoadSample = async (type: 'tabel71' | 'rekonnas' | 'webentry' | 'auto_merge') => {
    setIsProcessing(true);
    setSelectedFile(null);
    setParseError('');
    setSuccessInfo('');

    try {
      if (type === 'tabel71') {
        setActiveTab('tabel71');
        setFileName('Data_Harga_Tahun_Berjalan.csv (Seluruh Komoditas 2026/2027)');
        const res = await fetch('/assets/aistudio/database_tabel_7.1_0a44d253.csv');
        const text = await res.text();
        const rows = await parseFileToRows(text);
        runParser(rows, 'tabel71', 'rekonnas');
      } else if (type === 'rekonnas') {
        setActiveTab('rekonda26');
        setSource2026('rekonnas');
        setFileName('IKK_REKONDA_responden_2026.csv (Seluruh Komoditas Rekonnas)');
        const res = await fetch('/assets/aistudio/IKK_REKONDA_responden_2026_3d99b638.csv');
        const text = await res.text();
        const rows = await parseFileToRows(text);
        runParser(rows, 'rekonda26', 'rekonnas');
      } else if (type === 'webentry') {
        setActiveTab('rekonda26');
        setSource2026('webentry');
        setFileName('database_webentry_2026.csv (Seluruh Komoditas Webentry)');
        const res = await fetch('/assets/aistudio/database_webentry_2026_f5274433.csv');
        const text = await res.text();
        const rows = await parseFileToRows(text);
        runParser(rows, 'rekonda26', 'webentry');
      } else if (type === 'auto_merge') {
        // Dual Merge Rule across ALL 89 commodities: IKK Rekonda Responden primary, Database Webentry fallback
        setActiveTab('rekonda26');
        setSource2026('auto_merge');
        setFileName('Sinkron Gabungan (Seluruh Komoditas): IKK Responden + Webentry');
        const [resRekon, resWeb] = await Promise.all([
          fetch('/assets/aistudio/IKK_REKONDA_responden_2026_3d99b638.csv'),
          fetch('/assets/aistudio/database_webentry_2026_f5274433.csv')
        ]);
        const textRekon = await resRekon.text();
        const textWeb = await resWeb.text();
        const rowsRekon = await parseFileToRows(textRekon);
        const rowsWeb = await parseFileToRows(textWeb);

        const mergedResult = processMultiCommodityUpload({
          mode: 'dual_2026_merge',
          rows: rowsRekon,
          webentryRows: rowsWeb,
          database,
          provinsiKode,
          komoditasList,
          selectedKomoditasKode: selectedKomoditas.kode,
          fallbackList: currentData
        });

        setMultiResult(mergedResult);
        const previewKom =
          komoditasList.find((k) => k.kode === mergedResult.previewKomoditasKode) || selectedKomoditas;

        setSuccessInfo(
          `Langkah 1 Selesai — Sinkron Gabungan berhasil menggabungkan ${mergedResult.updatedCommoditiesCount} komoditas/kualitas (mengutamakan IKK Rekonda Responden, dan otomatis mengambil dari Database Webentry jika kode/kabupaten belum tersedia). Pratinjau di bawah menampilkan [${previewKom.kode}] ${previewKom.nama}. Langkah 2: Klik tombol "Terapkan ke Kolom Harga 2026" di bawah untuk menyimpan ke tabel.`
        );
      }
    } catch (err: any) {
      setParseError(`Gagal memuat data: ${err.message}`);
      setMultiResult(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit, Upload to Supabase Storage & app_documents, and Apply across ALL updated commodities
  const handleProcessUpload = async () => {
    if (!currentUser.isOwner && !onQuickLoginAsOwner) {
      setParseError('Akses ditolak: Hanya Admin Provinsi yang dapat memperbarui data master.');
      return;
    }
    if (!multiResult || Object.keys(multiResult.updatedDatabase).length === 0) {
      setParseError('Silakan pilih berkas atau sinkronisasi data yang valid terlebih dahulu.');
      return;
    }

    if (selectedFile) {
      setIsProcessing(true);
      try {
        await uploadDocumentToSupabase({
          file: selectedFile,
          title:
            activeTab === 'tabel71'
              ? multiResult.isMultiCommodity
                ? `Harga Tahun Berjalan (Seluruh ${multiResult.updatedCommoditiesCount} Komoditas)`
                : `Harga Tahun Berjalan [${previewKomObj.kode}] ${previewKomObj.nama}`
              : multiResult.isMultiCommodity
              ? `Rekonda 2026 (Seluruh ${multiResult.updatedCommoditiesCount} Komoditas)`
              : `Rekonda 2026 [${previewKomObj.kode}] ${previewKomObj.nama}`,
          metadata: {
            kategori: activeTab === 'tabel71' ? 'Data Harga Tahun Berjalan' : 'Data Rekonda 2026',
            sheet_type: activeTab,
            source_2026: activeTab === 'rekonda26' ? source2026 : undefined,
            komoditas_kode: multiResult.isMultiCommodity ? 'ALL' : previewKomObj.kode,
            komoditas_nama: multiResult.isMultiCommodity
              ? `Semua Komoditas (${multiResult.updatedCommoditiesCount} kualitas)`
              : previewKomObj.nama,
            updated_commodities_count: multiResult.updatedCommoditiesCount,
            affected_kab_count: multiResult.totalAffectedKabEntries,
            uploaded_by: currentUser.email || currentUser.name || 'Admin Provinsi'
          }
        });
      } catch (err: any) {
        setParseError(err.message || 'Gagal mengunggah dokumen ke Supabase Storage.');
        setIsProcessing(false);
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    onApplyData(multiResult.updatedDatabase, activeTab, {
      updatedCommoditiesCount: multiResult.updatedCommoditiesCount,
      isMultiCommodity: multiResult.isMultiCommodity
    });
    setSelectedFile(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shadow-xs">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-white">
                  Upload &amp; Template Rekonda Lintas Tahun
                </h4>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                  IKK 2026/2027
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sinkronisasi data tahun berjalan (Harga 2027) dan tahun sebelumnya (Harga 2026) untuk seluruh komoditas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auth Notice */}
        {!currentUser.isOwner && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Mode Terbatas: Anda dapat melihat pratinjau. Masuk sebagai Admin Provinsi untuk menyimpan permanen.</span>
            </div>
            {onQuickLoginAsOwner ? (
              <button
                type="button"
                onClick={onQuickLoginAsOwner}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-md shadow-2xs whitespace-nowrap cursor-pointer"
              >
                Masuk sebagai Admin Provinsi
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-md shadow-2xs whitespace-nowrap cursor-pointer"
              >
                Masuk
              </button>
            )}
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Main 2-Tab Navigation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
            {/* Tab 1: Template Harga Tahun Berjalan (Harga 2027) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('tabel71');
                setFileName('');
                setSelectedFile(null);
                setMultiResult(null);
                setParseError('');
                setSuccessInfo('');
              }}
              className={`p-3 rounded-lg text-left transition-all cursor-pointer ${
                activeTab === 'tabel71'
                  ? 'bg-white shadow-sm border border-slate-200'
                  : 'hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  1. Template Harga Tahun Berjalan
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  Harga 2027
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Data <strong>Tahun Berjalan</strong> (TW III &amp; IV 2026, TW I &amp; II 2027) dimasukkan otomatis ke kolom <strong>Harga 2027</strong> untuk seluruh komoditas.
              </p>
            </button>

            {/* Tab 2: Data Tahun Sebelumnya -> Harga 2026 */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('rekonda26');
                setFileName('');
                setSelectedFile(null);
                setMultiResult(null);
                setParseError('');
                setSuccessInfo('');
              }}
              className={`p-3 rounded-lg text-left transition-all cursor-pointer ${
                activeTab === 'rekonda26'
                  ? 'bg-white shadow-sm border border-slate-200'
                  : 'hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                  2. Template Harga Tahun Sebelumnya
                </span>
                <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-full">
                  Harga 2026
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Data <strong>Tahun Sebelumnya</strong> (Rekonnas Responden &amp; Webentry) dimasukkan ke kolom <strong>Harga 2026</strong> untuk seluruh komoditas.
              </p>
            </button>
          </div>

          {/* Sub-selector for 2026 Sources */}
          {activeTab === 'rekonda26' && (
            <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  Pilih Format Template Data 2026:
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {source2026 === 'auto_merge'
                    ? 'Gabungan Rekonnas + Webentry'
                    : source2026 === 'rekonnas'
                    ? 'IKK Rekonda Responden (Final)'
                    : 'Database Webentry (Lengkap)'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSource2026('auto_merge')}
                  className={`p-2 rounded-lg text-left text-xs transition-colors cursor-pointer border ${
                    source2026 === 'auto_merge'
                      ? 'bg-white border-sky-500 text-sky-900 font-bold shadow-2xs'
                      : 'bg-white/60 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Otomatis Gabung</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Rekonnas sebagai prioritas utama, Webentry sebagai pelengkap
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSource2026('rekonnas')}
                  className={`p-2 rounded-lg text-left text-xs transition-colors cursor-pointer border ${
                    source2026 === 'rekonnas'
                      ? 'bg-white border-sky-500 text-sky-900 font-bold shadow-2xs'
                      : 'bg-white/60 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FileText className="w-3.5 h-3.5 text-sky-600" />
                    <span>IKK Rekonda Responden</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Format mikrodata responden hasil Rekonnas final
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSource2026('webentry')}
                  className={`p-2 rounded-lg text-left text-xs transition-colors cursor-pointer border ${
                    source2026 === 'webentry'
                      ? 'bg-white border-sky-500 text-sky-900 font-bold shadow-2xs'
                      : 'bg-white/60 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Database Webentry</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Format tarikan Webentry dengan kode kualitas lengkap
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Clean Template Download Strip */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {activeTab === 'tabel71'
                    ? 'Template Harga Tahun Berjalan'
                    : source2026 === 'webentry'
                    ? 'Template Database IKK 2026 Webentry'
                    : 'Template IKK Rekonda Responden 2026'}
                </span>
                <span className="text-[11px] text-slate-600 font-medium">
                  (Contoh: {selectedKomoditas.nama})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'tabel71') {
                    downloadTemplateTabel71(currentData, selectedKomoditas, 'xlsx');
                  } else if (source2026 === 'webentry') {
                    downloadTemplateIKKWebentry(currentData, selectedKomoditas, 'xlsx');
                  } else {
                    downloadTemplateIKKResponden(currentData, selectedKomoditas, 'xlsx');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Unduh Template (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'tabel71') {
                    downloadTemplateTabel71(currentData, selectedKomoditas, 'csv');
                  } else if (source2026 === 'webentry') {
                    downloadTemplateIKKWebentry(currentData, selectedKomoditas, 'csv');
                  } else {
                    downloadTemplateIKKResponden(currentData, selectedKomoditas, 'csv');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                <span>Unduh Template (.csv)</span>
              </button>
            </div>
          </div>

          {/* Quick Load Official Files Strip */}
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">
              Data Resmi Tersedia di Sistem (Seluruh Komoditas):
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'tabel71' ? (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleLoadSample('tabel71')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Muat Data Harga Tahun Berjalan</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleLoadSample('auto_merge')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-sky-900 bg-sky-100 hover:bg-sky-200 border border-sky-300 rounded-md shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sinkron Gabungan (Rekonnas + Webentry)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleLoadSample('rekonnas')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>IKK Rekonda Responden</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleLoadSample('webentry')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>IKK Webentry</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Direct File Upload Dropzone (Tempel Teks removed) */}
          <div className="border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl p-5 text-center bg-slate-50/50 transition-colors">
            <input
              id="file-upload-input"
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="file-upload-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-800">
                {fileName ? (
                  <span className="text-emerald-700">{fileName}</span>
                ) : (
                  <span>Pilih berkas Excel (.xlsx, .xls) atau CSV (.csv) dari perangkat Anda</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Mendukung unggah sekaligus seluruh 89 komoditas/kualitas maupun satu komoditas tertentu
              </p>
            </label>
          </div>

          {/* Feedback Notices */}
          {parseError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Peringatan:</span>
                <p>{parseError}</p>
              </div>
            </div>
          )}

          {successInfo && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successInfo}</span>
            </div>
          )}

          {/* SINGLE Preview Comparison Table */}
          {parseResult && parseResult.comparison.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Pratinjau [{previewKomObj.kode}] {previewKomObj.nama}: Kolom{' '}
                    {activeTab === 'tabel71' ? 'Harga 2027 (Tahun Berjalan)' : 'Harga 2026 (Tahun Lalu)'}
                  </span>
                </h5>
                <div className="flex items-center gap-1.5">
                  {multiResult?.isMultiCommodity && (
                    <span className="text-xs bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded">
                      Seluruh {multiResult.updatedCommoditiesCount} Komoditas Siap Diterapkan
                    </span>
                  )}
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                    {parseResult.affectedKabCount} Kab/Kota Terisi
                  </span>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2">Kode</th>
                      <th className="p-2">Kabupaten / Kota</th>
                      <th className="p-2 text-right">
                        {activeTab === 'tabel71' ? 'Harga 2027 Lama' : 'Harga 2026 Lama'}
                      </th>
                      <th className="p-2 text-right bg-emerald-50 text-emerald-900">
                        {activeTab === 'tabel71' ? 'Harga 2027 Baru' : 'Harga 2026 Baru'}
                      </th>
                      <th className="p-2 text-right">Selisih</th>
                      <th className="p-2 text-right">Rasio Baru</th>
                      <th className="p-2">Rincian Triwulan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {parseResult.comparison.map((item) => (
                      <tr key={item.kode} className="hover:bg-slate-50">
                        <td className="p-2 font-bold text-slate-600">{item.kode}</td>
                        <td className="p-2 font-sans font-semibold text-slate-900">{item.nama}</td>
                        <td className="p-2 text-right text-slate-500">
                          {item.oldValue > 0 ? `Rp ${formatRupiahNumber(item.oldValue)}` : '-'}
                        </td>
                        <td className="p-2 text-right font-bold text-emerald-700 bg-emerald-50/50">
                          {item.newValue > 0 ? `Rp ${formatRupiahNumber(item.newValue)}` : '-'}
                        </td>
                        <td className="p-2 text-right">
                          {item.newValue > 0 || item.oldValue > 0 ? (
                            <span
                              className={
                                item.diff > 0
                                  ? 'text-rose-600 font-bold'
                                  : item.diff < 0
                                  ? 'text-sky-600 font-bold'
                                  : 'text-slate-400'
                              }
                            >
                              {item.diff > 0 ? '+' : ''}
                              {formatRupiahNumber(item.diff)} ({item.percentDiff > 0 ? '+' : ''}
                              {formatPercent(item.percentDiff)}%)
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-bold text-slate-800">
                          {item.newRasio > 0 ? `${formatPercent(item.newRasio)}%` : '-'}
                        </td>
                        <td
                          className="p-2 font-sans text-[10px] text-slate-500 truncate max-w-[220px]"
                          title={item.quartersDetail}
                        >
                          {item.quartersDetail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Target Kolom:{' '}
            <strong>
              {activeTab === 'tabel71' ? 'Harga 2027 (Tahun Berjalan)' : 'Harga 2026 (Basis IKK)'}
            </strong>
            {multiResult?.isMultiCommodity && (
              <span className="ml-1.5 text-emerald-700 font-semibold">
                · {multiResult.updatedCommoditiesCount} komoditas akan diperbarui
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              Tutup / Batal
            </button>
            <button
              type="button"
              disabled={!multiResult || multiResult.totalAffectedKabEntries === 0 || isProcessing}
              onClick={handleProcessUpload}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>
                {activeTab === 'tabel71'
                  ? 'Terapkan ke Kolom Harga 2027'
                  : 'Terapkan ke Kolom Harga 2026'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
