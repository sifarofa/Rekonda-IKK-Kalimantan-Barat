import * as XLSX from 'xlsx';
import { KabupatenRekon, Komoditas, RespondenData } from '../types/rekonda';
import { calculateStats } from './formatters';

export interface ComparisonItem {
  kode: string;
  nama: string;
  oldValue: number;
  newValue: number;
  diff: number;
  percentDiff: number;
  oldRasio: number;
  newRasio: number;
  quartersDetail: string;
  respondentCount?: number;
}

export interface ParseResult {
  updatedList: KabupatenRekon[];
  comparison: ComparisonItem[];
  totalRows: number;
  affectedKabCount: number;
  detectedCommodities: string[];
  rawRows: any[];
}

export interface MultiParseResult {
  updatedDatabase: Record<string, KabupatenRekon[]>;
  previewResult: ParseResult;
  previewKomoditasKode: string;
  totalRows: number;
  updatedCommoditiesCount: number;
  totalCommoditiesInFile: number;
  totalAffectedKabEntries: number;
  isMultiCommodity: boolean;
}

/**
 * Robust price parser:
 * Handles numbers and various Indonesian / International string number formats:
 * - 135000
 * - "135,000"
 * - "135.000"
 * - "183,400,312"
 * - "183.400.312"
 * - "Rp 135.000"
 */
export function parsePrice(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);

  let s = String(val).trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return 0;

  // Remove currency prefix and characters other than digits, dot, comma, minus
  s = s.replace(/[^0-9.,-]/g, '');
  if (!s) return 0;

  // Handle thousand and decimal separators
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Determine which is thousand separator
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Indonesian format: 135.000,00 -> remove dot, replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 135,000.00 -> remove comma
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // Thousands separator: 135,000 or 183,400,312
      s = s.replace(/,/g, '');
    } else if (parts.length === 2 && parts[parts.length - 1].length <= 2) {
      // Decimal: 135,5
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    const parts = s.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // Thousands separator: 135.000 or 183.400.312
      s = s.replace(/\./g, '');
    }
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Helper to resolve normalized 4-digit quality code from any template row.
 * Handles both fixed `[xxxx]` codes and legacy/untagged rows for:
 * - Seng Plat BJLS 20 -> 1402
 * - Seng Plat BJLS 30 -> 1404
 * - Atap Metal Genteng Metal (0.25 mm) -> 5001
 * - Atap Metal Genteng Metal (0.30 mm) -> 5002
 * - Atap Metal Atap Spandex (0.30 mm) -> 5003
 * - Upah Mandor -> 6001
 */
export function resolveRowQualCode(row: Record<string, any>): string {
  const kd = String(row['Kualitas Data'] ?? '').trim();
  const kr = String(row['Kualitas Rekon'] ?? '').trim();
  const kqr = String(
    row['kode kualitas rekon'] ??
    row['Kode Kualitas 1'] ??
    row['Kode Kualitas 2'] ??
    row['Kode Kualitas'] ??
    row['kode_kualitas_rekon'] ??
    ''
  ).trim();
  const commName = String(row['Nama Komoditas'] ?? row['Komoditas'] ?? '').trim();
  const qualName = String(row['Nama Kualitas'] ?? row['kualitas rekon'] ?? '').trim();

  const combinedText = `${kd} ${kr} ${kqr} ${commName} ${qualName}`.toLowerCase();

  // Canonical overrides matching official IKK template codes
  if (combinedText.includes('bjls 20')) return '1402';
  if (combinedText.includes('bjls 30')) return '1404';
  if (combinedText.includes('genteng metal') && combinedText.includes('0.25')) return '5001';
  if (combinedText.includes('genteng metal') && combinedText.includes('0.30')) return '5002';
  if (combinedText.includes('spandex') && combinedText.includes('0.30')) return '5003';
  if (combinedText.includes('upah mandor')) return '6001';

  // Extract 4-digit code from IKK Responden ("1402 | ...") or Webentry / Tabel 7.1 ("[1402] ...")
  for (const field of [kd, kr, kqr]) {
    if (!field) continue;
    const match = field.match(/(?:^|\[|\b)(\d{4})(?:\]|\s*\||\b)/);
    if (match) return match[1];
  }

  return '';
}

function stripBomAndNormalizeKeys(rows: any[]): any[] {
  return rows.map((row) => {
    const cleanRow: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = k.replace(/^\uFEFF/, '').trim();
      cleanRow[cleanKey] = v;
    }
    return cleanRow;
  });
}

/**
 * Reads an Excel file or CSV and returns an array of objects
 */
export async function parseFileToRows(file: File | ArrayBuffer | Uint8Array | string): Promise<any[]> {
  let workbook: XLSX.WorkBook;

  if (typeof file === 'string') {
    const cleanStr = file.replace(/^\uFEFF/, '');
    const firstLine = cleanStr.split(/\r?\n/)[0] || '';
    const fsOpt = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : undefined;
    workbook = XLSX.read(cleanStr, { type: 'string', ...(fsOpt ? { FS: fsOpt } : {}) });
  } else if (file instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    const preview = decoder.decode(new Uint8Array(file.slice(0, 4096))).replace(/^\uFEFF/, '');
    const firstLine = preview.split(/\r?\n/)[0] || '';
    // If plain text CSV with semicolons or tabs (and not zip/binary xlsx)
    const isZipOrOle = new Uint8Array(file.slice(0, 2))[0] === 0x50 || new Uint8Array(file.slice(0, 2))[0] === 0xd0;
    if (!isZipOrOle && (firstLine.includes(';') || firstLine.includes('\t'))) {
      const fullText = decoder.decode(new Uint8Array(file)).replace(/^\uFEFF/, '');
      const fsOpt = firstLine.includes(';') ? ';' : '\t';
      workbook = XLSX.read(fullText, { type: 'string', FS: fsOpt });
    } else {
      workbook = XLSX.read(file, { type: 'array' });
    }
  } else if (ArrayBuffer.isView(file)) {
    workbook = XLSX.read(file as any, { type: 'buffer' });
  } else if (file && typeof (file as any).arrayBuffer === 'function') {
    const buffer = await (file as any).arrayBuffer();
    return parseFileToRows(buffer);
  } else {
    workbook = XLSX.read(file as any, { type: 'array' });
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return stripBomAndNormalizeKeys(json);
}

/**
 * Finds match in Kabupaten list by code or name
 */
export function findMatchingKabupaten(
  rawCodeOrName: string,
  rawName: string | undefined,
  currentList: KabupatenRekon[]
): KabupatenRekon | undefined {
  const cleanInput = String(rawCodeOrName || '').trim();
  const cleanName = String(rawName || '').trim().toLowerCase();

  // 1. Direct name match if rawName is provided (unambiguous, e.g. "KUBU RAYA", "LANDAK", "PONTIANAK")
  if (cleanName) {
    const normalizeName = (s: string) =>
      s.toLowerCase().replace(/^(kota|kab\.|kabupaten)\s+/, '').replace(/\s+/g, ' ').trim();
    const targetNorm = normalizeName(cleanName);

    const byExactName = currentList.find((k) => normalizeName(k.nama) === targetNorm);
    if (byExactName) return byExactName;

    const byIncludes = currentList.find(
      (k) =>
        targetNorm.includes(normalizeName(k.nama)) ||
        normalizeName(k.nama).includes(targetNorm)
    );
    if (byIncludes) return byIncludes;
  }

  // 2. Direct match by kode (e.g. '6101')
  let match = currentList.find((k) => k.kode === cleanInput);
  if (match) return match;

  // 3. Code substring match (e.g. respondent code '6101032' starts with '6101' or '6101 - SAMBAS')
  const codeDigits = cleanInput.replace(/[^0-9]/g, '');
  if (codeDigits.length >= 4) {
    const prefix4 = codeDigits.slice(0, 4);
    match = currentList.find((k) => k.kode === prefix4);
    if (match) return match;
  }

  // 4. Input string contains kabupaten name (e.g. '6111 - KAYONG UTARA')
  const upper = cleanInput.toUpperCase();
  match = currentList.find((k) => upper.includes(k.nama.toUpperCase()));
  if (match) return match;

  return undefined;
}

/**
 * Process File 1: Template Harga Tahun Berjalan (Database Tabel 7.1)
 * Digunakan untuk mengisi HARGA TAHUN BERJALAN (TW 3, 4 2026 dan TW 1, 2 2027)
 * yang dimasukkan ke kolom HARGA 2027 & TW berjalan.
 * Triwulan yang belum ada nilainya (mis. TW 1 & 2 2027) dan Kab/Kota tanpa data diisi 0 (tampil '-').
 */
export function processTabel71Upload(
  rows: any[],
  currentList: KabupatenRekon[],
  commodityFilter?: string
): ParseResult {
  const updatedList: KabupatenRekon[] = currentList.map((k) => ({
    ...k,
    respondents: [...k.respondents]
  }));

  const detectedCommoditiesSet = new Set<string>();

  // Detect whether file explicitly uses 2026/2027 headers so I-2027 never falls back to legacy I-2026
  const hasCycle2027Headers = rows.some((r) => {
    const keys = Object.keys(r);
    return keys.some((k) =>
      k === 'III-2026' ||
      k === 'IV-2026' ||
      k === 'I-2027' ||
      k === 'II-2027' ||
      k === 'TW III 2026' ||
      k === 'TW IV 2026' ||
      k === 'TW I 2027' ||
      k === 'TW II 2027' ||
      k === 'tw3_2026' ||
      k === 'tw4_2026' ||
      k === 'tw1_2027' ||
      k === 'tw2_2027'
    );
  });

  // Group raw rows by target kabupaten
  const groupedRows: Record<string, any[]> = {};

  rows.forEach((row) => {
    const qualCode = resolveRowQualCode(row);
    const kqr = String(row['kode kualitas rekon'] || row['kualitas rekon'] || '').trim();
    const comm = String(row['Nama Komoditas'] || row['Komoditas'] || row['komoditas'] || '').trim();
    const qual = String(row['Nama Kualitas'] || '').trim();
    const label = qualCode ? `[${qualCode}] ${comm || qual}` : (kqr || comm);
    if (label) detectedCommoditiesSet.add(label);

    if (commodityFilter && commodityFilter !== 'ALL') {
      const q = commodityFilter.toLowerCase().trim();
      const filterCodeMatch = q.match(/\[?(\d{4})\]?/);
      const filterCode = filterCodeMatch ? filterCodeMatch[1] : '';

      const matchesCode = Boolean(filterCode && qualCode && qualCode === filterCode);
      const matchesName =
        kqr.toLowerCase().includes(q) ||
        comm.toLowerCase().includes(q) ||
        qual.toLowerCase().includes(q) ||
        (comm && q.includes(comm.toLowerCase()));

      if (!matchesCode && !matchesName) {
        return;
      }
    }

    const rawCode = String(
      row['Kode Kabupaten/Kota'] ??
      row['Kode K'] ??
      row['Kode Kab'] ??
      row['Kode'] ??
      row['kode'] ??
      ''
    ).trim();

    const rawName = String(
      row['Nama Kabupaten/Kota'] ??
      row['Nama K'] ??
      row['Kabupaten'] ??
      row['nama'] ??
      ''
    ).trim();

    const matched = findMatchingKabupaten(rawCode, rawName, updatedList);
    if (matched) {
      if (!groupedRows[matched.kode]) groupedRows[matched.kode] = [];
      groupedRows[matched.kode].push(row);
    }
  });

  const comparison: ComparisonItem[] = [];
  let affectedKabCount = 0;

  // Process all 14 Kabupaten: matched get exact uploaded quarters (missing quarters -> 0/'-'), unmatched get 0/'-'
  updatedList.forEach((kab) => {
    const kabRows = groupedRows[kab.kode];
    if (!kabRows || kabRows.length === 0) {
      kab.hargaTw3_2026 = 0;
      kab.hargaTw4_2026 = 0;
      kab.hargaTw1_2027 = 0;
      kab.hargaTw2_2027 = 0;
      kab.harga2027 = 0;
      kab.koefisienVariasi = 0;
      kab.rasio = 0;
      kab.namaKualitas = '-';
      kab.respondents = [];
      return;
    }

    const tw3Prices: number[] = [];
    const tw4Prices: number[] = [];
    const tw1Prices: number[] = [];
    const tw2Prices: number[] = [];
    const allPrices: number[] = [];
    const newRespondents: RespondenData[] = [];
    const brandCounts: Record<string, number> = {};

    kabRows.forEach((r, idx) => {
      const pTw3 = hasCycle2027Headers
        ? parsePrice(r['III-2026'] ?? r['TW III 2026'] ?? r['tw3_2026'] ?? r['III 2026'])
        : parsePrice(r['III-2026'] ?? r['TW III 2026'] ?? r['tw3_2026'] ?? r['III 2026'] ?? r['III-2025'] ?? r['TW III 2025']);
      const pTw4 = hasCycle2027Headers
        ? parsePrice(r['IV-2026'] ?? r['TW IV 2026'] ?? r['tw4_2026'] ?? r['IV 2026'])
        : parsePrice(r['IV-2026'] ?? r['TW IV 2026'] ?? r['tw4_2026'] ?? r['IV 2026'] ?? r['IV-2025'] ?? r['TW IV 2025']);
      const pTw1 = hasCycle2027Headers
        ? parsePrice(r['I-2027'] ?? r['TW I 2027'] ?? r['tw1_2027'] ?? r['I 2027'])
        : parsePrice(r['I-2027'] ?? r['TW I 2027'] ?? r['tw1_2027'] ?? r['I 2027'] ?? r['I-2026'] ?? r['TW I 2026']);
      const pTw2 = hasCycle2027Headers
        ? parsePrice(r['II-2027'] ?? r['TW II 2027'] ?? r['tw2_2027'] ?? r['II 2027'])
        : parsePrice(r['II-2027'] ?? r['TW II 2027'] ?? r['tw2_2027'] ?? r['II 2027'] ?? r['II-2026'] ?? r['TW II 2026']);

      const resName = String(
        r['Nama Responden'] ?? r['Nama R'] ?? r['Responden'] ?? `Responden ${idx + 1}`
      ).trim().toUpperCase();

      const resMerk = String(
        r['Nama Merek'] ?? r['Nama Kualitas'] ?? r['kualitas rekon'] ?? r['Merek'] ?? 'Standar'
      ).trim();

      if (resMerk && (pTw3 > 0 || pTw4 > 0 || pTw1 > 0 || pTw2 > 0)) {
        brandCounts[resMerk] = (brandCounts[resMerk] || 0) + 1;
      }

      if (pTw3 > 0) {
        tw3Prices.push(pTw3);
        allPrices.push(pTw3);
        newRespondents.push({
          id: `res_71_${kab.kode}_tw3_${Date.now()}_${idx}`,
          tahun: 2026,
          triwulan: 3,
          nama: resName,
          merk: resMerk,
          harga: pTw3
        });
      }
      if (pTw4 > 0) {
        tw4Prices.push(pTw4);
        allPrices.push(pTw4);
        newRespondents.push({
          id: `res_71_${kab.kode}_tw4_${Date.now()}_${idx}`,
          tahun: 2026,
          triwulan: 4,
          nama: resName,
          merk: resMerk,
          harga: pTw4
        });
      }
      if (pTw1 > 0) {
        tw1Prices.push(pTw1);
        allPrices.push(pTw1);
        newRespondents.push({
          id: `res_71_${kab.kode}_tw1_${Date.now()}_${idx}`,
          tahun: 2027,
          triwulan: 1,
          nama: resName,
          merk: resMerk,
          harga: pTw1
        });
      }
      if (pTw2 > 0) {
        tw2Prices.push(pTw2);
        allPrices.push(pTw2);
        newRespondents.push({
          id: `res_71_${kab.kode}_tw2_${Date.now()}_${idx}`,
          tahun: 2027,
          triwulan: 2,
          nama: resName,
          merk: resMerk,
          harga: pTw2
        });
      }
    });

    // Calculate quarter averages strictly from uploaded rows (0 if quarter has no prices yet -> renders '-')
    const avgTw3 = tw3Prices.length > 0 ? Math.round(tw3Prices.reduce((a, b) => a + b, 0) / tw3Prices.length) : 0;
    const avgTw4 = tw4Prices.length > 0 ? Math.round(tw4Prices.reduce((a, b) => a + b, 0) / tw4Prices.length) : 0;
    const avgTw1 = tw1Prices.length > 0 ? Math.round(tw1Prices.reduce((a, b) => a + b, 0) / tw1Prices.length) : 0;
    const avgTw2 = tw2Prices.length > 0 ? Math.round(tw2Prices.reduce((a, b) => a + b, 0) / tw2Prices.length) : 0;

    // Available quarters average for Harga 2027 (0 if all quarters empty -> renders '-')
    const validQuarterAvgs = [avgTw3, avgTw4, avgTw1, avgTw2].filter((v) => v > 0);
    const newHarga2027 = validQuarterAvgs.length > 0
      ? Math.round(validQuarterAvgs.reduce((a, b) => a + b, 0) / validQuarterAvgs.length)
      : 0;

    if (newHarga2027 > 0) {
      affectedKabCount++;
    }

    const stats = allPrices.length > 0 ? calculateStats(allPrices) : { mean: 0, sd: 0, cv: 0 };
    const newCV = allPrices.length > 0 ? stats.cv : 0;

    let dominantBrand = newHarga2027 > 0 ? kab.namaKualitas : '-';
    let maxCount = 0;
    for (const [b, c] of Object.entries(brandCounts)) {
      if (c > maxCount) {
        maxCount = c;
        dominantBrand = b;
      }
    }

    const oldHarga2027 = kab.harga2027;
    const oldRasio = kab.rasio;
    const newRasio =
      newHarga2027 > 0 && kab.harga2026 > 0
        ? parseFloat(((newHarga2027 / kab.harga2026) * 100).toFixed(2))
        : 0;

    kab.hargaTw3_2026 = avgTw3;
    kab.hargaTw4_2026 = avgTw4;
    kab.hargaTw1_2027 = avgTw1;
    kab.hargaTw2_2027 = avgTw2;
    kab.harga2027 = newHarga2027;
    kab.koefisienVariasi = newCV;
    kab.namaKualitas = dominantBrand || '-';
    kab.rasio = newRasio;
    kab.respondents = newRespondents;

    const diff = newHarga2027 - oldHarga2027;
    const percentDiff = oldHarga2027 > 0 ? parseFloat(((diff / oldHarga2027) * 100).toFixed(2)) : 0;

    const quartersDetail = [
      avgTw3 > 0 ? `TW3'26: ${avgTw3.toLocaleString('id-ID')}` : '',
      avgTw4 > 0 ? `TW4'26: ${avgTw4.toLocaleString('id-ID')}` : '',
      avgTw1 > 0 ? `TW1'27: ${avgTw1.toLocaleString('id-ID')}` : '',
      avgTw2 > 0 ? `TW2'27: ${avgTw2.toLocaleString('id-ID')}` : ''
    ].filter(Boolean).join(' | ');

    comparison.push({
      kode: kab.kode,
      nama: kab.nama,
      oldValue: oldHarga2027,
      newValue: newHarga2027,
      diff,
      percentDiff,
      oldRasio,
      newRasio,
      quartersDetail: quartersDetail || 'Kosong (-)',
      respondentCount: newRespondents.length
    });
  });

  return {
    updatedList,
    comparison,
    totalRows: rows.length,
    affectedKabCount,
    detectedCommodities: Array.from(detectedCommoditiesSet),
    rawRows: rows
  };
}

/**
 * Process File 2: IKK Rekonda Responden
 * Digunakan untuk mengisi HARGA TAHUN SEBELUMNYA (TW 3, 4 2025 dan TW 1, 2 2026)
 * yang diinputkan ke kolom HARGA 2026 (Basis IKK 2026) & TW tahun lalu.
 */
export function processIKKRespondenUpload(
  rows: any[],
  currentList: KabupatenRekon[],
  commodityFilter?: string
): ParseResult {
  const updatedList: KabupatenRekon[] = currentList.map((k) => ({
    ...k,
    respondents: [...k.respondents]
  }));

  const detectedCommoditiesSet = new Set<string>();

  // Group microdata rows by matched kabupaten
  const groupedRows: Record<string, any[]> = {};

  rows.forEach((row) => {
    // Lookup from Kualitas Data (Primary as requested) and Kualitas Rekon / Komoditas (Fallback)
    const qualCode = resolveRowQualCode(row);
    const kd = String(row['Kualitas Data'] || '').trim();
    const kr = String(row['Kualitas Rekon'] || '').trim();
    const comm = String(row['Komoditas'] || row['Nama Komoditas'] || '').trim();

    if (kd) detectedCommoditiesSet.add(kd);
    else if (kr) detectedCommoditiesSet.add(kr);
    else if (comm) detectedCommoditiesSet.add(comm);

    if (commodityFilter && commodityFilter !== 'ALL') {
      const q = commodityFilter.toLowerCase().trim();
      const filterCodeMatch = q.match(/\[?(\d{4})\]?/);
      const filterCode = filterCodeMatch ? filterCodeMatch[1] : '';

      const matchCode = Boolean(filterCode && qualCode && qualCode === filterCode);
      const matchKD = kd.toLowerCase().includes(q);
      const matchKR = kr.toLowerCase().includes(q);
      const matchComm = comm.toLowerCase().includes(q);
      if (!matchCode && !matchKD && !matchKR && !matchComm) {
        return;
      }
    }

    const rawKota = String(row['Kota'] || row['Kabupaten'] || row['Kota / Kab'] || '').trim();
    const matched = findMatchingKabupaten(rawKota, rawKota, updatedList);
    if (matched) {
      if (!groupedRows[matched.kode]) groupedRows[matched.kode] = [];
      groupedRows[matched.kode].push(row);
    }
  });

  const comparison: ComparisonItem[] = [];
  let affectedKabCount = 0;

  updatedList.forEach((kab) => {
    const kabRows = groupedRows[kab.kode];
    if (!kabRows || kabRows.length === 0) return;

    affectedKabCount++;

    const tw3_25_prices: number[] = [];
    const tw4_25_prices: number[] = [];
    const tw1_26_prices: number[] = [];
    const tw2_26_prices: number[] = [];
    const allLaluPrices: number[] = [];

    kabRows.forEach((r) => {
      const tahun = Number(r['Tahun'] || r['tahun'] || 0);
      const tw = Number(r['Triwulan'] || r['triwulan'] || r['TW'] || 0);
      const harga = parsePrice(r['Harga'] ?? r['harga'] ?? r['Nilai']);

      if (harga > 0) {
        if (tahun === 2025 && tw === 3) {
          tw3_25_prices.push(harga);
          allLaluPrices.push(harga);
        } else if (tahun === 2025 && tw === 4) {
          tw4_25_prices.push(harga);
          allLaluPrices.push(harga);
        } else if (tahun === 2026 && tw === 1) {
          tw1_26_prices.push(harga);
          allLaluPrices.push(harga);
        } else if (tahun === 2026 && tw === 2) {
          tw2_26_prices.push(harga);
          allLaluPrices.push(harga);
        } else {
          // If quarter not strictly 2025-TW3..2026-TW2, but represents prior year
          allLaluPrices.push(harga);
        }
      }
    });

    const avgTw3_25 = tw3_25_prices.length > 0 ? Math.round(tw3_25_prices.reduce((a, b) => a + b, 0) / tw3_25_prices.length) : 0;
    const avgTw4_25 = tw4_25_prices.length > 0 ? Math.round(tw4_25_prices.reduce((a, b) => a + b, 0) / tw4_25_prices.length) : 0;
    const avgTw1_26 = tw1_26_prices.length > 0 ? Math.round(tw1_26_prices.reduce((a, b) => a + b, 0) / tw1_26_prices.length) : 0;
    const avgTw2_26 = tw2_26_prices.length > 0 ? Math.round(tw2_26_prices.reduce((a, b) => a + b, 0) / tw2_26_prices.length) : 0;

    const validLaluQuarters = [avgTw3_25, avgTw4_25, avgTw1_26, avgTw2_26].filter((v) => v > 0);
    const newHarga2026 = validLaluQuarters.length > 0
      ? Math.round(validLaluQuarters.reduce((a, b) => a + b, 0) / validLaluQuarters.length)
      : (allLaluPrices.length > 0 ? Math.round(allLaluPrices.reduce((a, b) => a + b, 0) / allLaluPrices.length) : 0);

    const oldHarga2026 = kab.harga2026;
    const oldRasio = kab.rasio;
    const newRasio =
      newHarga2026 > 0 && kab.harga2027 > 0
        ? parseFloat(((kab.harga2027 / newHarga2026) * 100).toFixed(2))
        : 0;

    // Update target
    kab.hargaTw3_2025 = avgTw3_25;
    kab.hargaTw4_2025 = avgTw4_25;
    kab.hargaTw1_2026 = avgTw1_26;
    kab.hargaTw2_2026 = avgTw2_26;
    kab.harga2026 = newHarga2026;
    kab.rasio = newRasio;

    const diff = newHarga2026 - oldHarga2026;
    const percentDiff = oldHarga2026 > 0 ? parseFloat(((diff / oldHarga2026) * 100).toFixed(2)) : 0;

    const quartersDetail = [
      avgTw3_25 > 0 ? `TW3'25: ${avgTw3_25.toLocaleString('id-ID')}` : '',
      avgTw4_25 > 0 ? `TW4'25: ${avgTw4_25.toLocaleString('id-ID')}` : '',
      avgTw1_26 > 0 ? `TW1'26: ${avgTw1_26.toLocaleString('id-ID')}` : '',
      avgTw2_26 > 0 ? `TW2'26: ${avgTw2_26.toLocaleString('id-ID')}` : ''
    ].filter(Boolean).join(' | ');

    comparison.push({
      kode: kab.kode,
      nama: kab.nama,
      oldValue: oldHarga2026,
      newValue: newHarga2026,
      diff,
      percentDiff,
      oldRasio,
      newRasio,
      quartersDetail: quartersDetail || 'Semua TW',
      respondentCount: kabRows.length
    });
  });

  return {
    updatedList,
    comparison,
    totalRows: rows.length,
    affectedKabCount,
    detectedCommodities: Array.from(detectedCommoditiesSet),
    rawRows: rows
  };
}

/**
 * Process File 3: Database IKK 2026 Webentry
 * Format sesuai dengan database_webentry_2026_f5274433.csv:
 * Kode Kabupaten/Kota;Nama Kabupaten/Kota;Kode Responden;Nama Responden;Jenis Kuesioner;Nama Komoditas;Nama Kualitas;Nama Merek;kualitas rekon;kode kualitas rekon;Satuan Standar;III-2025;IV-2025;I-2026;II-2026;cv
 *
 * Juga mendukung format ringkasan webentry legacy (Kabupaten, Harga 2026, Kode Kualitas 1, dll).
 */
export function processIKKWebentryUpload(
  rows: any[],
  currentList: KabupatenRekon[],
  commodityFilter?: string
): ParseResult {
  const updatedList: KabupatenRekon[] = currentList.map((k) => ({
    ...k,
    respondents: [...k.respondents]
  }));

  const detectedCommoditiesSet = new Set<string>();
  const groupedRows: Record<string, any[]> = {};

  rows.forEach((row) => {
    // Extract commodity / quality code from "kode kualitas rekon" (with canonical code normalization)
    const rawQualCodeField = String(
      row['kode kualitas rekon'] ??
      row['Kode Kualitas 1'] ??
      row['Kode Kualitas'] ??
      row['kode_kualitas_rekon'] ??
      ''
    ).trim();

    const qualCode = resolveRowQualCode(row);

    const commName = String(
      row['kualitas rekon'] ??
      row['Nama Komoditas'] ??
      row['Nama Kualitas'] ??
      row['Komoditas'] ??
      ''
    ).trim();

    const qualDisplay = qualCode ? `[${qualCode}] ${commName || rawQualCodeField}` : commName || rawQualCodeField;
    if (qualDisplay) detectedCommoditiesSet.add(qualDisplay);

    // Apply commodity filter if specified
    if (commodityFilter && commodityFilter !== 'ALL') {
      const q = commodityFilter.trim().toLowerCase();
      const filterCodeMatch = q.match(/\[?(\d{4})\]?/);
      const filterCode = filterCodeMatch ? filterCodeMatch[1] : '';

      let isMatch = false;
      if (filterCode && qualCode && qualCode === filterCode) {
        isMatch = true;
      } else if (qualCode && q.includes(qualCode) && qualCode.length >= 4) {
        isMatch = true;
      } else if (rawQualCodeField.toLowerCase().includes(q)) {
        isMatch = true;
      } else if (commName.toLowerCase().includes(q)) {
        isMatch = true;
      }

      if (!isMatch) return;
    }

    const rawKabCode = String(
      row['Kode Kabupaten/Kota'] ??
      row['Kode Kab'] ??
      row['Kode'] ??
      ''
    ).trim();

    const rawKabName = String(
      row['Nama Kabupaten/Kota'] ??
      row['Nama Kab'] ??
      row['Kabupaten'] ??
      row['Kota'] ??
      ''
    ).trim();

    const matched = findMatchingKabupaten(rawKabCode, rawKabName, updatedList);
    if (matched) {
      if (!groupedRows[matched.kode]) groupedRows[matched.kode] = [];
      groupedRows[matched.kode].push(row);
    }
  });

  const comparison: ComparisonItem[] = [];
  let affectedKabCount = 0;

  updatedList.forEach((kab) => {
    const kabRows = groupedRows[kab.kode];
    if (!kabRows || kabRows.length === 0) return;

    affectedKabCount++;

    const tw3_list: number[] = [];
    const tw4_list: number[] = [];
    const tw1_list: number[] = [];
    const tw2_list: number[] = [];
    const allPrices: number[] = [];

    kabRows.forEach((r) => {
      // Parse quarter prices (III-2025, IV-2025, I-2026, II-2026)
      const p3 = parsePrice(r['III-2025'] ?? r['Harga TW III 2025'] ?? r['TW3_2025'] ?? r['tw3_2025']);
      const p4 = parsePrice(r['IV-2025'] ?? r['Harga TW IV 2025'] ?? r['TW4_2025'] ?? r['tw4_2025']);
      const p1 = parsePrice(r['I-2026'] ?? r['Harga TW I 2026'] ?? r['TW1_2026'] ?? r['tw1_2026']);
      const p2 = parsePrice(r['II-2026'] ?? r['Harga TW II 2026'] ?? r['TW2_2026'] ?? r['tw2_2026']);
      const pDirect = parsePrice(r['Harga 2026'] ?? r['Harga2026'] ?? r['Nilai 2026']);

      if (p3 > 0) { tw3_list.push(p3); allPrices.push(p3); }
      if (p4 > 0) { tw4_list.push(p4); allPrices.push(p4); }
      if (p1 > 0) { tw1_list.push(p1); allPrices.push(p1); }
      if (p2 > 0) { tw2_list.push(p2); allPrices.push(p2); }
      if (pDirect > 0 && p3 === 0 && p4 === 0 && p1 === 0 && p2 === 0) {
        allPrices.push(pDirect);
      }
    });

    // Quarter averages
    const avgTw3 = tw3_list.length > 0 ? Math.round(tw3_list.reduce((a, b) => a + b, 0) / tw3_list.length) : 0;
    const avgTw4 = tw4_list.length > 0 ? Math.round(tw4_list.reduce((a, b) => a + b, 0) / tw4_list.length) : 0;
    const avgTw1 = tw1_list.length > 0 ? Math.round(tw1_list.reduce((a, b) => a + b, 0) / tw1_list.length) : 0;
    const avgTw2 = tw2_list.length > 0 ? Math.round(tw2_list.reduce((a, b) => a + b, 0) / tw2_list.length) : 0;

    const validQuarterAvgs = [avgTw3, avgTw4, avgTw1, avgTw2].filter((p) => p > 0);
    const newHarga2026 = validQuarterAvgs.length > 0
      ? Math.round(validQuarterAvgs.reduce((a, b) => a + b, 0) / validQuarterAvgs.length)
      : (allPrices.length > 0 ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0);

    const oldHarga2026 = kab.harga2026;
    const oldRasio = kab.rasio;
    const newRasio =
      newHarga2026 > 0 && kab.harga2027 > 0
        ? parseFloat(((kab.harga2027 / newHarga2026) * 100).toFixed(2))
        : 0;

    kab.hargaTw3_2025 = avgTw3;
    kab.hargaTw4_2025 = avgTw4;
    kab.hargaTw1_2026 = avgTw1;
    kab.hargaTw2_2026 = avgTw2;
    kab.harga2026 = newHarga2026;
    kab.rasio = newRasio;

    const diff = newHarga2026 - oldHarga2026;
    const percentDiff = oldHarga2026 > 0 ? parseFloat(((diff / oldHarga2026) * 100).toFixed(2)) : 0;

    const quartersDetail = [
      avgTw3 > 0 ? `TW3'25: ${avgTw3.toLocaleString('id-ID')}` : '',
      avgTw4 > 0 ? `TW4'25: ${avgTw4.toLocaleString('id-ID')}` : '',
      avgTw1 > 0 ? `TW1'26: ${avgTw1.toLocaleString('id-ID')}` : '',
      avgTw2 > 0 ? `TW2'26: ${avgTw2.toLocaleString('id-ID')}` : ''
    ].filter(Boolean).join(' | ');

    comparison.push({
      kode: kab.kode,
      nama: kab.nama,
      oldValue: oldHarga2026,
      newValue: newHarga2026,
      diff,
      percentDiff,
      oldRasio,
      newRasio,
      quartersDetail: quartersDetail || `Webentry 2026: ${newHarga2026 > 0 ? newHarga2026.toLocaleString('id-ID') : '-'}`,
      respondentCount: kabRows.length
    });
  });

  return {
    updatedList,
    comparison,
    totalRows: rows.length,
    affectedKabCount,
    detectedCommodities: Array.from(detectedCommoditiesSet),
    rawRows: rows
  };
}

/**
 * Detect template type from row headers
 */
export function detectTemplateType(rows: any[]): 'tabel71' | 'rekonda_responden' | 'rekonda_webentry' {
  if (!rows || rows.length === 0) return 'tabel71';
  const first = rows[0];
  const keys = Object.keys(first).map((k) => k.toLowerCase());

  // Webentry: checks for 'kode kualitas rekon', 'satuan standar', 'jenis kuesioner', 'kode kualitas 1', 'harga 2026', 'kode boq'
  if (keys.some((k) =>
    k.includes('kode kualitas rekon') ||
    k.includes('satuan standar') ||
    k.includes('jenis kuesioner') ||
    k.includes('kode kualitas 1') ||
    k.includes('kode boq') ||
    k.includes('harga 2026')
  )) {
    return 'rekonda_webentry';
  }

  // Responden 2026: checks for 'kualitas data', 'flag ganti', or 'responden' with 'kota'
  if (keys.some((k) =>
    k.includes('kualitas data') ||
    k.includes('flag ganti') ||
    (k.includes('responden') && (k.includes('kota') || k.includes('kualitas rekon')))
  )) {
    return 'rekonda_responden';
  }

  return 'tabel71';
}

/**
 * Dual Template 2026 Merge:
 * Sesuai aturan:
 * - Lookup utama di Database IKK REKONDA responden 2026 (berdasarkan Kualitas Data / Kode Kualitas Rekon).
 * - Jika kualitas atau kabupaten/kota tidak ditemukan di IKK REKONDA responden 2026, cari di Database IKK 2026 Webentry.
 * - Jika tidak ada di kedua database, tetap 0 (ditampilkan sebagai strip '-').
 */
export function processDual2026Merge(
  rekonnasRows: any[],
  webentryRows: any[],
  currentList: KabupatenRekon[],
  commodityCode: string
): ParseResult {
  const codeMatch = commodityCode.match(/\[?(\d{4})\]?/);
  const targetCode = codeMatch ? codeMatch[1] : commodityCode.trim();

  // Start with a fresh baseline where 2026 values are checked cleanly per kabupaten
  const resetBaseline: KabupatenRekon[] = currentList.map((k) => ({
    ...k,
    respondents: [...k.respondents],
    harga2026: 0,
    hargaTw3_2025: 0,
    hargaTw4_2025: 0,
    hargaTw1_2026: 0,
    hargaTw2_2026: 0
  }));

  const rekonResult = processIKKRespondenUpload(rekonnasRows, resetBaseline, targetCode || commodityCode);
  const webResult = processIKKWebentryUpload(webentryRows, resetBaseline, targetCode || commodityCode);

  const rekonCompMap = new Map(rekonResult.comparison.map((c) => [c.kode, c]));
  const webCompMap = new Map(webResult.comparison.map((c) => [c.kode, c]));

  const mergedComparison: ComparisonItem[] = [];
  let affectedKabCount = 0;

  const updatedList = currentList.map((origKab, idx) => {
    const fromRekon = rekonResult.updatedList[idx];
    const fromWeb = webResult.updatedList[idx];

    const hasRekon = fromRekon && fromRekon.harga2026 > 0;
    const hasWeb = fromWeb && fromWeb.harga2026 > 0;

    if (hasRekon) {
      affectedKabCount++;
      const comp = rekonCompMap.get(origKab.kode);
      if (comp) {
        const diff = fromRekon.harga2026 - origKab.harga2026;
        const percentDiff = origKab.harga2026 > 0 ? parseFloat(((diff / origKab.harga2026) * 100).toFixed(2)) : 0;
        mergedComparison.push({
          ...comp,
          oldValue: origKab.harga2026,
          oldRasio: origKab.rasio,
          diff,
          percentDiff,
          quartersDetail: `[IKK Rekonda] ${comp.quartersDetail}`
        });
      }
      return {
        ...origKab,
        harga2026: fromRekon.harga2026,
        hargaTw3_2025: fromRekon.hargaTw3_2025,
        hargaTw4_2025: fromRekon.hargaTw4_2025,
        hargaTw1_2026: fromRekon.hargaTw1_2026,
        hargaTw2_2026: fromRekon.hargaTw2_2026,
        rasio: fromRekon.rasio
      };
    } else if (hasWeb) {
      affectedKabCount++;
      const comp = webCompMap.get(origKab.kode);
      if (comp) {
        const diff = fromWeb.harga2026 - origKab.harga2026;
        const percentDiff = origKab.harga2026 > 0 ? parseFloat(((diff / origKab.harga2026) * 100).toFixed(2)) : 0;
        mergedComparison.push({
          ...comp,
          oldValue: origKab.harga2026,
          oldRasio: origKab.rasio,
          diff,
          percentDiff,
          quartersDetail: `[Webentry] ${comp.quartersDetail}`
        });
      }
      return {
        ...origKab,
        harga2026: fromWeb.harga2026,
        hargaTw3_2025: fromWeb.hargaTw3_2025,
        hargaTw4_2025: fromWeb.hargaTw4_2025,
        hargaTw1_2026: fromWeb.hargaTw1_2026,
        hargaTw2_2026: fromWeb.hargaTw2_2026,
        rasio: fromWeb.rasio
      };
    }

    // Not found in either IKK Responden or Webentry -> set 0 ('-')
    return {
      ...origKab,
      harga2026: 0,
      hargaTw3_2025: 0,
      hargaTw4_2025: 0,
      hargaTw1_2026: 0,
      hargaTw2_2026: 0,
      rasio: 0
    };
  });

  return {
    updatedList,
    comparison: mergedComparison,
    totalRows: rekonnasRows.length + webentryRows.length,
    affectedKabCount,
    detectedCommodities: Array.from(new Set([...rekonResult.detectedCommodities, ...webResult.detectedCommodities])),
    rawRows: rekonnasRows
  };
}

/**
 * Process Multi-Commodity / Full Database Upload across ALL 89 Komoditas/Kualitas in O(N) time.
 * - Jika file memuat > 1 kode kualitas rekon (atau mode dual_2026_merge), otomatis memproses & memperbarui SELURUH kualitas/komoditas!
 * - Jika file hanya memuat 1 kode kualitas rekon, hanya memperbarui komoditas tersebut.
 */
export function processMultiCommodityUpload(params: {
  mode: 'tabel71' | 'rekonnas' | 'webentry' | 'dual_2026_merge';
  rows: any[];
  webentryRows?: any[];
  database: Record<string, KabupatenRekon[]>;
  provinsiKode: string;
  komoditasList: Komoditas[];
  selectedKomoditasKode: string;
  fallbackList: KabupatenRekon[];
}): MultiParseResult {
  const {
    mode,
    rows,
    webentryRows = [],
    database,
    provinsiKode,
    komoditasList,
    selectedKomoditasKode,
    fallbackList
  } = params;

  const bucketByCode = new Map<string, any[]>();
  rows.forEach((r) => {
    const code = resolveRowQualCode(r);
    if (!code) return;
    if (!bucketByCode.has(code)) bucketByCode.set(code, []);
    bucketByCode.get(code)!.push(r);
  });

  const webBucketByCode = new Map<string, any[]>();
  webentryRows.forEach((r) => {
    const code = resolveRowQualCode(r);
    if (!code) return;
    if (!webBucketByCode.has(code)) webBucketByCode.set(code, []);
    webBucketByCode.get(code)!.push(r);
  });

  const isMultiCommodity =
    mode === 'dual_2026_merge' || bucketByCode.size > 1;

  const updatedDatabase: Record<string, KabupatenRekon[]> = {};
  let updatedCommoditiesCount = 0;
  let totalAffectedKabEntries = 0;
  let previewResult: ParseResult | null = null;
  let previewKomoditasKode = selectedKomoditasKode;
  let firstNonEmptyResult: { kode: string; res: ParseResult } | null = null;

  const targetList = isMultiCommodity
    ? komoditasList
    : (() => {
        const singleCode = bucketByCode.size === 1 ? Array.from(bucketByCode.keys())[0] : selectedKomoditasKode;
        const found = komoditasList.find((k) => k.kode === singleCode);
        return found ? [found] : komoditasList.filter((k) => k.kode === selectedKomoditasKode);
      })();

  targetList.forEach((kom) => {
    const key = `${provinsiKode}_${kom.kode}`;
    const baseList = database[key] || fallbackList;
    const rowsForKom = bucketByCode.get(kom.kode) || [];
    const webForKom = webBucketByCode.get(kom.kode) || [];

    let res: ParseResult;
    if (mode === 'tabel71') {
      res = processTabel71Upload(rowsForKom, baseList, 'ALL');
    } else if (mode === 'rekonnas') {
      res = processIKKRespondenUpload(rowsForKom, baseList, 'ALL');
    } else if (mode === 'webentry') {
      res = processIKKWebentryUpload(rowsForKom, baseList, 'ALL');
    } else {
      res = processDual2026Merge(rowsForKom, webForKom, baseList, kom.kode);
    }

    updatedDatabase[key] = res.updatedList;

    if (res.affectedKabCount > 0) {
      updatedCommoditiesCount++;
      totalAffectedKabEntries += res.affectedKabCount;
      if (!firstNonEmptyResult) {
        firstNonEmptyResult = { kode: kom.kode, res };
      }
    }

    if (kom.kode === selectedKomoditasKode) {
      previewResult = res;
      previewKomoditasKode = kom.kode;
    }
  });

  // If the selected commodity had 0 matches in the uploaded file, preview the first commodity that DID match
  if ((!previewResult || (previewResult as ParseResult).affectedKabCount === 0) && firstNonEmptyResult) {
    previewResult = (firstNonEmptyResult as { kode: string; res: ParseResult }).res;
    previewKomoditasKode = (firstNonEmptyResult as { kode: string; res: ParseResult }).kode;
  }

  if (!previewResult) {
    const fallbackBase = database[`${provinsiKode}_${selectedKomoditasKode}`] || fallbackList;
    previewResult = {
      updatedList: fallbackBase,
      comparison: [],
      totalRows: rows.length + webentryRows.length,
      affectedKabCount: 0,
      detectedCommodities: [],
      rawRows: rows
    };
  }

  const combinedCommoditiesCount =
    mode === 'dual_2026_merge'
      ? new Set([...bucketByCode.keys(), ...webBucketByCode.keys()]).size
      : bucketByCode.size;

  return {
    updatedDatabase,
    previewResult,
    previewKomoditasKode,
    totalRows: rows.length + webentryRows.length,
    updatedCommoditiesCount,
    totalCommoditiesInFile: combinedCommoditiesCount,
    totalAffectedKabEntries,
    isMultiCommodity
  };
}



