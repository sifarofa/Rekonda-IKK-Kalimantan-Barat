import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Search,
  FlaskConical,
  ArrowUpDown,
  AlertCircle,
  X,
  Calendar,
  CheckCircle2,
  Lock
} from 'lucide-react';
import {
  ActiveTriwulanKey,
  KabupatenRekon,
  Komoditas,
  Provinsi,
  UserAuth
} from '../types/rekonda';
import { KABUPATEN_KALBAR_LIST } from '../data/kabupatenList';
import { formatRupiahCurrency, formatRupiahNumber, formatPercent } from '../utils/formatters';

export type SimulasiPeriodeFilter = ActiveTriwulanKey | 'RATA_2027';
export type RankingMetricMode = 'indeks_rasio' | 'indeks_relatif' | 'skor_agregat';

interface SimulasiRankingViewProps {
  database: Record<string, KabupatenRekon[]>;
  provinsi: Provinsi;
  komoditasList: Komoditas[];
  activeTriwulan: ActiveTriwulanKey;
  currentUser: UserAuth;
  onOpenAuth?: () => void;
}

const PERIODE_OPTIONS: { value: SimulasiPeriodeFilter; label: string; shortLabel: string }[] = [
  { value: 'III-2026', label: 'TW III 2026', shortLabel: "TW III '26" },
  { value: 'IV-2026', label: 'TW IV 2026', shortLabel: "TW IV '26" },
  { value: 'I-2027', label: 'TW I 2027', shortLabel: "TW I '27" },
  { value: 'II-2027', label: 'TW II 2027', shortLabel: "TW II '27" },
  { value: 'RATA_2027', label: 'Rata-rata Harga 2027', shortLabel: 'Rata 2027' }
];

const getHargaForPeriode = (item: KabupatenRekon | undefined, periode: SimulasiPeriodeFilter): number => {
  if (!item) return 0;
  switch (periode) {
    case 'III-2026':
      return item.hargaTw3_2026 || 0;
    case 'IV-2026':
      return item.hargaTw4_2026 || 0;
    case 'I-2027':
      return item.hargaTw1_2027 || 0;
    case 'II-2027':
      return item.hargaTw2_2027 || 0;
    case 'RATA_2027':
    default:
      return item.harga2027 || 0;
  }
};

interface ComputedKabScore {
  kode: string;
  nama: string;
  ibukota: string;
  baseScore: number;
  simScore: number;
  baseIndeksRasio: number;
  simIndeksRasio: number;
  baseIndeksRelatif: number;
  simIndeksRelatif: number;
  baseAvgHarga: number;
  simAvgHarga: number;
  rasioPairsCount: number;
  filledCount: number;
  rekonSelesaiCount: number;
  progresRekonPct: number;
  overrideCount: number;
}

interface RankedKabRow extends ComputedKabScore {
  baselineRank: number;
  simRank: number;
  rankDelta: number;
  scoreDelta: number;
}

export const SimulasiRankingView: React.FC<SimulasiRankingViewProps> = ({
  database,
  provinsi,
  komoditasList,
  activeTriwulan,
  currentUser,
  onOpenAuth
}) => {
  const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';

  // Sandbox local state ONLY — never persisted or upserted to Supabase
  const [selectedPeriode, setSelectedPeriode] = useState<SimulasiPeriodeFilter>(activeTriwulan);
  const [rankingMetric, setRankingMetric] = useState<RankingMetricMode>('indeks_rasio');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Simulator controls state
  const [selectedKabKode, setSelectedKabKode] = useState<string>(KABUPATEN_KALBAR_LIST[0].kode);
  const [selectedKomKode, setSelectedKomKode] = useState<string>(komoditasList[0]?.kode || '0102');
  const [komSearch, setKomSearch] = useState<string>('');
  const [simulatedPrices, setSimulatedPrices] = useState<Record<string, number>>({});

  // Keep default period synchronized when Admin Provinsi updates global activeTriwulan
  useEffect(() => {
    setSelectedPeriode(activeTriwulan);
  }, [activeTriwulan]);

  // Count populated cells per period for quick availability info
  const periodeCoverage = useMemo(() => {
    const counts: Record<SimulasiPeriodeFilter, number> = {
      'III-2026': 0,
      'IV-2026': 0,
      'I-2027': 0,
      'II-2027': 0,
      RATA_2027: 0
    };
    for (const kom of komoditasList) {
      const list = database[`${provinsi.kode}_${kom.kode}`] || [];
      for (const item of list) {
        if ((item.hargaTw3_2026 || 0) > 0) counts['III-2026'] += 1;
        if ((item.hargaTw4_2026 || 0) > 0) counts['IV-2026'] += 1;
        if ((item.hargaTw1_2027 || 0) > 0) counts['I-2027'] += 1;
        if ((item.hargaTw2_2027 || 0) > 0) counts['II-2027'] += 1;
        if ((item.harga2027 || 0) > 0) counts['RATA_2027'] += 1;
      }
    }
    return counts;
  }, [database, provinsi.kode, komoditasList]);

  // Fast lookup map: `${kabKode}_${komKode}` -> KabupatenRekon
  const recordLookup = useMemo(() => {
    const map = new Map<string, KabupatenRekon>();
    for (const kom of komoditasList) {
      const list = database[`${provinsi.kode}_${kom.kode}`] || [];
      for (const item of list) {
        map.set(`${item.kode}_${kom.kode}`, item);
      }
    }
    return map;
  }, [database, provinsi.kode, komoditasList]);

  // Baseline provincial mean per commodity for Indeks Relatif Provinsi
  const provBaselineMeans = useMemo(() => {
    const means: Record<string, number> = {};
    for (const kom of komoditasList) {
      let sum = 0;
      let count = 0;
      for (const kab of KABUPATEN_KALBAR_LIST) {
        const entry = recordLookup.get(`${kab.kode}_${kom.kode}`);
        const h = getHargaForPeriode(entry, selectedPeriode);
        if (h > 0) {
          sum += h;
          count += 1;
        }
      }
      means[kom.kode] = count > 0 ? sum / count : 0;
    }
    return means;
  }, [komoditasList, recordLookup, selectedPeriode]);

  // Compute Baseline & Simulation Rankings across all 14 Kab/Kota
  const rankedRows: RankedKabRow[] = useMemo(() => {
    const totalKom = komoditasList.length || 1;

    const computed: ComputedKabScore[] = KABUPATEN_KALBAR_LIST.map((kab) => {
      let baseRasioSum = 0;
      let baseRasioCount = 0;
      let simRasioSum = 0;
      let simRasioCount = 0;

      let baseRelSum = 0;
      let baseRelCount = 0;
      let simRelSum = 0;
      let simRelCount = 0;

      let baseHargaSum = 0;
      let baseHargaCount = 0;
      let simHargaSum = 0;
      let simHargaCount = 0;

      let rekonSelesaiCount = 0;
      let overrideCount = 0;

      for (const kom of komoditasList) {
        const key = `${kab.kode}_${kom.kode}`;
        const entry = recordLookup.get(key);
        const baseHarga = getHargaForPeriode(entry, selectedPeriode);
        const hasOverride = Object.prototype.hasOwnProperty.call(simulatedPrices, key);
        const simHarga = hasOverride ? simulatedPrices[key] : baseHarga;

        if (hasOverride && simHarga !== baseHarga) {
          overrideCount += 1;
        }

        if (entry?.statusRekon === 'rekon_selesai' || entry?.isVerified) {
          rekonSelesaiCount += 1;
        }

        const harga2026 = entry?.harga2026 || 0;
        const provMean = provBaselineMeans[kom.kode] || 0;

        if (baseHarga > 0) {
          baseHargaSum += baseHarga;
          baseHargaCount += 1;
          if (harga2026 > 0) {
            baseRasioSum += (baseHarga / harga2026) * 100;
            baseRasioCount += 1;
          }
          if (provMean > 0) {
            baseRelSum += (baseHarga / provMean) * 100;
            baseRelCount += 1;
          }
        }

        if (simHarga > 0) {
          simHargaSum += simHarga;
          simHargaCount += 1;
          if (harga2026 > 0) {
            simRasioSum += (simHarga / harga2026) * 100;
            simRasioCount += 1;
          }
          if (provMean > 0) {
            simRelSum += (simHarga / provMean) * 100;
            simRelCount += 1;
          }
        }
      }

      const baseIndeksRasio = baseRasioCount > 0 ? baseRasioSum / baseRasioCount : 0;
      const simIndeksRasio = simRasioCount > 0 ? simRasioSum / simRasioCount : 0;
      const baseIndeksRelatif = baseRelCount > 0 ? baseRelSum / baseRelCount : 0;
      const simIndeksRelatif = simRelCount > 0 ? simRelSum / simRelCount : 0;
      const baseAvgHarga = baseHargaCount > 0 ? baseHargaSum / baseHargaCount : 0;
      const simAvgHarga = simHargaCount > 0 ? simHargaSum / simHargaCount : 0;

      const pickScore = (rasio: number, rel: number, avgH: number) => {
        if (rankingMetric === 'indeks_rasio') return rasio;
        if (rankingMetric === 'indeks_relatif') return rel;
        return avgH;
      };

      return {
        kode: kab.kode,
        nama: kab.nama,
        ibukota: kab.ibukota,
        baseScore: pickScore(baseIndeksRasio, baseIndeksRelatif, baseAvgHarga),
        simScore: pickScore(simIndeksRasio, simIndeksRelatif, simAvgHarga),
        baseIndeksRasio,
        simIndeksRasio,
        baseIndeksRelatif,
        simIndeksRelatif,
        baseAvgHarga,
        simAvgHarga,
        rasioPairsCount: simRasioCount,
        filledCount: simHargaCount,
        rekonSelesaiCount,
        progresRekonPct: parseFloat(((rekonSelesaiCount / totalKom) * 100).toFixed(1)),
        overrideCount
      };
    });

    const compareScore = (aVal: number, bVal: number, aKode: string, bKode: string) => {
      // Zero scores always sink to bottom regardless of asc/desc
      if (aVal <= 0 && bVal <= 0) return aKode.localeCompare(bKode);
      if (aVal <= 0) return 1;
      if (bVal <= 0) return -1;
      const diff = sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      if (Math.abs(diff) < 0.0001) return aKode.localeCompare(bKode);
      return diff;
    };

    const baseSorted = [...computed].sort((a, b) =>
      compareScore(a.baseScore, b.baseScore, a.kode, b.kode)
    );
    const simSorted = [...computed].sort((a, b) =>
      compareScore(a.simScore, b.simScore, a.kode, b.kode)
    );

    const baseRankMap = new Map<string, number>();
    baseSorted.forEach((item, idx) => baseRankMap.set(item.kode, idx + 1));

    const simRankMap = new Map<string, number>();
    simSorted.forEach((item, idx) => simRankMap.set(item.kode, idx + 1));

    return simSorted.map((item) => {
      const baselineRank = baseRankMap.get(item.kode) || 14;
      const simRank = simRankMap.get(item.kode) || 14;
      return {
        ...item,
        baselineRank,
        simRank,
        rankDelta: baselineRank - simRank,
        scoreDelta: item.simScore - item.baseScore
      };
    });
  }, [komoditasList, recordLookup, selectedPeriode, simulatedPrices, provBaselineMeans, rankingMetric, sortOrder]);

  // Filtered commodities for simulator selector
  const filteredKomoditas = useMemo(() => {
    const q = komSearch.trim().toLowerCase();
    if (!q) return komoditasList;
    return komoditasList.filter(
      (k) =>
        k.kode.toLowerCase().includes(q) ||
        k.nama.toLowerCase().includes(q) ||
        k.kategori.toLowerCase().includes(q)
    );
  }, [komoditasList, komSearch]);

  // Active target cell in Simulator What-If Harga
  const activeSimKey = `${selectedKabKode}_${selectedKomKode}`;
  const activeEntry = recordLookup.get(activeSimKey);
  const activeBaselinePrice = getHargaForPeriode(activeEntry, selectedPeriode);
  const activeHarga2026 = activeEntry?.harga2026 || 0;
  const hasActiveOverride = Object.prototype.hasOwnProperty.call(simulatedPrices, activeSimKey);
  const activeSimPrice = hasActiveOverride ? simulatedPrices[activeSimKey] : activeBaselinePrice;

  const activePercentDelta = useMemo(() => {
    if (activeBaselinePrice <= 0) return 0;
    return parseFloat((((activeSimPrice - activeBaselinePrice) / activeBaselinePrice) * 100).toFixed(1));
  }, [activeSimPrice, activeBaselinePrice]);

  const sliderPercentValue = Math.max(-50, Math.min(50, activePercentDelta));

  const handleSliderPercentChange = (pct: number) => {
    if (activeBaselinePrice <= 0) return;
    if (pct === 0) {
      setSimulatedPrices((prev) => {
        const next = { ...prev };
        delete next[activeSimKey];
        return next;
      });
      return;
    }
    const nextPrice = Math.max(0, Math.round(activeBaselinePrice * (1 + pct / 100)));
    setSimulatedPrices((prev) => ({
      ...prev,
      [activeSimKey]: nextPrice
    }));
  };

  const handleNumericPriceChange = (rawValue: string) => {
    const cleaned = rawValue.replace(/[^0-9]/g, '');
    const numeric = cleaned ? parseInt(cleaned, 10) : 0;
    if (numeric === activeBaselinePrice) {
      setSimulatedPrices((prev) => {
        const next = { ...prev };
        delete next[activeSimKey];
        return next;
      });
      return;
    }
    setSimulatedPrices((prev) => ({
      ...prev,
      [activeSimKey]: numeric
    }));
  };

  const handleRemoveOverride = (key: string) => {
    setSimulatedPrices((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleResetAllSimulasi = () => {
    setSimulatedPrices({});
  };

  // List of active overrides for quick inspection
  const activeOverridesList = useMemo(() => {
    return Object.entries(simulatedPrices)
      .map(([key, simVal]) => {
        const [kabKode, komKode] = key.split('_');
        const kab = KABUPATEN_KALBAR_LIST.find((k) => k.kode === kabKode);
        const kom = komoditasList.find((k) => k.kode === komKode);
        const entry = recordLookup.get(key);
        const baseVal = getHargaForPeriode(entry, selectedPeriode);
        const pct = baseVal > 0 ? ((simVal - baseVal) / baseVal) * 100 : 0;
        return {
          key,
          kabKode,
          kabNama: kab?.nama || kabKode,
          komKode,
          komNama: kom?.nama || komKode,
          baseVal,
          simVal,
          pct
        };
      })
      .filter((item) => item.simVal !== item.baseVal);
  }, [simulatedPrices, komoditasList, recordLookup, selectedPeriode]);

  const activePeriodeLabel =
    PERIODE_OPTIONS.find((p) => p.value === selectedPeriode)?.label || selectedPeriode;

  const selectedKabInfo = KABUPATEN_KALBAR_LIST.find((k) => k.kode === selectedKabKode);
  const selectedKomInfo = komoditasList.find((k) => k.kode === selectedKomKode);

  // Strict guard for non-Admin Provinsi
  if (!isPemilik) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 text-center max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-3 text-rose-600">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Akses Khusus Admin Provinsi</h2>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Menu <strong>Simulasi Ranking</strong> hanya tersedia untuk akun Admin Provinsi (BPS Kalimantan Barat).
        </p>
        {onOpenAuth && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Masuk sebagai Admin Provinsi
          </button>
        )}
      </div>
    );
  }

  const shiftedCount = rankedRows.filter((r) => r.rankDelta !== 0).length;
  const activePeriodHasData = periodeCoverage[selectedPeriode] > 0;
  const populatedAlternatives = PERIODE_OPTIONS.filter((opt) => periodeCoverage[opt.value] > 0);

  return (
    <div className="space-y-4 w-full">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-rose-950 px-5 py-4 text-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shadow-sm">
                <FlaskConical className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Simulasi Ranking IKK &amp; What-If Harga
              </h1>
              <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Mode Sandbox Lokal · Data Supabase Aman
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Analisis dampak perubahan harga komoditas terhadap peringkat 14 Kabupaten/Kota [{provinsi.kode}] {provinsi.nama} pada periode{' '}
              <strong className="text-white">{activePeriodeLabel}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeOverridesList.length > 0 && (
              <span className="text-xs font-bold text-amber-200 bg-amber-500/20 border border-amber-400/40 px-2.5 py-1.5 rounded-lg">
                {activeOverridesList.length} Skenario Aktif · {shiftedCount} Kab/Kota Berubah Posisi
              </span>
            )}
            <button
              type="button"
              onClick={handleResetAllSimulasi}
              disabled={activeOverridesList.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer bg-rose-600 hover:bg-rose-500 text-white disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Simulasi</span>
            </button>
          </div>
        </div>

        {/* Filter & Metric Controls Toolbar */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Period Segmented Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 mr-1">
              <Calendar className="w-3.5 h-3.5 text-rose-600" />
              <span>Periode:</span>
            </span>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
              {PERIODE_OPTIONS.map((opt) => {
                const count = periodeCoverage[opt.value];
                const isActive = selectedPeriode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedPeriode(opt.value)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-white text-rose-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{opt.shortLabel}</span>
                    <span className={`text-[10px] font-mono ${isActive ? 'text-rose-500' : 'text-slate-400'}`}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric Mode & Sort Direction */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-bold text-slate-700">Metrik Peringkat:</label>
            <select
              value={rankingMetric}
              onChange={(e) => setRankingMetric(e.target.value as RankingMetricMode)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 cursor-pointer"
            >
              <option value="indeks_rasio">Rata-rata Indeks Rasio vs 2026 (%)</option>
              <option value="indeks_relatif">Indeks Relatif Provinsi (Prov = 100%)</option>
              <option value="skor_agregat">Rata-rata Skor Harga Agregat (Rp)</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              title="Ubah arah pengurutan peringkat"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{sortOrder === 'desc' ? 'Tertinggi = #1' : 'Terendah = #1'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Warning Notice if selected period currently has 0 entries */}
      {!activePeriodHasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Periode <strong>{activePeriodeLabel}</strong> belum memiliki data harga pada state <code>rekonda_records</code>.
              {populatedAlternatives.length > 0
                ? ' Pilih periode yang sudah terisi untuk melihat peringkat & simulasi:'
                : ' Silakan unggah data harga tahun berjalan terlebih dahulu.'}
            </span>
          </div>
          {populatedAlternatives.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {populatedAlternatives.map((alt) => (
                <button
                  key={alt.value}
                  type="button"
                  onClick={() => setSelectedPeriode(alt.value)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-md transition-colors cursor-pointer"
                >
                  Pakai {alt.shortLabel}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Split Workspace: Left = Simulator What-If Harga, Right = Comparison Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: Simulator What-If Harga */}
        <section className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-bold tracking-tight">Simulator What-If Harga</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-300">Sandbox Lokal</span>
          </div>

          <div className="p-4 space-y-4 text-xs">
            {/* 1. Pilih Kabupaten/Kota */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                1. Pilih Kabupaten / Kota
              </label>
              <select
                value={selectedKabKode}
                onChange={(e) => setSelectedKabKode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 cursor-pointer"
              >
                {KABUPATEN_KALBAR_LIST.map((k) => {
                  const rowInfo = rankedRows.find((r) => r.kode === k.kode);
                  return (
                    <option key={k.kode} value={k.kode}>
                      [{k.kode}] {k.nama} (Rank #{rowInfo?.simRank || '-'})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Pilih Komoditas (dengan filter cepat) */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">
                2. Pilih Komoditas ({filteredKomoditas.length} / {komoditasList.length})
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={komSearch}
                  onChange={(e) => setKomSearch(e.target.value)}
                  placeholder="Cari kode atau nama komoditas..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                />
                {komSearch && (
                  <button
                    type="button"
                    onClick={() => setKomSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Hapus pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={selectedKomKode}
                onChange={(e) => setSelectedKomKode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 cursor-pointer"
              >
                {filteredKomoditas.length === 0 ? (
                  <option value={selectedKomKode}>Tidak ada komoditas yang cocok</option>
                ) : (
                  filteredKomoditas.map((kom) => {
                    const key = `${selectedKabKode}_${kom.kode}`;
                    const entry = recordLookup.get(key);
                    const h = getHargaForPeriode(entry, selectedPeriode);
                    const isEdited = Object.prototype.hasOwnProperty.call(simulatedPrices, key);
                    return (
                      <option key={kom.kode} value={kom.kode}>
                        [{kom.kode}] {kom.nama} · {h > 0 ? `Rp ${formatRupiahNumber(h)}` : 'Kosong'}
                        {isEdited ? ' [Simulasi]' : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {/* Baseline Context Box */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {selectedKabInfo?.nama} · {selectedKomInfo?.satuan || '-'}
                </span>
                <span>{activePeriodeLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="text-[11px] text-slate-500">Harga Baseline</div>
                  <div className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                    {activeBaselinePrice > 0 ? formatRupiahCurrency(activeBaselinePrice) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Harga 2026 (Pembanding)</div>
                  <div className="font-mono font-bold text-sm text-slate-700 tabular-nums">
                    {activeHarga2026 > 0 ? formatRupiahCurrency(activeHarga2026) : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Input Angka & Slider Persentase (-50% s.d. +50%) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">
                  3. Ubah Nilai Harga Simulasi
                </label>
                {hasActiveOverride && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOverride(activeSimKey)}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Kembalikan Item Ini
                  </button>
                )}
              </div>

              {/* Numeric Input (Rp) */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Input Harga Simulasi (Rp)</span>
                  <span
                    className={`font-mono font-bold ${
                      activePercentDelta > 0
                        ? 'text-rose-600'
                        : activePercentDelta < 0
                        ? 'text-emerald-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {activeBaselinePrice > 0
                      ? `${activePercentDelta > 0 ? '+' : ''}${activePercentDelta.toFixed(1)}% dari baseline`
                      : 'Input manual'}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={activeSimPrice > 0 ? activeSimPrice.toString() : ''}
                    onChange={(e) => handleNumericPriceChange(e.target.value)}
                    placeholder="Masukkan harga simulasi"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-600 tabular-nums"
                  />
                </div>
              </div>

              {/* Percentage Slider (-50% to +50%) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-600">Slider Perubahan (%)</span>
                  <span className="font-mono font-bold text-slate-900">
                    {sliderPercentValue > 0 ? '+' : ''}
                    {sliderPercentValue.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={0.5}
                  disabled={activeBaselinePrice <= 0}
                  value={sliderPercentValue}
                  onChange={(e) => handleSliderPercentChange(parseFloat(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>-50%</span>
                  <span>-25%</span>
                  <span>0%</span>
                  <span>+25%</span>
                  <span>+50%</span>
                </div>

                {/* Quick Preset Buttons */}
                <div className="grid grid-cols-5 gap-1 pt-1">
                  {[-25, -10, 0, 10, 25].map((pct) => {
                    const isCurrent = Math.abs(activePercentDelta - pct) < 0.25;
                    return (
                      <button
                        key={pct}
                        type="button"
                        disabled={activeBaselinePrice <= 0}
                        onClick={() => handleSliderPercentChange(pct)}
                        className={`py-1.5 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border ${
                          isCurrent
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active What-If Overrides Queue */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">
                  Skenario Perubahan Aktif ({activeOverridesList.length})
                </span>
                {activeOverridesList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllSimulasi}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Reset Semua
                  </button>
                )}
              </div>

              {activeOverridesList.length === 0 ? (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Belum ada perubahan harga. Pilih Kabupaten/Kota dan Komoditas di atas lalu geser slider atau ubah nominal untuk melihat pergeseran peringkat secara real-time.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {activeOverridesList.map((ov) => (
                    <div
                      key={ov.key}
                      className={`p-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 transition-colors ${
                        ov.key === activeSimKey
                          ? 'bg-rose-50/70 border-rose-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKabKode(ov.kabKode);
                          setSelectedKomKode(ov.komKode);
                        }}
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="font-bold text-slate-800 truncate">
                          [{ov.kabKode}] {ov.kabNama} · {ov.komKode}
                        </div>
                        <div className="text-slate-600 truncate">
                          {ov.komNama}:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {formatRupiahNumber(ov.baseVal)} &rarr; {formatRupiahNumber(ov.simVal)}
                          </span>{' '}
                          <span
                            className={`font-mono font-bold ${
                              ov.pct > 0 ? 'text-rose-600' : ov.pct < 0 ? 'text-emerald-600' : 'text-slate-500'
                            }`}
                          >
                            ({ov.pct > 0 ? '+' : ''}
                            {ov.pct.toFixed(1)}%)
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(ov.key)}
                        title="Hapus perubahan simulasi ini"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: Tabel Perbandingan Peringkat Baseline vs Simulasi */}
        <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Perbandingan Peringkat Baseline vs Simulasi (14 Kabupaten/Kota)
              </h2>
              <p className="text-[11px] text-slate-500">
                Klik baris wilayah untuk langsung memilihnya pada panel Simulator What-If Harga.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <TrendingUp className="w-3.5 h-3.5" /> Naik
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                <TrendingDown className="w-3.5 h-3.5" /> Turun
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                <Minus className="w-3.5 h-3.5" /> Tetap
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3 text-center w-20">Rank Base</th>
                  <th className="py-2.5 px-3 text-center w-20">Rank Sim</th>
                  <th className="py-2.5 px-3 text-center w-28">Perubahan</th>
                  <th className="py-2.5 px-3">Kabupaten / Kota</th>
                  <th className="py-2.5 px-3 text-right">Skor Baseline</th>
                  <th className="py-2.5 px-3 text-right">Skor Simulasi</th>
                  <th className="py-2.5 px-3 text-right">Selisih</th>
                  <th className="py-2.5 px-3 w-36">Progres Rekon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rankedRows.map((row) => {
                  const isSelected = row.kode === selectedKabKode;
                  const isNaik = row.rankDelta > 0;
                  const isTurun = row.rankDelta < 0;

                  const formatScore = (val: number) => {
                    if (val <= 0) return '-';
                    if (rankingMetric === 'skor_agregat') {
                      return formatRupiahCurrency(Math.round(val));
                    }
                    return formatPercent(val);
                  };

                  const formatDeltaScore = (delta: number) => {
                    if (Math.abs(delta) < 0.005) return '-';
                    const prefix = delta > 0 ? '+' : '';
                    if (rankingMetric === 'skor_agregat') {
                      const rounded = Math.round(delta);
                      return `${rounded > 0 ? '+' : '-'}Rp ${formatRupiahNumber(Math.abs(rounded))}`;
                    }
                    return `${prefix}${delta.toFixed(2).replace('.', ',')}%`;
                  };

                  return (
                    <tr
                      key={row.kode}
                      onClick={() => setSelectedKabKode(row.kode)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-rose-50/70 hover:bg-rose-50'
                          : row.overrideCount > 0
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Baseline Rank */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600 tabular-nums">
                        {row.baseScore > 0 ? `#${row.baselineRank}` : '-'}
                      </td>

                      {/* Simulation Rank */}
                      <td className="py-2.5 px-3 text-center font-mono font-extrabold text-slate-900 tabular-nums">
                        {row.simScore > 0 ? (
                          <span
                            className={`inline-flex items-center justify-center w-7 h-6 rounded-md ${
                              row.simRank <= 3
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            #{row.simRank}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* Rank Change Badge */}
                      <td className="py-2.5 px-3 text-center">
                        {row.baseScore <= 0 && row.simScore <= 0 ? (
                          <span className="text-slate-400">-</span>
                        ) : isNaik ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] tabular-nums">
                            <TrendingUp className="w-3 h-3 text-emerald-600" />
                            Naik +{row.rankDelta}
                          </span>
                        ) : isTurun ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[11px] tabular-nums">
                            <TrendingDown className="w-3 h-3 text-rose-600" />
                            Turun {row.rankDelta}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[11px]">
                            <Minus className="w-3 h-3 text-slate-400" />
                            Tetap
                          </span>
                        )}
                      </td>

                      {/* Kabupaten/Kota */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <span className="font-mono text-[10px] text-slate-500">[{row.kode}]</span>
                          <span>{row.nama}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {row.filledCount}/{komoditasList.length} komoditas terisi
                          {row.overrideCount > 0 && (
                            <span className="text-amber-700 font-bold">
                              {' '}
                              · {row.overrideCount} diubah
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Skor Baseline */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-600 tabular-nums">
                        {formatScore(row.baseScore)}
                      </td>

                      {/* Skor Simulasi */}
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                        {formatScore(row.simScore)}
                      </td>

                      {/* Selisih Nilai */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {Math.abs(row.scoreDelta) < 0.005 ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className={row.scoreDelta > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {formatDeltaScore(row.scoreDelta)}
                          </span>
                        )}
                      </td>

                      {/* Progres Rekon */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                          <span className="font-bold text-slate-700 inline-flex items-center gap-1">
                            {row.progresRekonPct >= 100 && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            )}
                            {row.progresRekonPct.toFixed(1).replace('.', ',')}%
                          </span>
                          <span className="text-slate-500">
                            {row.rekonSelesaiCount}/{komoditasList.length}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              row.progresRekonPct >= 80
                                ? 'bg-emerald-500'
                                : row.progresRekonPct >= 40
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, row.progresRekonPct)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Sumber data: state lokal <code>rekonda_records</code> ({activePeriodeLabel}) · Seluruh simulasi bersifat sementara di browser.
            </span>
            <span className="font-semibold text-slate-600">
              {rankingMetric === 'indeks_rasio'
                ? 'Metrik: Rata-rata (Harga Periode / Harga 2026) × 100%'
                : rankingMetric === 'indeks_relatif'
                ? 'Metrik: Rata-rata (Harga Periode / Rata-rata Provinsi Baseline) × 100%'
                : 'Metrik: Rata-rata Skor Harga Agregat (Rp)'}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
