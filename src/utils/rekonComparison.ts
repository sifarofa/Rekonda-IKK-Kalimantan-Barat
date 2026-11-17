import { ComparisonMode, KabupatenRekon, RespondenData } from '../types/rekonda';
import responden2026LookupRaw from '../data/responden2026Lookup.json';
import merekAcuan2026LookupRaw from '../data/merekAcuan2026Lookup.json';
import { calculateStats, getDominantBrand } from './formatters';
import { isSewaAlatKomoditas } from './sewaAlatCalculator';

export interface LookupEntry {
  nama: string;
  avgHarga: number;
  twPrices?: Record<string, number>;
  source?: string;
}

export interface MerekAcuanLookupEntry {
  brands: string[];
  respNames: string[];
}

export type Respondent2026Status =
  | 'final'
  | 'non_final_merek'
  | 'non_final_webentry'
  | 'baru';

export interface Respondent2026Eval {
  harga: number | null;
  sourceText: 'IKK Rekonda' | 'IKK Webentry' | null;
  status2026: Respondent2026Status;
  merekAcuanList: string[];
  matchesMerekAcuan: boolean;
  isIncludedInFinal2026: boolean;
}

export interface ProjectedKabupatenRekon extends KabupatenRekon {
  activeMerekAcuan: string[];
  nonFinalRespCount: number;
  finalRespCount: number;
  newRespCount: number;
  merekAcuanMatchedRespCount: number;
  isFilteredProjection: boolean;
  projectionNote?: string;
}

const responden2026Lookup = responden2026LookupRaw as Record<string, LookupEntry>;
const merekAcuan2026Lookup = merekAcuan2026LookupRaw as Record<string, MerekAcuanLookupEntry>;

export const normalizeAlnum = (str: string): string =>
  (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeBrand = (str: string): string =>
  (str || '').trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Retrieve 2026 reference brands & final respondent list for a (kabKode, komKode) pair.
 */
export function getKab2026RefMeta(
  kabKode: string,
  komKode: string,
  kab?: Partial<KabupatenRekon> | null
): {
  merekAcuanList: string[];
  finalRespNormNames: Set<string>;
  hasFinal2026Meta: boolean;
} {
  const cleanKab = (kabKode || '').trim();
  const cleanKom = (komKode || '').trim();
  const staticEntry = merekAcuan2026Lookup[`${cleanKab}_${cleanKom}`];

  const merekAcuanList =
    kab?.merekAcuan2026 && kab.merekAcuan2026.length > 0
      ? kab.merekAcuan2026
      : staticEntry?.brands || [];

  const respList =
    kab?.finalRespondents2026 && kab.finalRespondents2026.length > 0
      ? kab.finalRespondents2026
      : staticEntry?.respNames || [];

  const finalRespNormNames = new Set<string>(
    respList.map((n) => normalizeAlnum(n)).filter(Boolean)
  );

  return {
    merekAcuanList,
    finalRespNormNames,
    hasFinal2026Meta: merekAcuanList.length > 0 || finalRespNormNames.size > 0
  };
}

/**
 * Evaluate a single 2027 respondent entry against 2026 IKK Rekonda (Final) & Webentry databases.
 */
export function getRespondent2026Eval(
  kabKode: string,
  qualKode: string,
  resp: RespondenData,
  kab?: Partial<KabupatenRekon> | null
): Respondent2026Eval {
  const cleanKab = (kabKode || '').trim();
  const cleanQual = (qualKode || '').trim();
  const normName = normalizeAlnum(resp.nama);
  const normId = normalizeAlnum(resp.id);

  const keyByName = `${cleanKab}_${cleanQual}_${normName}`;
  const keyById = `${cleanKab}_${cleanQual}_${normId}`;

  let match: LookupEntry | undefined =
    responden2026Lookup[keyByName] || responden2026Lookup[keyById];

  if (!match && normName.length >= 4) {
    const prefix = `${cleanKab}_${cleanQual}_`;
    for (const k in responden2026Lookup) {
      if (k.startsWith(prefix)) {
        const sub = k.slice(prefix.length);
        if (sub.includes(normName) || normName.includes(sub)) {
          match = responden2026Lookup[k];
          break;
        }
      }
    }
  }

  const { merekAcuanList, finalRespNormNames } = getKab2026RefMeta(cleanKab, cleanQual, kab);

  const normalizedAcuanSet = new Set(merekAcuanList.map((b) => normalizeBrand(b)));
  const respMerkNorm = normalizeBrand(resp.merk || '');
  const matchesMerekAcuan =
    normalizedAcuanSet.size === 0 || (respMerkNorm !== '' && normalizedAcuanSet.has(respMerkNorm));

  const inFinalListByName =
    normName !== '' &&
    (finalRespNormNames.has(normName) ||
      Array.from(finalRespNormNames).some(
        (fn) => fn.length >= 4 && normName.length >= 4 && (fn.includes(normName) || normName.includes(fn))
      ));

  if (!match) {
    return {
      harga: null,
      sourceText: null,
      status2026: 'baru',
      merekAcuanList,
      matchesMerekAcuan,
      isIncludedInFinal2026: false
    };
  }

  let targetQuarterKey = '';
  if (resp.tahun === 2027 && resp.triwulan === 1) targetQuarterKey = '2026_1';
  else if (resp.tahun === 2027 && resp.triwulan === 2) targetQuarterKey = '2026_2';
  else if (resp.tahun === 2026 && resp.triwulan === 3) targetQuarterKey = '2025_3';
  else if (resp.tahun === 2026 && resp.triwulan === 4) targetQuarterKey = '2025_4';
  else targetQuarterKey = `2026_${resp.triwulan}`;

  let prevPrice: number | null = null;
  if (match.twPrices && match.twPrices[targetQuarterKey] && match.twPrices[targetQuarterKey] > 0) {
    prevPrice = match.twPrices[targetQuarterKey];
  } else if (match.avgHarga && match.avgHarga > 0) {
    prevPrice = match.avgHarga;
  }

  const isRekonnas =
    match.source === 'rekonnas' || match.source === 'IKK Rekonda' || inFinalListByName;
  const sourceText: 'IKK Rekonda' | 'IKK Webentry' = isRekonnas
    ? 'IKK Rekonda'
    : 'IKK Webentry';

  let status2026: Respondent2026Status;
  if (isRekonnas) {
    status2026 = matchesMerekAcuan ? 'final' : 'non_final_merek';
  } else {
    status2026 = 'non_final_webentry';
  }

  return {
    harga: prevPrice,
    sourceText,
    status2026,
    merekAcuanList,
    matchesMerekAcuan,
    isIncludedInFinal2026: status2026 === 'final'
  };
}

function recomputeStatsFromSubset(
  kab: KabupatenRekon,
  subset: RespondenData[]
): Pick<
  KabupatenRekon,
  | 'harga2027'
  | 'hargaTw3_2026'
  | 'hargaTw4_2026'
  | 'hargaTw1_2027'
  | 'hargaTw2_2027'
  | 'koefisienVariasi'
  | 'namaKualitas'
  | 'rasio'
> {
  const tw3 = subset.filter((r) => r.tahun === 2026 && r.triwulan === 3).map((r) => r.harga).filter((p) => p > 0);
  const tw4 = subset.filter((r) => r.tahun === 2026 && r.triwulan === 4).map((r) => r.harga).filter((p) => p > 0);
  const tw1 = subset.filter((r) => r.tahun === 2027 && r.triwulan === 1).map((r) => r.harga).filter((p) => p > 0);
  const tw2 = subset.filter((r) => r.tahun === 2027 && r.triwulan === 2).map((r) => r.harga).filter((p) => p > 0);

  const avgTw3 = tw3.length > 0 ? Math.round(tw3.reduce((a, b) => a + b, 0) / tw3.length) : 0;
  const avgTw4 = tw4.length > 0 ? Math.round(tw4.reduce((a, b) => a + b, 0) / tw4.length) : 0;
  const avgTw1 = tw1.length > 0 ? Math.round(tw1.reduce((a, b) => a + b, 0) / tw1.length) : 0;
  const avgTw2 = tw2.length > 0 ? Math.round(tw2.reduce((a, b) => a + b, 0) / tw2.length) : 0;

  const validAvgs = [avgTw3, avgTw4, avgTw1, avgTw2].filter((v) => v > 0);
  const harga2027 =
    validAvgs.length > 0
      ? Math.round(validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length)
      : 0;

  const allPrices = subset
    .filter(
      (r) =>
        (r.tahun === 2026 && (r.triwulan === 3 || r.triwulan === 4)) ||
        (r.tahun === 2027 && (r.triwulan === 1 || r.triwulan === 2))
    )
    .map((r) => r.harga)
    .filter((p) => p > 0);

  const stats = allPrices.length > 0 ? calculateStats(allPrices) : { mean: 0, sd: 0, cv: 0 };
  const namaKualitas =
    harga2027 > 0
      ? getDominantBrand(subset, kab.namaKualitas && kab.namaKualitas !== '-' ? kab.namaKualitas : 'Standar')
      : '-';

  const rasio =
    harga2027 > 0 && kab.harga2026 > 0
      ? parseFloat(((harga2027 / kab.harga2026) * 100).toFixed(2))
      : 0;

  return {
    harga2027,
    hargaTw3_2026: avgTw3,
    hargaTw4_2026: avgTw4,
    hargaTw1_2027: avgTw1,
    hargaTw2_2027: avgTw2,
    koefisienVariasi: stats.cv,
    namaKualitas,
    rasio
  };
}

/**
 * Project a KabupatenRekon row dynamically according to the selected ComparisonMode
 * without mutating stored respondents or Supabase database state.
 */
export function projectKabupatenByComparisonMode(
  kab: KabupatenRekon,
  komKode: string,
  mode: ComparisonMode
): ProjectedKabupatenRekon {
  const { merekAcuanList } = getKab2026RefMeta(kab.kode, komKode, kab);
  const respondents = kab.respondents || [];

  let finalRespCount = 0;
  let nonFinalRespCount = 0;
  let newRespCount = 0;
  let merekAcuanMatchedRespCount = 0;

  const evals = respondents.map((r) => {
    const ev = getRespondent2026Eval(kab.kode, komKode, r, kab);
    if (ev.status2026 === 'final') finalRespCount++;
    else if (ev.status2026 === 'baru') newRespCount++;
    else nonFinalRespCount++;

    if (ev.matchesMerekAcuan) merekAcuanMatchedRespCount++;
    return { r, ev };
  });

  if (mode === 'all' || isSewaAlatKomoditas(komKode) || respondents.length === 0) {
    return {
      ...kab,
      activeMerekAcuan: merekAcuanList,
      nonFinalRespCount,
      finalRespCount,
      newRespCount,
      merekAcuanMatchedRespCount,
      isFilteredProjection: false
    };
  }

  if (mode === 'merek_acuan') {
    if (merekAcuanList.length === 0) {
      return {
        ...kab,
        activeMerekAcuan: merekAcuanList,
        nonFinalRespCount,
        finalRespCount,
        newRespCount,
        merekAcuanMatchedRespCount,
        isFilteredProjection: false
      };
    }

    const matchedSubset = evals.filter((x) => x.ev.matchesMerekAcuan).map((x) => x.r);
    if (matchedSubset.length === 0) {
      return {
        ...kab,
        activeMerekAcuan: merekAcuanList,
        nonFinalRespCount,
        finalRespCount,
        newRespCount,
        merekAcuanMatchedRespCount,
        isFilteredProjection: false,
        projectionNote: `Merek acuan '26 (${merekAcuanList.join(', ')}) tidak ada di '27`
      };
    }

    const recomputed = recomputeStatsFromSubset(kab, matchedSubset);
    return {
      ...kab,
      ...recomputed,
      activeMerekAcuan: merekAcuanList,
      nonFinalRespCount,
      finalRespCount,
      newRespCount,
      merekAcuanMatchedRespCount,
      isFilteredProjection: matchedSubset.length < respondents.length,
      projectionNote: `Acuan '26: ${merekAcuanList.join(', ')} (${matchedSubset.length}/${respondents.length} entri)`
    };
  }

  // mode === 'apple_to_apple'
  const appleSubset = evals.filter((x) => x.ev.status2026 === 'final').map((x) => x.r);
  if (appleSubset.length === 0) {
    return {
      ...kab,
      activeMerekAcuan: merekAcuanList,
      nonFinalRespCount,
      finalRespCount,
      newRespCount,
      merekAcuanMatchedRespCount,
      isFilteredProjection: false,
      projectionNote: 'Belum ada responden yang cocok dengan Final 2026'
    };
  }

  const recomputed = recomputeStatsFromSubset(kab, appleSubset);
  return {
    ...kab,
    ...recomputed,
    activeMerekAcuan: merekAcuanList,
    nonFinalRespCount,
    finalRespCount,
    newRespCount,
    merekAcuanMatchedRespCount,
    isFilteredProjection: appleSubset.length < respondents.length,
    projectionNote:
      appleSubset.length < respondents.length
        ? `Apple-to-Apple: ${appleSubset.length}/${respondents.length} entri Final '26`
        : 'Seluruh entri cocok Final \'26'
  };
}
