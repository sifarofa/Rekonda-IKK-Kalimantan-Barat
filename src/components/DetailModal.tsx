import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  Check,
  Save,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calculator
} from 'lucide-react';
import { KabupatenRekon, RespondenData, Komoditas, TipeSewaAlat, UserAuth } from '../types/rekonda';
import { formatRupiahNumber, formatRupiahCurrency, formatPercent } from '../utils/formatters';
import { getSewaAlatKabStatus, isSewaAlatKomoditas } from '../utils/sewaAlatCalculator';
import {
  getKab2026RefMeta,
  getRespondent2026Eval,
  normalizeBrand,
  Respondent2026Eval
} from '../utils/rekonComparison';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kabupaten: KabupatenRekon;
  komoditas: Komoditas;
  onUpdateKabupaten: (updated: KabupatenRekon) => void;
  onOpenAddRespondent: (defaultTahun?: number, defaultTw?: number) => void;
  onOpenEditRespondent: (item: RespondenData) => void;
  onDeleteRespondent: (id: string) => void;
  onChangeRespondentTipeSewa?: (
    kabupatenKode: string,
    respondentId: string,
    nextTipe: TipeSewaAlat
  ) => void;
  onBatchChangeAllRespondentsTipeSewa?: (
    kabupatenKode: string,
    nextTipe: TipeSewaAlat
  ) => void;
  onOpenLkForRespondent?: (
    komoditasKode: string,
    kabupatenKode: string,
    respondentId?: string
  ) => void;
  currentUser: UserAuth;
  onOpenAuth: () => void;
}

type RespondentSortField = 'tahun' | 'triwulan' | 'nama' | 'merk' | 'harga';
type Status2026Filter = 'all' | 'final' | 'merek_acuan' | 'non_final';

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  kabupaten,
  komoditas,
  onUpdateKabupaten,
  onOpenAddRespondent,
  onOpenEditRespondent,
  onDeleteRespondent,
  onChangeRespondentTipeSewa,
  onBatchChangeAllRespondentsTipeSewa,
  onOpenLkForRespondent,
  currentUser,
  onOpenAuth
}) => {
  const isSewaAlat = isSewaAlatKomoditas(komoditas.kode);
  const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';
  const canConfirmSewa =
    currentUser.isLoggedIn &&
    (isPemilik || (currentUser.role === 'kabupaten' && currentUser.kabupatenKode === kabupaten?.kode));
  const kabSewaStatus = useMemo(
    () => (kabupaten ? getSewaAlatKabStatus(kabupaten) : null),
    [kabupaten]
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMerk, setSelectedMerk] = useState<string>('all');
  const [status2026Filter, setStatus2026Filter] = useState<Status2026Filter>('all');
  const [entriesPerPage, setEntriesPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);
  const [noteContent, setNoteContent] = useState<string>(kabupaten?.catatan || '');
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  // Sorting inside respondent table
  const [sortField, setSortField] = useState<RespondentSortField>('triwulan');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // 2026 Reference Meta (Merek Acuan & Final Respondents)
  const refMeta26 = useMemo(
    () => getKab2026RefMeta(kabupaten.kode, komoditas.kode, kabupaten),
    [kabupaten, komoditas.kode]
  );

  const normalizedAcuanSet = useMemo(
    () => new Set(refMeta26.merekAcuanList.map((b) => normalizeBrand(b))),
    [refMeta26.merekAcuanList]
  );

  // Precompute 2026 evaluation for every respondent row
  const respondentEvalMap = useMemo(() => {
    const map = new Map<string, Respondent2026Eval>();
    (kabupaten?.respondents || []).forEach((r) => {
      map.set(r.id, getRespondent2026Eval(kabupaten.kode, komoditas.kode, r, kabupaten));
    });
    return map;
  }, [kabupaten, komoditas.kode]);

  const evalSummary = useMemo(() => {
    const resList = kabupaten?.respondents || [];
    let finalCount = 0;
    let nonFinalWebCount = 0;
    let nonFinalMerekCount = 0;
    let baruCount = 0;
    let acuanCount = 0;
    const finalPrices: number[] = [];
    const acuanPrices: number[] = [];

    resList.forEach((r) => {
      const ev = respondentEvalMap.get(r.id);
      if (!ev) return;
      if (ev.status2026 === 'final') {
        finalCount++;
        if (r.harga > 0) finalPrices.push(r.harga);
      } else if (ev.status2026 === 'non_final_webentry') {
        nonFinalWebCount++;
      } else if (ev.status2026 === 'non_final_merek') {
        nonFinalMerekCount++;
      } else {
        baruCount++;
      }
      if (ev.matchesMerekAcuan) {
        acuanCount++;
        if (r.harga > 0) acuanPrices.push(r.harga);
      }
    });

    const finalAvg =
      finalPrices.length > 0
        ? Math.round(finalPrices.reduce((a, b) => a + b, 0) / finalPrices.length)
        : 0;
    const finalRasio =
      finalAvg > 0 && kabupaten.harga2026 > 0
        ? parseFloat(((finalAvg / kabupaten.harga2026) * 100).toFixed(2))
        : 0;

    const acuanAvg =
      acuanPrices.length > 0
        ? Math.round(acuanPrices.reduce((a, b) => a + b, 0) / acuanPrices.length)
        : 0;
    const acuanRasio =
      acuanAvg > 0 && kabupaten.harga2026 > 0
        ? parseFloat(((acuanAvg / kabupaten.harga2026) * 100).toFixed(2))
        : 0;

    return {
      total: resList.length,
      finalCount,
      nonFinalWebCount,
      nonFinalMerekCount,
      baruCount,
      nonFinalTotal: nonFinalWebCount + nonFinalMerekCount + baruCount,
      acuanCount,
      finalAvg,
      finalRasio,
      acuanAvg,
      acuanRasio
    };
  }, [kabupaten?.respondents, kabupaten?.harga2026, respondentEvalMap]);

  // Extract unique brands for brand filter
  const availableMerks = useMemo(() => {
    const set = new Set<string>();
    (kabupaten?.respondents || []).forEach((r) => {
      if (r.merk && r.merk.trim() !== '' && r.merk.trim() !== '-') {
        set.add(r.merk.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [kabupaten?.respondents]);

  // Sync note and reset filters when kabupaten changes
  React.useEffect(() => {
    setNoteContent(kabupaten?.catatan || '');
    setIsEditingNote(false);
    setSelectedMerk('all');
    setStatus2026Filter('all');
    setCurrentPage(1);
  }, [kabupaten?.id, kabupaten?.catatan]);

  const handleSort = (field: RespondentSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Filter & Sort respondents
  const sortedAndFilteredRespondents = useMemo(() => {
    let list = [...(kabupaten?.respondents || [])];

    // Filter by Brand / Merek
    if (selectedMerk !== 'all') {
      list = list.filter((r) => (r.merk || '').trim().toLowerCase() === selectedMerk.trim().toLowerCase());
    }

    // Filter by 2026 Final Participation Status
    if (status2026Filter === 'final') {
      list = list.filter((r) => respondentEvalMap.get(r.id)?.status2026 === 'final');
    } else if (status2026Filter === 'merek_acuan') {
      list = list.filter((r) => respondentEvalMap.get(r.id)?.matchesMerekAcuan);
    } else if (status2026Filter === 'non_final') {
      list = list.filter((r) => respondentEvalMap.get(r.id)?.status2026 !== 'final');
    }

    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.nama.toLowerCase().includes(q) ||
          r.merk.toLowerCase().includes(q) ||
          r.tahun.toString().includes(q) ||
          r.triwulan.toString().includes(q) ||
          r.harga.toString().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return list;
  }, [kabupaten?.respondents, selectedMerk, status2026Filter, respondentEvalMap, searchTerm, sortField, sortDir]);

  const filteredAvgStats = useMemo(() => {
    const valid = sortedAndFilteredRespondents.map((r) => r.harga).filter((p) => p > 0);
    if (valid.length === 0) return null;
    const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    const rasio = kabupaten.harga2026 > 0 ? parseFloat(((avg / kabupaten.harga2026) * 100).toFixed(2)) : 0;
    return { avg, rasio, count: valid.length };
  }, [sortedAndFilteredRespondents, kabupaten.harga2026]);

  // Pagination
  const totalEntries = sortedAndFilteredRespondents.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage) || 1;
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const currentRows = sortedAndFilteredRespondents.slice(startIndex, endIndex);

  // Save Note Handler
  const handleSaveNote = () => {
    if (!currentUser.isLoggedIn) {
      onOpenAuth();
      return;
    }
    onUpdateKabupaten({
      ...kabupaten,
      catatan: noteContent
    });
    setIsEditingNote(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const isRekonSelesai = kabupaten.statusRekon === 'rekon_selesai' || Boolean(kabupaten.isVerified);

  // Toggle Verified: 2 states: 'rekon_selesai' and 'belum_rekon'
  const handleToggleVerify = () => {
    if (!currentUser.isLoggedIn) {
      onOpenAuth();
      return;
    }
    const canToggle =
      currentUser.isOwner ||
      (currentUser.role === 'kabupaten' && currentUser.kabupatenKode === kabupaten.kode);

    if (!canToggle) {
      alert('Perubahan status rekon hanya dapat dilakukan oleh Admin Provinsi atau Admin Kab/Kota wilayah terkait.');
      return;
    }

    const nextState = !isRekonSelesai;
    onUpdateKabupaten({
      ...kabupaten,
      isVerified: nextState,
      statusRekon: nextState ? 'rekon_selesai' : 'belum_rekon'
    });
  };

  const renderSortIcon = (field: RespondentSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-600 inline ml-0.5" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-rose-600 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 text-rose-600 inline ml-0.5" />
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      {/* Modal Dialog Box */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-start justify-between border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <span>Detail Rekonda</span>
              {isRekonSelesai && (
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Rekon Selesai
                </span>
              )}
            </h3>
            <div className="mt-1 space-y-0.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Kab/Kota :</span>
                <span className="font-semibold text-white font-mono">[{kabupaten.kode}] {kabupaten.nama}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Kualitas Rekon :</span>
                <span className="font-semibold text-rose-300 font-mono">[{komoditas.kode}] {komoditas.nama} ({komoditas.satuan})</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[78vh] overflow-y-auto">
          {/* Quick Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4 text-xs">
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div>
                <span className="text-slate-500 block text-[10px]">Harga 2027 (Berjalan):</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatRupiahCurrency(kabupaten.harga2027)}
                </span>
              </div>
              <div className="sm:border-l border-slate-200 sm:pl-4">
                <span className="text-slate-500 block text-[10px]">Harga 2026 (Thn Lalu):</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {kabupaten.harga2026 > 0 ? formatRupiahCurrency(kabupaten.harga2026) : '-'}
                </span>
              </div>
              <div className="sm:border-l border-slate-200 sm:pl-4">
                <span className="text-slate-500 block text-[10px]">Rasio ke 2026:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {kabupaten.harga2026 > 0 ? `${formatPercent(kabupaten.rasio)}%` : '-'}
                </span>
              </div>
              <div className="sm:border-l border-slate-200 sm:pl-4">
                <span className="text-slate-500 block text-[10px]">Koefisien Variasi:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatPercent(kabupaten.koefisienVariasi)}%
                </span>
              </div>
              <div className="sm:border-l border-slate-200 sm:pl-4">
                <span className="text-slate-500 block text-[10px]">Merek Terbanyak:</span>
                <span className="font-bold text-slate-800 text-xs truncate block max-w-[120px]">
                  {kabupaten.namaKualitas || 'Standar'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1">
              <div className="text-slate-500 text-[11px] font-mono">
                Total {kabupaten.respondents.length} entri responden survei
              </div>
              {(selectedMerk !== 'all' || status2026Filter !== 'all' || searchTerm.trim() !== '') && filteredAvgStats && (
                <div className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded">
                  Hasil Filter ({filteredAvgStats.count} entri): {formatRupiahCurrency(filteredAvgStats.avg)}
                  {kabupaten.harga2026 > 0 ? ` · Rasio ${formatPercent(filteredAvgStats.rasio)}%` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Ringkasan Basis Perbandingan '26 vs '27 (Clean Compact Strip) */}
          {!isSewaAlat &&
            kabupaten.respondents.length > 0 &&
            (evalSummary.nonFinalTotal > 0 || refMeta26.merekAcuanList.length > 0) && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-600">
                  <span className="font-semibold text-slate-800">Basis '26 vs '27:</span>
                  {refMeta26.merekAcuanList.length > 0 && (
                    <span
                      className="text-indigo-700 font-medium"
                      title={`Merek acuan pada perhitungan final IKK Rekonda 2026: ${refMeta26.merekAcuanList.join(', ')}`}
                    >
                      Acuan '26: <strong className="font-mono">{refMeta26.merekAcuanList.join(', ')}</strong>
                    </span>
                  )}
                  {refMeta26.merekAcuanList.length > 0 && evalSummary.nonFinalTotal > 0 && (
                    <span className="text-slate-300">·</span>
                  )}
                  {evalSummary.nonFinalTotal > 0 && (
                    <span
                      className="text-slate-500"
                      title="Sebagian responden pada pengumpulan 2027 tidak masuk perhitungan final 2026 (Webentry, non-acuan, atau responden baru). Seluruh entri tetap tersimpan."
                    >
                      {[
                        evalSummary.finalCount > 0 ? `${evalSummary.finalCount} Final '26` : null,
                        evalSummary.nonFinalWebCount > 0 ? `${evalSummary.nonFinalWebCount} Webentry` : null,
                        evalSummary.nonFinalMerekCount > 0 ? `${evalSummary.nonFinalMerekCount} Non-Acuan` : null,
                        evalSummary.baruCount > 0 ? `${evalSummary.baruCount} Baru '27` : null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </div>

                <div className="inline-flex flex-wrap items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus2026Filter('all');
                      setSelectedMerk('all');
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                      status2026Filter === 'all' && selectedMerk === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Semua ({evalSummary.total})
                  </button>
                  {evalSummary.finalCount > 0 && evalSummary.finalCount < evalSummary.total && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatus2026Filter('final');
                        setSelectedMerk('all');
                        setCurrentPage(1);
                      }}
                      title="Hitung rata-rata khusus responden yang ikut perhitungan final IKK Rekonda 2026 (Apple-to-Apple)"
                      className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                        status2026Filter === 'final'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-slate-200'
                      }`}
                    >
                      Final '26: Rp {formatRupiahNumber(evalSummary.finalAvg)}
                      {evalSummary.finalRasio > 0 ? ` (${formatPercent(evalSummary.finalRasio)}%)` : ''}
                    </button>
                  )}
                  {refMeta26.merekAcuanList.length > 0 &&
                    evalSummary.acuanCount > 0 &&
                    evalSummary.acuanCount < evalSummary.total && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatus2026Filter('merek_acuan');
                          setSelectedMerk('all');
                          setCurrentPage(1);
                        }}
                        title={`Hitung rata-rata khusus responden bermerek acuan (${refMeta26.merekAcuanList.join(', ')})`}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                          status2026Filter === 'merek_acuan'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-slate-200'
                        }`}
                      >
                        Acuan '26: Rp {formatRupiahNumber(evalSummary.acuanAvg)}
                        {evalSummary.acuanRasio > 0 ? ` (${formatPercent(evalSummary.acuanRasio)}%)` : ''}
                      </button>
                    )}
                </div>
              </div>
            )}

          {/* Per-Respondent Sewa Alat Confirmation Banner (Codes 5101 - 5803) */}
          {isSewaAlat && kabSewaStatus && (
            <div
              className={`mb-4 rounded-lg border p-3 text-xs space-y-2 ${
                kabSewaStatus.allPure
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-amber-50/90 border-amber-300'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-slate-900">
                    Konfirmasi Sewa Alat per Responden:
                  </span>
                  <span className="font-mono text-[10px] font-extrabold bg-white border border-slate-300 px-2 py-0.5 rounded">
                    Siap Murni: {kabSewaStatus.pureCount} / {kabSewaStatus.total || 0}
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded">
                    Sewa Murni: {kabSewaStatus.murniCount}
                  </span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded">
                    All-In (Sudah LK): {kabSewaStatus.allInComputedCount}
                  </span>
                  {kabSewaStatus.waitingLkCount > 0 && (
                    <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                      All-In (Menunggu LK): {kabSewaStatus.waitingLkCount}
                    </span>
                  )}
                  {kabSewaStatus.belumKonfCount > 0 && (
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      Belum Konf: {kabSewaStatus.belumKonfCount}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {canConfirmSewa &&
                    onBatchChangeAllRespondentsTipeSewa &&
                    kabupaten.respondents.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onBatchChangeAllRespondentsTipeSewa(kabupaten.kode, 'sewa_murni')
                          }
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors cursor-pointer"
                        >
                          Semua Sewa Murni
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onBatchChangeAllRespondentsTipeSewa(kabupaten.kode, 'all_in')
                          }
                          className="px-2 py-1 rounded bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 font-bold text-[10px] transition-colors cursor-pointer"
                        >
                          Semua All-In
                        </button>
                      </>
                    )}
                  {isPemilik && onOpenLkForRespondent && (
                    <button
                      type="button"
                      onClick={() => onOpenLkForRespondent(komoditas.kode, kabupaten.kode)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[10px] shadow-2xs transition-colors cursor-pointer"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>Buka LK Sewa Alat</span>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-700">
                {kabSewaStatus.allPure ? (
                  <span className="text-emerald-900 font-semibold">
                    ✓ Seluruh responden di kab/kota ini sudah berstatus Sewa Murni. Nilai Harga 2027, CV, dan Rasio pada Tabel Rekon Daerah utama telah dihitung otomatis.
                  </span>
                ) : (
                  <span>
                    Konfirmasikan <strong>Sewa Murni</strong> atau <strong>All-In</strong> di setiap baris responden. Responden All-In akan dihitung di LK oleh Admin Provinsi. Setelah seluruh responden siap Sewa Murni, Tabel Rekon Daerah utama akan terhitung otomatis.
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Table Controls (Tampilkan X entri, Filter Merek & Cari box) */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-600">
              <div className="flex items-center gap-1.5">
                <span>tampilkan</span>
                <select
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>entri</span>
              </div>

              {/* Filter Merek Dropdown */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-merek" className="font-semibold text-slate-700 whitespace-nowrap">
                  Filter Merek:
                </label>
                <select
                  id="filter-merek"
                  value={selectedMerk}
                  onChange={(e) => {
                    setSelectedMerk(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer max-w-[210px] truncate font-medium"
                >
                  <option value="all">Semua Merek ({availableMerks.length > 0 ? availableMerks.length : 'Semua'})</option>
                  {availableMerks.map((m) => {
                    const isAcuan = normalizedAcuanSet.has(normalizeBrand(m));
                    return (
                      <option key={m} value={m}>
                        {isAcuan ? `★ ${m} (Acuan '26)` : m}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Filter Status Finalisasi 2026 */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-status26" className="font-semibold text-slate-700 whitespace-nowrap">
                  Status '26:
                </label>
                <select
                  id="filter-status26"
                  value={status2026Filter}
                  onChange={(e) => {
                    setStatus2026Filter(e.target.value as Status2026Filter);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer font-medium"
                >
                  <option value="all">Semua ({evalSummary.total})</option>
                  <option value="final">✓ Ikut Final '26 ({evalSummary.finalCount})</option>
                  {refMeta26.merekAcuanList.length > 0 && (
                    <option value="merek_acuan">★ Merek Acuan '26 ({evalSummary.acuanCount})</option>
                  )}
                  <option value="non_final">⚠ Non-Final '26 / Baru ({evalSummary.nonFinalTotal})</option>
                </select>
              </div>

              <span className="text-[11px] text-slate-400 hidden lg:inline">
                (Klik judul kolom untuk sortir)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="search-modal" className="font-semibold text-slate-700">
                Cari:
              </label>
              <div className="relative">
                <input
                  id="search-modal"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Cari responden / merek..."
                  className="bg-white border border-slate-300 rounded-md pl-2.5 pr-7 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 w-44"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table Responden (Side-by-side with 2026 Respondent Data) */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg mb-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-center select-none">
                  {/* Sortable: Tahun */}
                  <th
                    onClick={() => handleSort('tahun')}
                    className="py-2.5 px-2.5 text-center whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors group"
                  >
                    <span>Tahun</span> {renderSortIcon('tahun')}
                  </th>

                  {/* Sortable: Triwulan */}
                  <th
                    onClick={() => handleSort('triwulan')}
                    className="py-2.5 px-2.5 text-center whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors group"
                  >
                    <span>Triwulan</span> {renderSortIcon('triwulan')}
                  </th>

                  {/* Sortable: Responden */}
                  <th
                    onClick={() => handleSort('nama')}
                    className="py-2.5 px-3 text-left whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors group"
                  >
                    <span>Responden</span> {renderSortIcon('nama')}
                  </th>

                  {/* Sortable: Merk */}
                  <th
                    onClick={() => handleSort('merk')}
                    className="py-2.5 px-3 text-left whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors group"
                  >
                    <span>Merk</span> {renderSortIcon('merk')}
                  </th>

                  {/* Sortable: Harga 2027 */}
                  <th
                    onClick={() => handleSort('harga')}
                    className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors group"
                  >
                    <span>Harga '27 (Rp)</span> {renderSortIcon('harga')}
                  </th>

                  {/* Harga 2026 (Tahun Lalu) */}
                  <th className="py-2.5 px-3 text-right whitespace-nowrap bg-slate-50">
                    <span>Harga '26 (Rp)</span>
                  </th>

                  {/* Rasio */}
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <span>Rasio</span>
                  </th>

                  {/* Jenis Sewa (Khusus 5101 - 5803) */}
                  {isSewaAlat && (
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      <span>Jenis Sewa</span>
                    </th>
                  )}

                  {/* Aksi */}
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan={isSewaAlat ? 9 : 8} className="py-6 text-center text-slate-500 font-medium">
                      Belum ada data responden untuk filter ini. Silakan klik tombol tambah di bawah.
                    </td>
                  </tr>
                ) : (
                  currentRows.map((item, idx) => {
                    const prevData =
                      respondentEvalMap.get(item.id) ||
                      getRespondent2026Eval(kabupaten.kode, komoditas.kode, item, kabupaten);
                    const prevHarga = prevData.harga;
                    const respRasio = prevHarga && prevHarga > 0 ? (item.harga / prevHarga) * 100 : null;
                    const hasLkMurni =
                      isSewaAlat &&
                      item.tipeSewa === 'all_in' &&
                      Boolean(item.lkSewaAlat) &&
                      (item.lkSewaAlat?.hasilSewaMurniBulan ?? 0) > 0;

                    const isNonFinal = prevData.status2026 !== 'final';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        <td className="py-2 px-2.5 text-center font-mono font-medium text-slate-700">
                          {item.tahun}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-medium text-slate-700">
                          TW {item.triwulan}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {item.nama}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          <div>{item.merk || '-'}</div>
                          {refMeta26.merekAcuanList.length > 0 && prevData.matchesMerekAcuan && (
                            <div
                              className="text-[10px] font-medium text-indigo-600 mt-0.5"
                              title={`Sesuai Merek Acuan Final 2026: ${refMeta26.merekAcuanList.join(', ')}`}
                            >
                              • Acuan '26
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          <div>{formatRupiahNumber(item.harga)}</div>
                          {hasLkMurni && item.lkSewaAlat?.hargaAwalSebelumLk && (
                            <div className="text-[9.5px] font-sans font-semibold text-amber-800 mt-0.5">
                              <span className="bg-amber-100 border border-amber-300 rounded px-1 mr-1">
                                LK Murni
                              </span>
                              <span className="text-slate-500 line-through font-mono">
                                {formatRupiahNumber(item.lkSewaAlat.hargaAwalSebelumLk)}
                              </span>
                            </div>
                          )}
                          {isSewaAlat && item.tipeSewa === 'all_in' && !hasLkMurni && (
                            <div className="text-[9.5px] font-sans font-bold text-rose-700 bg-rose-100 border border-rose-200 rounded px-1 inline-block mt-0.5">
                              Menunggu LK
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-700 tabular-nums bg-slate-50/60">
                          {prevHarga !== null ? (
                            <div>
                              <span
                                className={isNonFinal ? 'text-slate-500' : 'text-slate-800 font-semibold'}
                                title={
                                  prevData.sourceText
                                    ? `Sumber: ${prevData.sourceText}${isNonFinal ? ' (Tidak ikut hitungan final 2026)' : ' (Ikut hitungan final 2026)'}`
                                    : undefined
                                }
                              >
                                {formatRupiahNumber(prevHarga)}
                              </span>
                              {!isSewaAlat && (
                                <div
                                  className={`font-sans text-[10px] font-medium mt-0.5 ${
                                    prevData.status2026 === 'final'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                  title={
                                    prevData.status2026 === 'final'
                                      ? 'Responden ini masuk dalam perhitungan final IKK Rekonda 2026.'
                                      : prevData.status2026 === 'non_final_webentry'
                                      ? 'Responden ini tahun lalu hanya tercatat di Webentry dan tidak ikut perhitungan final IKK Rekonda 2026.'
                                      : `Merek berbeda dari Merek Acuan final 2026 (${refMeta26.merekAcuanList.join(', ')}).`
                                  }
                                >
                                  {prevData.status2026 === 'final'
                                    ? "Final '26"
                                    : prevData.status2026 === 'non_final_webentry'
                                    ? 'Webentry (Non-Final)'
                                    : "Non-Acuan '26"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="text-slate-400 font-mono" title="Responden tidak ditemukan di database 2026">-</span>
                              {!isSewaAlat && (
                                <div className="font-sans text-[10px] text-slate-400 mt-0.5">
                                  Baru '27
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                          {respRasio !== null ? (
                            <span
                              className={`font-semibold ${
                                respRasio > 120
                                  ? 'text-rose-700'
                                  : respRasio < 80
                                  ? 'text-emerald-700'
                                  : 'text-slate-700'
                              }`}
                            >
                              {formatPercent(respRasio)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">-</span>
                          )}
                        </td>

                        {/* Jenis Sewa per Responden */}
                        {isSewaAlat && (
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            {onChangeRespondentTipeSewa ? (
                              <select
                                disabled={!canConfirmSewa}
                                value={item.tipeSewa || 'belum_konfirmasi'}
                                onChange={(e) =>
                                  onChangeRespondentTipeSewa(
                                    kabupaten.kode,
                                    item.id,
                                    e.target.value as TipeSewaAlat
                                  )
                                }
                                className={`text-[10px] font-bold rounded px-1.5 py-1 border transition-colors ${
                                  item.tipeSewa === 'all_in'
                                    ? hasLkMurni
                                      ? 'bg-amber-100 text-amber-950 border-amber-400'
                                      : 'bg-rose-50 text-rose-800 border-rose-300'
                                    : item.tipeSewa === 'sewa_murni'
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                                    : 'bg-slate-100 text-slate-600 border-slate-300'
                                } ${!canConfirmSewa ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <option value="belum_konfirmasi">? Belum Konf.</option>
                                <option value="sewa_murni">✓ Sewa Murni</option>
                                <option value="all_in">{isPemilik ? '⚙ All-In (LK)' : '⚙ All-In'}</option>
                              </select>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        )}

                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* LK Calculator for Admin Provinsi */}
                            {isSewaAlat && isPemilik && onOpenLkForRespondent && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenLkForRespondent(komoditas.kode, kabupaten.kode, item.id)
                                }
                                title="Hitung Sewa Murni Responden Ini di LK (Khusus Admin Provinsi)"
                                className="w-6 h-6 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Yellow Edit Pencil button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser.isOwner) {
                                  alert('Perubahan data responden hanya dapat dilakukan oleh Admin Provinsi.');
                                  return;
                                }
                                onOpenEditRespondent(item);
                              }}
                              title="Edit Data Responden"
                              className="w-6 h-6 rounded bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-amber-950 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>

                            {/* Red Delete Trash button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser.isOwner) {
                                  alert('Penghapusan responden hanya dapat dilakukan oleh Admin Provinsi.');
                                  return;
                                }
                                if (confirm(`Hapus data responden ${item.nama} (${formatRupiahCurrency(item.harga)})?`)) {
                                  onDeleteRespondent(item.id);
                                }
                              }}
                              title="Hapus Data Responden"
                              className="w-6 h-6 rounded bg-red-600 hover:bg-red-700 active:bg-red-800 text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 mb-5">
            <div>
              Menampilkan <strong className="font-mono text-slate-900">{totalEntries === 0 ? 0 : startIndex + 1}</strong> sampai{' '}
              <strong className="font-mono text-slate-900">{endIndex}</strong> dari{' '}
              <strong className="font-mono text-slate-900">{totalEntries}</strong> entri
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
              >
                Sebelumnya
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-6 h-6 rounded font-mono font-semibold transition-colors cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              <button
                type="button"
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>

          {/* Catatan Box (Matching Screenshot 2) */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Catatan Lapangan & Rekon</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser.isLoggedIn) {
                      onOpenAuth();
                      return;
                    }
                    setIsEditingNote((prev) => !prev);
                  }}
                  title={isEditingNote ? 'Batal Edit' : 'Edit Catatan'}
                  className="w-6 h-6 rounded bg-amber-400 hover:bg-amber-500 text-amber-950 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>

              {savedFeedback && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Catatan tersimpan ke server!
                </span>
              )}
            </div>

            {isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                  placeholder="Ketik catatan rekonsiliasi atau justifikasi harga di sini..."
                  className="w-full text-xs text-slate-800 p-3 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNoteContent(kabupaten.catatan || '');
                      setIsEditingNote(false);
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md shadow-2xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Catatan</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-700 min-h-[44px] bg-white border border-slate-200/80 rounded-md p-3 whitespace-pre-wrap">
                {kabupaten.catatan ? (
                  kabupaten.catatan
                ) : (
                  <span className="text-slate-400 italic">
                    Belum ada catatan untuk kabupaten ini. Klik tombol pensil kuning di atas untuk menambahkan catatan lapangan atau justifikasi harga.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons Row (Matching the 6 buttons at bottom of Screenshot 2) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            {/* Left: Yellow Tandai / Verifikasi button */}
            <button
              type="button"
              onClick={handleToggleVerify}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg shadow-2xs border transition-colors cursor-pointer ${
                isRekonSelesai
                  ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                  : 'bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-amber-950 border-amber-500/50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isRekonSelesai ? 'Telah Direkon (Batal)' : 'Tandai Rekon Selesai'}</span>
            </button>

            {/* Center/Right: Blue + Tambah buttons for specific Quarters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenAddRespondent(2026, 3)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>tambah 2026/3</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAddRespondent(2026, 4)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>tambah 2026/4</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAddRespondent(2027, 1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>tambah 2027/1</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAddRespondent(2027, 2)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>tambah 2027/2</span>
              </button>

              {/* Dark Gray Tutup button */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 active:bg-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer ml-1"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
