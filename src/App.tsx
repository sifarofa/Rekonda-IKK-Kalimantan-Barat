import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FilterSection } from './components/FilterSection';
import { RekonTable } from './components/RekonTable';
import { GrafikRekonda } from './components/GrafikRekonda';
import { AnomaliRekonTable } from './components/AnomaliRekonTable';
import { DocumentsView } from './components/DocumentsView';
import { DetailModal } from './components/DetailModal';
import { RespondentFormModal } from './components/RespondentFormModal';
import { NotePreviewModal } from './components/NotePreviewModal';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { DisplayAdjustModal } from './components/DisplayAdjustModal';
import { LoginLandingPage } from './components/LoginLandingPage';
import { Sidebar } from './components/Sidebar';
import { UserManagementModal } from './components/UserManagementModal';
import { LkSewaAlatModal } from './components/LkSewaAlatModal';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { SimulasiRankingView } from './components/SimulasiRankingView';
import { BukuPedomanView } from './components/BukuPedomanView';
import { PROVINSI_LIST, KOMODITAS_LIST, INITIAL_KABUPATEN_DATA } from './data/mockData';
import {
  ActiveViewType,
  CommodityMetaOverride,
  KabupatenRekon,
  RespondenData,
  Komoditas,
  Provinsi,
  UserAuth,
  StatusRekon,
  DisplaySettings,
  TipeSewaAlat,
  LkSewaAlatData,
  RekondaGlobalSettings,
  DEFAULT_GLOBAL_SETTINGS,
  ComparisonMode
} from './types/rekonda';
import { AppDocument } from './types/documents';
import { RegisteredAdmin } from './types/userAdmin';
import { calculateStats, getDominantBrand, formatRupiahNumber } from './utils/formatters';
import { getSewaAlatKabStatus, isSewaAlatKomoditas } from './utils/sewaAlatCalculator';
import { projectKabupatenByComparisonMode } from './utils/rekonComparison';
import {
  exportCurrentTableToExcel,
  exportSeluruhRespondenToExcel,
  exportSeluruhKualitasToExcel
} from './utils/excelExport';
import { downloadRekonDaerahPdf } from './utils/pdfExport';
import { supabase } from './lib/supabase';
import {
  APP_DOCUMENTS_TABLE,
  CLIENT_SESSION_ID,
  REKONDA_RECORDS_TABLE,
  REKONDA_SETTINGS_TABLE,
  fetchAllAppDocuments,
  fetchRekondaRecordsFromSupabase,
  fetchRekondaSettingsFromSupabase,
  isSystemSyncDocument,
  loadRekondaOverridesFromDoc,
  setKnownSystemSyncDocs,
  syncRekondaOverridesToSupabase,
  upsertRekondaBatchToSupabase,
  upsertRekondaRecordToSupabase,
  upsertRekondaSettingToSupabase
} from './services/supabaseDocuments';
import { hydrateRegisteredAdminsFromCloud } from './utils/userAdminStorage';
import { CheckCircle2, Menu, Database } from 'lucide-react';

const AUTH_SESSION_KEY = 'rekonda_auth_session_v2';
const DISPLAY_SESSION_KEY = 'rekonda_display_session_v1';

export default function App() {
  // Navigation View: 'rekon_daerah' | 'anomali_rekon' | 'simulasi_ranking' | 'dokumen_arsip'
  const [activeView, setActiveView] = useState<ActiveViewType>('rekon_daerah');

  // Authentication State (Tab session only — no persistent main data in localStorage)
  const [currentUser, setCurrentUser] = useState<UserAuth>(() => {
    try {
      const savedAuth = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedAuth) {
        return JSON.parse(savedAuth);
      }
    } catch {
      // ignore
    }
    return {
      isLoggedIn: false,
      email: null,
      name: null,
      isOwner: false,
      role: 'tamu'
    };
  });

  // Landing Page state
  const [showLandingLogin, setShowLandingLogin] = useState<boolean>(() => {
    try {
      const savedAuth = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
        if (parsed.isLoggedIn) return false;
      }
    } catch {}
    return true;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isDisplayAdjustOpen, setIsDisplayAdjustOpen] = useState<boolean>(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState<boolean>(false);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [lkModalState, setLkModalState] = useState<{
    isOpen: boolean;
    komoditasKode: string;
    kabupatenKode: string;
    respondentId: string | null;
  }>({
    isOpen: false,
    komoditasKode: '5101',
    kabupatenKode: '6101',
    respondentId: null
  });

  // Supabase Documents State (ordered created_at descending)
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Global Application Settings synced via Supabase `rekonda_settings`
  const [globalSettings, setGlobalSettings] = useState<RekondaGlobalSettings>(
    DEFAULT_GLOBAL_SETTINGS
  );

  // Device & Display Settings (Session + Supabase `rekonda_settings` display_defaults)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    try {
      const saved = sessionStorage.getItem(DISPLAY_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { density: 'normal', scale: 'normal', width: 'contained' };
  });

  const handleUpdateDisplaySettings = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings);
    try {
      sessionStorage.setItem(DISPLAY_SESSION_KEY, JSON.stringify(newSettings));
    } catch {}
    if (currentUser.isOwner || currentUser.role === 'pemilik') {
      lastLocalSettingsMutationAtRef.current = Date.now();
      upsertRekondaSettingToSupabase('display_defaults', newSettings).catch(() => {});
    }
    showToast('Tampilan berhasil disesuaikan.');
  };

  const handleResetDisplaySettings = () => {
    const defaultSettings: DisplaySettings = { density: 'normal', scale: 'normal', width: 'contained' };
    setDisplaySettings(defaultSettings);
    try {
      sessionStorage.setItem(DISPLAY_SESSION_KEY, JSON.stringify(defaultSettings));
    } catch {}
    if (currentUser.isOwner || currentUser.role === 'pemilik') {
      lastLocalSettingsMutationAtRef.current = Date.now();
      upsertRekondaSettingToSupabase('display_defaults', defaultSettings).catch(() => {});
    }
    showToast('Pengaturan tampilan dikembalikan ke standar.');
  };

  // Dynamic Commodity Names & Metadata synced from Templat Data Tahun Berjalan (`rekonda_settings.commodity_names`)
  const [commodityNameOverrides, setCommodityNameOverrides] = useState<
    Record<string, CommodityMetaOverride>
  >({});

  const komoditasList = useMemo<Komoditas[]>(() => {
    const mergedMap = new Map<string, Komoditas>();
    KOMODITAS_LIST.forEach((k) => {
      const ov = commodityNameOverrides[k.kode];
      mergedMap.set(
        k.kode,
        ov && ov.nama
          ? {
              kode: k.kode,
              nama: ov.nama,
              satuan: ov.satuan || k.satuan,
              kategori: ov.kategori || k.kategori
            }
          : k
      );
    });
    Object.values(commodityNameOverrides).forEach((ov) => {
      if (ov?.kode && !mergedMap.has(ov.kode)) {
        mergedMap.set(ov.kode, {
          kode: ov.kode,
          nama: ov.nama || `Komoditas ${ov.kode}`,
          satuan: ov.satuan || 'unit',
          kategori: ov.kategori || 'Lainnya'
        });
      }
    });
    return Array.from(mergedMap.values()).sort((a, b) => a.kode.localeCompare(b.kode));
  }, [commodityNameOverrides]);

  // Selected Province & Commodity
  const [selectedProvinsi, setSelectedProvinsi] = useState<Provinsi>(PROVINSI_LIST[0]);
  const [komoditasIndex, setKomoditasIndex] = useState<number>(0);
  const selectedKomoditas = komoditasList[komoditasIndex] || komoditasList[0];

  // Comparison mode for main table & anomaly table (Semua Responden vs Filter Merek Acuan '26 vs Apple-to-Apple Final '26)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('all');

  // Helper to ensure default template notes are blank, prices are cleaned, and status is 2-state
  const sanitizeCatatan = (db: Record<string, KabupatenRekon[]>): Record<string, KabupatenRekon[]> => {
    const cleaned: Record<string, KabupatenRekon[]> = {};
    for (const [key, list] of Object.entries(db)) {
      if (Array.isArray(list)) {
        cleaned[key] = list.map((item) => {
          const c = (item.catatan || '').trim();
          const isAuto =
            c.includes('Variasi harga antar') ||
            c.includes('Perubahan harga antar') ||
            c.includes('Perlu verifikasi') ||
            c.includes('terjustifikasi faktor') ||
            c.includes('Harga stabil') ||
            c.includes('Perubahan harga signifikan');

          // Clean mock 100000 price
          const isMock100k = item.harga2026 === 100000;
          const cleanHarga2026 = isMock100k ? 0 : item.harga2026 || 0;
          const cleanRasio = cleanHarga2026 > 0
            ? (item.rasio > 0 ? item.rasio : parseFloat(((item.harga2027 / cleanHarga2026) * 100).toFixed(2)))
            : 0;

          // Default status is strictly 'belum_rekon' for all kab/kota and all commodities unless explicitly marked 'rekon_selesai'
          const normalizedStatus: StatusRekon = item.statusRekon === 'rekon_selesai'
            ? 'rekon_selesai'
            : 'belum_rekon';

          const fallbackItem = INITIAL_KABUPATEN_DATA[key]?.find((k) => k.kode === item.kode);
          const respondents = Array.isArray(item.respondents)
            ? item.respondents
            : (fallbackItem?.respondents || []);

          // Derive current-year quarter averages strictly from respondents so un-uploaded quarters (e.g. TW I & II 2027) show '-'
          let cleanTw3_26 = item.hargaTw3_2026 || 0;
          let cleanTw4_26 = item.hargaTw4_2026 || 0;
          let cleanTw1_27 = item.hargaTw1_2027 || 0;
          let cleanTw2_27 = item.hargaTw2_2027 || 0;
          let cleanHarga2027 = item.harga2027 || 0;

          if (Array.isArray(item.respondents)) {
            if (respondents.length > 0) {
              const qTw3 = respondents.filter((r) => r.tahun === 2026 && r.triwulan === 3).map((r) => r.harga).filter((p) => p > 0);
              const qTw4 = respondents.filter((r) => r.tahun === 2026 && r.triwulan === 4).map((r) => r.harga).filter((p) => p > 0);
              const qTw1 = respondents.filter((r) => r.tahun === 2027 && r.triwulan === 1).map((r) => r.harga).filter((p) => p > 0);
              const qTw2 = respondents.filter((r) => r.tahun === 2027 && r.triwulan === 2).map((r) => r.harga).filter((p) => p > 0);

              cleanTw3_26 = qTw3.length > 0 ? Math.round(qTw3.reduce((a, b) => a + b, 0) / qTw3.length) : 0;
              cleanTw4_26 = qTw4.length > 0 ? Math.round(qTw4.reduce((a, b) => a + b, 0) / qTw4.length) : 0;
              cleanTw1_27 = qTw1.length > 0 ? Math.round(qTw1.reduce((a, b) => a + b, 0) / qTw1.length) : 0;
              cleanTw2_27 = qTw2.length > 0 ? Math.round(qTw2.reduce((a, b) => a + b, 0) / qTw2.length) : 0;

              const hasKabLevelLk =
                item.tipeSewa === 'all_in' &&
                Boolean(item.lkSewaAlat) &&
                (item.lkSewaAlat?.hasilSewaMurniBulan ?? 0) > 0 &&
                !respondents.some((r) => r.tipeSewa === 'all_in' && r.lkSewaAlat);

              if (!hasKabLevelLk) {
                const validQ = [cleanTw3_26, cleanTw4_26, cleanTw1_27, cleanTw2_27].filter((v) => v > 0);
                cleanHarga2027 = validQ.length > 0
                  ? Math.round(validQ.reduce((a, b) => a + b, 0) / validQ.length)
                  : 0;
              }
            } else if (!(item.tipeSewa === 'all_in' && (item.lkSewaAlat?.hasilSewaMurniBulan ?? 0) > 0)) {
              cleanTw3_26 = 0;
              cleanTw4_26 = 0;
              cleanTw1_27 = 0;
              cleanTw2_27 = 0;
              cleanHarga2027 = 0;
            }
          }

          const recomputedRasio = cleanHarga2026 > 0 && cleanHarga2027 > 0
            ? parseFloat(((cleanHarga2027 / cleanHarga2026) * 100).toFixed(2))
            : 0;

          return {
            ...item,
            harga2027: cleanHarga2027,
            hargaTw3_2026: cleanTw3_26,
            hargaTw4_2026: cleanTw4_26,
            hargaTw1_2027: cleanTw1_27,
            hargaTw2_2027: cleanTw2_27,
            harga2026: cleanHarga2026,
            hargaTw3_2025: isMock100k ? 0 : item.hargaTw3_2025 || 0,
            hargaTw4_2025: isMock100k ? 0 : item.hargaTw4_2025 || 0,
            hargaTw1_2026: isMock100k ? 0 : item.hargaTw1_2026 || 0,
            hargaTw2_2026: isMock100k ? 0 : item.hargaTw2_2026 || 0,
            rasio: recomputedRasio,
            statusRekon: normalizedStatus,
            isVerified: normalizedStatus === 'rekon_selesai',
            catatan: isAuto ? '' : c,
            respondents: respondents
          };
        });
      }
    }
    return cleaned;
  };

  // Database of all datasets keyed by `${provinsiKode}_${komoditasKode}` (cloud-synced via Supabase, zero localStorage)
  const [database, setDatabase] = useState<Record<string, KabupatenRekon[]>>(() =>
    sanitizeCatatan(INITIAL_KABUPATEN_DATA)
  );
  const syncedOverridesRef = useRef<Record<string, KabupatenRekon[]>>({});
  const dbSyncTimerRef = useRef<number | null>(null);
  const recordsRealtimeDebounceRef = useRef<number | null>(null);
  const settingsRealtimeDebounceRef = useRef<number | null>(null);
  const lastLocalRecordMutationAtRef = useRef<number>(0);
  const lastLocalSettingsMutationAtRef = useRef<number>(0);

  // Dynamic Chart Data synced with Table sorting
  const [chartSortedData, setChartSortedData] = useState<KabupatenRekon[]>([]);

  // Selected for interactions
  const [selectedKabupatenId, setSelectedKabupatenId] = useState<string | null>(null);
  const [detailModalKab, setDetailModalKab] = useState<KabupatenRekon | null>(null);
  const [noteModalKab, setNoteModalKab] = useState<KabupatenRekon | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Respondent Form Modal State
  const [respondentForm, setRespondentForm] = useState<{
    isOpen: boolean;
    initialData?: RespondenData | null;
    defaultTahun?: number;
    defaultTriwulan?: number;
  }>({
    isOpen: false,
    initialData: null,
    defaultTahun: 2026,
    defaultTriwulan: 3
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  const scheduleDatabaseCloudSync = useCallback(
    (targetKey: string, updatedList: KabupatenRekon[]) => {
      syncedOverridesRef.current = {
        ...syncedOverridesRef.current,
        [targetKey]: updatedList
      };

      if (dbSyncTimerRef.current) {
        window.clearTimeout(dbSyncTimerRef.current);
      }

      dbSyncTimerRef.current = window.setTimeout(() => {
        const snapshot = { ...syncedOverridesRef.current };
        const actor = currentUser.email || currentUser.name || 'Admin';
        syncRekondaOverridesToSupabase(snapshot, actor).catch((err) => {
          console.warn('Supabase database sync notice:', err);
        });
      }, 350);
    },
    [currentUser.email, currentUser.name]
  );

  // Fetch global, display, & commodity name settings from Supabase `rekonda_settings`
  const fetchSettings = useCallback(
    async (fromRealtime: boolean = false) => {
      try {
        const { globalConfig, displayDefaults, commodityNames } =
          await fetchRekondaSettingsFromSupabase();
        if (globalConfig) {
          setGlobalSettings({
            ...DEFAULT_GLOBAL_SETTINGS,
            ...globalConfig
          });
        }
        if (displayDefaults && displayDefaults.density && displayDefaults.scale && displayDefaults.width) {
          const hasLocalDisplayOverride = Boolean(sessionStorage.getItem(DISPLAY_SESSION_KEY));
          if (!hasLocalDisplayOverride || fromRealtime) {
            setDisplaySettings(displayDefaults as DisplaySettings);
          }
        }
        if (commodityNames && typeof commodityNames === 'object') {
          setCommodityNameOverrides(commodityNames);
        }
        if (fromRealtime && Date.now() - lastLocalSettingsMutationAtRef.current > 2000) {
          showToast('Pengaturan & penamaan komoditas diperbarui otomatis dari perangkat lain.');
        }
      } catch (err) {
        console.warn('Supabase rekonda_settings fetch notice:', err);
      }
    },
    [showToast]
  );

  // Upsert global settings into Supabase `rekonda_settings` (Admin Provinsi ONLY)
  const handleSaveGlobalSettings = useCallback(
    async (nextSettings: RekondaGlobalSettings) => {
      const isProvinsiAdmin = currentUser.isOwner || currentUser.role === 'pemilik';
      if (!isProvinsiAdmin) {
        throw new Error('Akses terbatas: Pengaturan Global hanya dapat diubah oleh Admin Provinsi.');
      }
      lastLocalSettingsMutationAtRef.current = Date.now();
      await upsertRekondaSettingToSupabase('global_config', nextSettings);
      setGlobalSettings(nextSettings);
      showToast('Pengaturan global berhasil disimpan & disinkronkan ke semua perangkat.');
    },
    [currentUser.isOwner, currentUser.role, showToast]
  );

  // Fetch Rekon data from Supabase `rekonda_records` (with fallback merge from `app_documents` snapshot)
  const fetchData = useCallback(
    async (fromRealtime: boolean = false) => {
      try {
        const [recordsOverrides, allDocs] = await Promise.all([
          fetchRekondaRecordsFromSupabase('61').catch(() => ({} as Record<string, KabupatenRekon[]>)),
          fetchAllAppDocuments().catch(() => [] as AppDocument[])
        ]);

        let snapshotOverrides: Record<string, KabupatenRekon[]> = {};
        if (allDocs.length > 0) {
          setKnownSystemSyncDocs(allDocs);
          setDocuments(allDocs.filter((doc) => !isSystemSyncDocument(doc)));

          const adminDoc = allDocs.find(
            (d) => d.metadata?.is_system && d.metadata?.system_type === 'rekonda_admins'
          );
          if (adminDoc && Array.isArray(adminDoc.metadata?.admins)) {
            hydrateRegisteredAdminsFromCloud(adminDoc.metadata.admins as RegisteredAdmin[]);
          }

          const dbDoc = allDocs.find(
            (d) => d.metadata?.is_system && d.metadata?.system_type === 'rekonda_db_snapshot'
          );
          if (dbDoc) {
            const parsedSnap = await loadRekondaOverridesFromDoc(dbDoc);
            if (parsedSnap) snapshotOverrides = parsedSnap;
          }
        }

        const mergedDb: Record<string, KabupatenRekon[]> = {
          ...INITIAL_KABUPATEN_DATA,
          ...snapshotOverrides
        };

        // Overlay granular records from `rekonda_records` per kabupaten code
        for (const [key, recList] of Object.entries(recordsOverrides)) {
          const baseList = mergedDb[key] || INITIAL_KABUPATEN_DATA[key] || [];
          const recByKode = new Map(recList.map((r) => [r.kode, r]));
          if (baseList.length > 0) {
            mergedDb[key] = baseList.map((baseItem) => recByKode.get(baseItem.kode) || baseItem);
          } else {
            mergedDb[key] = recList;
          }
        }

        syncedOverridesRef.current = {
          ...snapshotOverrides,
          ...recordsOverrides
        };

        setDatabase(sanitizeCatatan(mergedDb));

        if (fromRealtime && Date.now() - lastLocalRecordMutationAtRef.current > 2000) {
          showToast('Data Rekon diperbarui otomatis dari perangkat lain.');
        }
      } catch (err: any) {
        console.warn('Supabase fetchData notice:', err);
      }
    },
    [showToast]
  );

  // Load all app_documents ordered by created_at DESC (and hydrate cloud data + admin users)
  const loadSupabaseDocumentsAndState = useCallback(async () => {
    setIsLoadingDocs(true);
    setDocsError(null);
    try {
      const allDocs = await fetchAllAppDocuments();
      setKnownSystemSyncDocs(allDocs);

      // Visible user documents
      setDocuments(allDocs.filter((doc) => !isSystemSyncDocument(doc)));

      // Hydrate Registered Admins from newest system sync row
      const adminDoc = allDocs.find(
        (d) => d.metadata?.is_system && d.metadata?.system_type === 'rekonda_admins'
      );
      if (adminDoc && Array.isArray(adminDoc.metadata?.admins)) {
        hydrateRegisteredAdminsFromCloud(adminDoc.metadata.admins as RegisteredAdmin[]);
      }

      // Hydrate Rekon Database from `rekonda_records` + fallback snapshot
      await fetchData(false);
    } catch (err: any) {
      setDocsError(err.message || 'Gagal memuat data dari Supabase.');
    } finally {
      setIsLoadingDocs(false);
    }
  }, [fetchData]);

  // Initial fetch + Supabase Realtime listeners (`rekonda-realtime` w/ 800ms debounce + `app_documents`)
  useEffect(() => {
    loadSupabaseDocumentsAndState();
    fetchSettings(false);

    const rekondaChannel = supabase
      .channel('rekonda-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: REKONDA_RECORDS_TABLE },
        () => {
          if (recordsRealtimeDebounceRef.current) {
            window.clearTimeout(recordsRealtimeDebounceRef.current);
          }
          recordsRealtimeDebounceRef.current = window.setTimeout(() => {
            fetchData(true);
          }, 800);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: REKONDA_SETTINGS_TABLE },
        () => {
          if (settingsRealtimeDebounceRef.current) {
            window.clearTimeout(settingsRealtimeDebounceRef.current);
          }
          settingsRealtimeDebounceRef.current = window.setTimeout(() => {
            fetchSettings(true);
          }, 800);
        }
      )
      .subscribe();

    const docsChannel = supabase
      .channel('app_documents_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: APP_DOCUMENTS_TABLE },
        async (payload) => {
          const eventType = payload.eventType;
          const newRow = payload.new as AppDocument | undefined;
          const oldRow = payload.old as { id?: string } | undefined;

          if (eventType === 'INSERT' && newRow) {
            if (isSystemSyncDocument(newRow)) {
              setKnownSystemSyncDocs([newRow]);
              if (
                newRow.metadata?.system_type === 'rekonda_admins' &&
                newRow.metadata?.client_id !== CLIENT_SESSION_ID &&
                Array.isArray(newRow.metadata.admins)
              ) {
                hydrateRegisteredAdminsFromCloud(newRow.metadata.admins as RegisteredAdmin[]);
              } else if (
                newRow.metadata?.system_type === 'rekonda_db_snapshot' &&
                newRow.metadata?.client_id !== CLIENT_SESSION_ID
              ) {
                if (recordsRealtimeDebounceRef.current) {
                  window.clearTimeout(recordsRealtimeDebounceRef.current);
                }
                recordsRealtimeDebounceRef.current = window.setTimeout(() => {
                  fetchData(true);
                }, 800);
              }
              return;
            }

            setDocuments((prev) => {
              if (prev.some((d) => d.id === newRow.id)) return prev;
              return [newRow, ...prev].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
            });
            return;
          }

          if (eventType === 'UPDATE' && newRow) {
            if (isSystemSyncDocument(newRow)) {
              setKnownSystemSyncDocs([newRow]);
              if (
                newRow.metadata?.system_type === 'rekonda_admins' &&
                newRow.metadata?.client_id !== CLIENT_SESSION_ID &&
                Array.isArray(newRow.metadata.admins)
              ) {
                hydrateRegisteredAdminsFromCloud(newRow.metadata.admins as RegisteredAdmin[]);
              }
              return;
            }

            setDocuments((prev) =>
              prev.map((d) => (d.id === newRow.id ? newRow : d))
            );
            return;
          }

          if (eventType === 'DELETE' && oldRow?.id) {
            setDocuments((prev) => prev.filter((d) => d.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      if (dbSyncTimerRef.current) {
        window.clearTimeout(dbSyncTimerRef.current);
      }
      if (recordsRealtimeDebounceRef.current) {
        window.clearTimeout(recordsRealtimeDebounceRef.current);
      }
      if (settingsRealtimeDebounceRef.current) {
        window.clearTimeout(settingsRealtimeDebounceRef.current);
      }
      supabase.removeChannel(rekondaChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [fetchData, fetchSettings, loadSupabaseDocumentsAndState]);

  // Auth Login Handlers
  const handleLoginOwner = (email: string, _name: string) => {
    const authObj: UserAuth = {
      isLoggedIn: true,
      email,
      name: 'Admin Provinsi (BPS Kalbar)',
      isOwner: true,
      role: 'pemilik'
    };
    setCurrentUser(authObj);
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authObj));
    } catch {}
    setShowLandingLogin(false);
    showToast('Berhasil masuk sebagai Admin Provinsi (BPS Kalbar). Akses penuh aktif.');
  };

  const handleLoginKabupaten = (kode: string, nama: string) => {
    const authObj: UserAuth = {
      isLoggedIn: true,
      email: `bps${kode}@bps.go.id`,
      name: `Admin BPS ${nama}`,
      isOwner: false,
      role: 'kabupaten',
      kabupatenKode: kode,
      kabupatenNama: nama
    };
    setCurrentUser(authObj);
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authObj));
    } catch {}
    setActiveView('anomali_rekon');
    setShowLandingLogin(false);
    showToast(`Berhasil masuk sebagai Admin BPS ${nama} [${kode}]. Mode Anomali Wilayah aktif.`);
  };

  const handleEnterAsGuest = () => {
    const guestAuth: UserAuth = {
      isLoggedIn: false,
      email: null,
      name: 'Tamu (Pratinjau)',
      isOwner: false,
      role: 'tamu'
    };
    setCurrentUser(guestAuth);
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(guestAuth));
    } catch {}
    setShowLandingLogin(false);
    showToast('Memasuki aplikasi dalam Mode Tamu (Pratinjau Publik).');
  };

  const handleLogin = (email: string, name: string) => {
    const isOwner = email.toLowerCase() === 'harga6100@gmail.com';
    const authObj: UserAuth = {
      isLoggedIn: true,
      email,
      name,
      isOwner,
      role: isOwner ? 'pemilik' : 'tamu'
    };
    setCurrentUser(authObj);
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authObj));
    } catch {}
    setShowLandingLogin(false);
    showToast(isOwner ? 'Berhasil masuk sebagai Pemilik Akun (Akses Penuh).' : `Berhasil masuk sebagai ${name}.`);
  };

  const handleLogout = () => {
    const guestAuth: UserAuth = {
      isLoggedIn: false,
      email: null,
      name: null,
      isOwner: false,
      role: 'tamu'
    };
    setCurrentUser(guestAuth);
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch {}
    setShowLandingLogin(true);
    showToast('Anda telah keluar dari akun.');
  };

  // Current Key
  const currentKey = `${selectedProvinsi.kode}_${selectedKomoditas.kode}`;

  // Helper to get or generate data for current combo
  const currentKabupatenData = useMemo(() => {
    if (database[currentKey]) {
      return database[currentKey];
    }
    const baseList = INITIAL_KABUPATEN_DATA['61_0102'] || [];
    const multiplierMap: Record<string, number> = {
      '0101': 1.6,
      '0103': 1.8,
      '0104': 0.7,
      '0201': 0.9,
      '0205': 15.0,
      '0301': 4.5,
      '0401': 1.3,
      '0402': 1.1,
      '0501': 12.0
    };
    const mult = multiplierMap[selectedKomoditas.kode] || 1;

    return baseList.map((item) => {
      const h27 = Math.round(item.harga2027 * mult);
      const h26 = Math.round(item.harga2026 * mult);
      return {
        ...item,
        id: `${selectedProvinsi.kode}_${item.kode}_${selectedKomoditas.kode}`,
        harga2027: h27,
        hargaTw3_2026: Math.round(item.hargaTw3_2026 * mult),
        hargaTw4_2026: Math.round(item.hargaTw4_2026 * mult),
        hargaTw1_2027: Math.round(item.hargaTw1_2027 * mult),
        hargaTw2_2027: Math.round(item.hargaTw2_2027 * mult),
        harga2026: h26,
        rasio: h26 > 0 ? parseFloat(((h27 / h26) * 100).toFixed(2)) : 100,
        namaKualitas: `${selectedKomoditas.nama} Standar`,
        catatan: `Survei berkala untuk ${selectedKomoditas.nama} di wilayah ${item.nama}.`,
        statusRekon: item.statusRekon || 'belum_rekon',
        aksiRekon: item.aksiRekon || '',
        respondents: item.respondents.map((r, i) => ({
          ...r,
          id: `${item.kode}_res_${i}`,
          harga: Math.round(r.harga * mult)
        }))
      };
    });
  }, [database, currentKey, selectedProvinsi.kode, selectedKomoditas]);

  // Projected dataset for display & comparison mode (non-destructive: keeps raw respondents untouched)
  const projectedKabupatenData = useMemo(
    () =>
      currentKabupatenData.map((k) =>
        projectKabupatenByComparisonMode(k, selectedKomoditas.kode, comparisonMode)
      ),
    [currentKabupatenData, selectedKomoditas.kode, comparisonMode]
  );

  // Recalculate kabupaten metrics according to IKK cross-year 2026/2027 specs
  // For Sewa Alat (5101 - 5803): main table aggregates automatically ONLY once ALL respondents are pure rent (sewa_murni or LK-computed all_in)
  const recalculateKabupatenMetrics = (
    kab: KabupatenRekon,
    isSewaAlatFlag?: boolean
  ): KabupatenRekon => {
    const res = kab.respondents || [];
    const isSewaAlat = isSewaAlatFlag ?? false;

    if (isSewaAlat) {
      const st = getSewaAlatKabStatus(kab);
      const derivedTipeSewa: TipeSewaAlat = st.allPure
        ? st.hasAnyLk
          ? 'all_in'
          : 'sewa_murni'
        : st.waitingLkCount > 0
        ? 'all_in'
        : 'belum_konfirmasi';

      // If kab has respondents and NOT all are pure rent yet, preserve main RekonTable aggregate until all respondents are converted/confirmed
      if (res.length > 0 && !st.allPure) {
        return {
          ...kab,
          tipeSewa: derivedTipeSewa
        };
      }

      // If kab has 0 respondents and LK was applied directly at kab level
      if (res.length === 0) {
        const hasKabLk =
          kab.tipeSewa === 'all_in' &&
          Boolean(kab.lkSewaAlat) &&
          (kab.lkSewaAlat?.hasilSewaMurniBulan ?? 0) > 0;
        const nextHarga2027 = hasKabLk ? Math.round(kab.lkSewaAlat!.hasilSewaMurniBulan) : kab.harga2027;
        const nextRasio =
          kab.harga2026 > 0 ? parseFloat(((nextHarga2027 / kab.harga2026) * 100).toFixed(2)) : 0;
        return {
          ...kab,
          tipeSewa: derivedTipeSewa,
          harga2027: nextHarga2027,
          rasio: nextRasio
        };
      }

      // Otherwise all respondents are pure rent -> fall through to compute aggregate TW, Harga 2027, CV, Rasio!
      kab = { ...kab, tipeSewa: derivedTipeSewa };
    }

    // Quarters for Current Year (IKK 2027: TW 3 & 4 2026, TW 1 & 2 2027)
    const tw3_26 = res.filter((r) => r.tahun === 2026 && r.triwulan === 3).map((r) => r.harga);
    const tw4_26 = res.filter((r) => r.tahun === 2026 && r.triwulan === 4).map((r) => r.harga);
    const tw1_27 = res.filter((r) => r.tahun === 2027 && r.triwulan === 1).map((r) => r.harga);
    const tw2_27 = res.filter((r) => r.tahun === 2027 && r.triwulan === 2).map((r) => r.harga);

    const statTw3_26 = calculateStats(tw3_26);
    const statTw4_26 = calculateStats(tw4_26);
    const statTw1_27 = calculateStats(tw1_27);
    const statTw2_27 = calculateStats(tw2_27);

    // Calculate available quarters average for Harga 2027
    const validQuarterMeans = [
      statTw3_26.mean,
      statTw4_26.mean,
      statTw1_27.mean,
      statTw2_27.mean
    ].filter((m) => m > 0);

    const hasCalculatedLkMurni =
      !isSewaAlat &&
      kab.tipeSewa === 'all_in' &&
      Boolean(kab.lkSewaAlat) &&
      (kab.lkSewaAlat?.hasilSewaMurniBulan ?? 0) > 0;

    const newHarga2027 = hasCalculatedLkMurni
      ? Math.round(kab.lkSewaAlat!.hasilSewaMurniBulan)
      : res.length > 0
      ? validQuarterMeans.length > 0
        ? Math.round(validQuarterMeans.reduce((a, b) => a + b, 0) / validQuarterMeans.length)
        : 0
      : kab.harga2027 || 0;

    // Koefisien Variasi: variasi harga antar responden di kab/kota yang sama (tahun berjalan)
    const allCurrentPrices = res
      .filter((r) => (r.tahun === 2026 && (r.triwulan === 3 || r.triwulan === 4)) || (r.tahun === 2027 && (r.triwulan === 1 || r.triwulan === 2)))
      .map((r) => r.harga)
      .filter((p) => p > 0);

    const respondentStats =
      allCurrentPrices.length > 0
        ? calculateStats(allCurrentPrices)
        : { mean: 0, sd: 0, cv: 0 };

    // Dominant Brand (Mode)
    const newDominantBrand =
      newHarga2027 > 0
        ? getDominantBrand(res, kab.namaKualitas && kab.namaKualitas !== '-' ? kab.namaKualitas : 'Standar')
        : '-';

    // Rasio: (Harga 2027 / Harga 2026) * 100 (0 jika salah satu kosong)
    const newRasio =
      newHarga2027 > 0 && kab.harga2026 > 0
        ? parseFloat(((newHarga2027 / kab.harga2026) * 100).toFixed(2))
        : 0;

    return {
      ...kab,
      hargaTw3_2026: res.length > 0 ? statTw3_26.mean : kab.hargaTw3_2026 || 0,
      hargaTw4_2026: res.length > 0 ? statTw4_26.mean : kab.hargaTw4_2026 || 0,
      hargaTw1_2027: res.length > 0 ? statTw1_27.mean : kab.hargaTw1_2027 || 0,
      hargaTw2_2027: res.length > 0 ? statTw2_27.mean : kab.hargaTw2_2027 || 0,
      harga2027: newHarga2027,
      koefisienVariasi: res.length > 0 ? respondentStats.cv : newHarga2027 > 0 ? kab.koefisienVariasi : 0,
      namaKualitas: newDominantBrand,
      rasio: newRasio
    };
  };

  // Sync updated list to Supabase Cloud + server fallback (NO localStorage)
  const saveUpdatedList = (updatedList: KabupatenRekon[]) => {
    setDatabase((prev) => {
      const nextDb = {
        ...prev,
        [currentKey]: updatedList
      };

      scheduleDatabaseCloudSync(currentKey, updatedList);

      fetch('/api/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: nextDb })
      }).catch((err) => console.log('Server sync notice:', err));

      return nextDb;
    });
  };

  // Update a single Kabupaten record
  const handleUpdateKabupaten = (updated: KabupatenRekon) => {
    const recomputed = recalculateKabupatenMetrics(
      updated,
      isSewaAlatKomoditas(selectedKomoditas.kode)
    );
    const currentList = [...currentKabupatenData];
    const index = currentList.findIndex((item) => item.id === recomputed.id || item.kode === recomputed.kode);
    if (index >= 0) {
      currentList[index] = recomputed;
    } else {
      currentList.push(recomputed);
    }
    lastLocalRecordMutationAtRef.current = Date.now();
    saveUpdatedList(currentList);
    upsertRekondaRecordToSupabase(currentKey, recomputed).catch(() => {});

    // Sync active detail modal
    if (detailModalKab && (detailModalKab.id === recomputed.id || detailModalKab.kode === recomputed.kode)) {
      setDetailModalKab(recomputed);
    }

    // Also persist single update to server
    fetch('/api/kabupaten/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: currentKey, kabupaten: recomputed })
    }).catch(() => {});
  };

  // Update Anomali Row with single Catatan field across any commodity key
  const handleUpdateAnomali = (
    targetKey: string,
    kabupatenId: string,
    status: StatusRekon,
    catatan: string
  ) => {
    const isProvinsiAdmin = currentUser.isOwner || currentUser.role === 'pemilik';
    if (!isProvinsiAdmin && (globalSettings.isRekonLocked || !globalSettings.allowKabKotaEditAnomali)) {
      showToast('Input rekon sedang dikunci oleh Admin Provinsi.');
      return;
    }

    let updatedRecord: KabupatenRekon | null = null;
    setDatabase((prev) => {
      const list = [...(prev[targetKey] || [])];
      const idx = list.findIndex((k) => k.id === kabupatenId || k.kode === kabupatenId);
      if (idx >= 0) {
        updatedRecord = {
          ...list[idx],
          statusRekon: status,
          catatan,
          isVerified: status === 'rekon_selesai'
        };
        list[idx] = updatedRecord;
      }
      const nextDb = { ...prev, [targetKey]: list };

      lastLocalRecordMutationAtRef.current = Date.now();
      scheduleDatabaseCloudSync(targetKey, list);
      if (updatedRecord) {
        upsertRekondaRecordToSupabase(targetKey, updatedRecord).catch(() => {});
      }

      fetch('/api/anomali/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: targetKey,
          kabupatenId,
          statusRekon: status,
          catatan
        })
      }).catch(() => {});

      return nextDb;
    });

    showToast(`Status Rekon & Catatan berhasil diperbarui & disinkronkan ke cloud.`);
  };

  // Open LK Penghitungan Sewa Alat Modal (Admin Provinsi ONLY)
  const handleOpenLkModal = (
    komoditasKode?: string,
    kabupatenKode?: string,
    respondentId?: string | null
  ) => {
    const isProvinsiAdmin = currentUser.isLoggedIn && (currentUser.isOwner || currentUser.role === 'pemilik');
    if (!isProvinsiAdmin) {
      if (!currentUser.isLoggedIn) {
        setIsAuthModalOpen(true);
      } else {
        showToast('Akses terbatas: LK Penghitungan Sewa Alat hanya dapat diakses oleh Admin Provinsi.');
      }
      return;
    }

    const targetKom =
      komoditasKode && isSewaAlatKomoditas(komoditasKode)
        ? komoditasKode
        : isSewaAlatKomoditas(selectedKomoditas.kode)
        ? selectedKomoditas.kode
        : '5101';

    const targetKab = kabupatenKode || '6101';

    setLkModalState({
      isOpen: true,
      komoditasKode: targetKom,
      kabupatenKode: targetKab,
      respondentId: respondentId || null
    });
  };

  // Helper: persist a recomputed Kabupaten record to DB + server + active detailModal
  const persistKabupatenChange = (
    targetKey: string,
    kabupatenKode: string,
    updater: (kab: KabupatenRekon) => KabupatenRekon
  ): KabupatenRekon | null => {
    let updatedKabSnapshot: KabupatenRekon | null = null;
    const isSewa = isSewaAlatKomoditas(targetKey.split('_')[1] || selectedKomoditas.kode);

    setDatabase((prev) => {
      const list = [...(prev[targetKey] || [])];
      const idx = list.findIndex((k) => k.kode === kabupatenKode || k.id === kabupatenKode);
      if (idx < 0) return prev;

      const updatedRaw = updater(list[idx]);
      const recomputed = recalculateKabupatenMetrics(updatedRaw, isSewa);
      list[idx] = recomputed;
      updatedKabSnapshot = recomputed;

      const nextDb = { ...prev, [targetKey]: list };
      lastLocalRecordMutationAtRef.current = Date.now();
      scheduleDatabaseCloudSync(targetKey, list);
      upsertRekondaRecordToSupabase(targetKey, recomputed).catch(() => {});

      fetch('/api/kabupaten/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: targetKey, kabupaten: recomputed })
      }).catch(() => {});

      fetch('/api/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: nextDb })
      }).catch(() => {});

      return nextDb;
    });

    if (
      updatedKabSnapshot &&
      detailModalKab &&
      (detailModalKab as KabupatenRekon).kode === kabupatenKode
    ) {
      setDetailModalKab(updatedKabSnapshot);
    }

    return updatedKabSnapshot;
  };

  // Confirm Sewa Murni / All-In / Belum Konfirmasi per Responden (or Kab fallback when respondentId === null)
  const handleChangeTipeSewa = (
    targetKey: string,
    kabupatenKode: string,
    respondentId: string | null,
    nextTipeSewa: TipeSewaAlat
  ) => {
    if (!currentUser.isLoggedIn) {
      setIsAuthModalOpen(true);
      return;
    }

    const isProvinsiAdmin = currentUser.isOwner || currentUser.role === 'pemilik';
    if (!isProvinsiAdmin && (globalSettings.isRekonLocked || !globalSettings.allowKabKotaKonfSewa)) {
      showToast('Konfirmasi sewa alat sedang dikunci oleh Admin Provinsi.');
      return;
    }

    const canEditTarget =
      isProvinsiAdmin ||
      (currentUser.role === 'kabupaten' && currentUser.kabupatenKode === kabupatenKode);

    if (!canEditTarget) {
      showToast(`Akses ditolak: Anda hanya berhak mengubah konfirmasi sewa wilayah [${currentUser.kabupatenKode}].`);
      return;
    }

    const updatedKab = persistKabupatenChange(targetKey, kabupatenKode, (existing) => {
      if (respondentId && existing.respondents && existing.respondents.length > 0) {
        const nextRespondents = existing.respondents.map((r) => {
          if (r.id !== respondentId) return r;
          const restoredHarga =
            nextTipeSewa !== 'all_in' &&
            r.lkSewaAlat?.hargaAwalSebelumLk &&
            r.lkSewaAlat.hargaAwalSebelumLk > 0
              ? r.lkSewaAlat.hargaAwalSebelumLk
              : r.harga;
          return {
            ...r,
            tipeSewa: nextTipeSewa,
            harga: restoredHarga
          };
        });
        return {
          ...existing,
          respondents: nextRespondents
        };
      }

      // Kab-level fallback (e.g. 0 respondents) or batch update
      const restoredBaseHarga =
        nextTipeSewa !== 'all_in' &&
        existing.lkSewaAlat?.hargaAwalSebelumLk &&
        existing.lkSewaAlat.hargaAwalSebelumLk > 0
          ? existing.lkSewaAlat.hargaAwalSebelumLk
          : existing.harga2027;

      const nextRespondents = (existing.respondents || []).map((r) => {
        const restoredHarga =
          nextTipeSewa !== 'all_in' &&
          r.lkSewaAlat?.hargaAwalSebelumLk &&
          r.lkSewaAlat.hargaAwalSebelumLk > 0
            ? r.lkSewaAlat.hargaAwalSebelumLk
            : r.harga;
        return {
          ...r,
          tipeSewa: nextTipeSewa,
          harga: restoredHarga
        };
      });

      return {
        ...existing,
        tipeSewa: nextTipeSewa,
        harga2027: restoredBaseHarga,
        respondents: nextRespondents
      };
    });

    const komKode = targetKey.split('_')[1] || selectedKomoditas.kode;

    if (nextTipeSewa === 'all_in') {
      if (isProvinsiAdmin) {
        handleOpenLkModal(komKode, kabupatenKode, respondentId);
      } else {
        showToast(
          `Konfirmasi All-In tersimpan. Penghitungan Sewa Murni di LK akan dilakukan oleh Admin Provinsi.`
        );
      }
      return;
    }

    const st = updatedKab ? getSewaAlatKabStatus(updatedKab) : null;
    if (st && st.total > 0 && st.allPure) {
      showToast(
        `Seluruh responden [${kabupatenKode}] sudah Sewa Murni (${st.pureCount}/${st.total}). Tabel Rekon Daerah utama otomatis dihitung!`
      );
    } else {
      showToast(
        nextTipeSewa === 'sewa_murni'
          ? `Status sewa dikonfirmasi sebagai Sewa Murni.${
              st && st.total > 0 ? ` (${st.pureCount}/${st.total} responden siap)` : ''
            }`
          : `Status konfirmasi sewa dikembalikan ke Belum Konfirmasi.`
      );
    }
  };

  // Apply calculated LK Sewa Alat Murni -> updates Responden price first, then auto-updates main Tabel Rekon Daerah once ALL respondents in Kab/Kota are pure rent
  const handleApplyLkResult = (
    targetKey: string,
    kabupatenKode: string,
    respondentId: string | null,
    lkData: LkSewaAlatData,
    appendCatatan: boolean,
    markRekonSelesai: boolean
  ) => {
    if (!currentUser.isLoggedIn) {
      setIsAuthModalOpen(true);
      return;
    }

    const updatedKab = persistKabupatenChange(targetKey, kabupatenKode, (existing) => {
      const nextStatus: StatusRekon = markRekonSelesai
        ? 'rekon_selesai'
        : existing.statusRekon || 'belum_rekon';

      let nextCatatan = existing.catatan || '';
      if (appendCatatan) {
        const allInInput =
          lkData.mode === 'alat_berat'
            ? lkData.biayaAllInBulan
            : lkData.tarifAllInGenset || lkData.biayaAllInBulan;

        if (respondentId) {
          const respName =
            existing.respondents.find((r) => r.id === respondentId)?.nama || respondentId;
          const respTag = `[LK ${respName}: All-In Rp ${formatRupiahNumber(
            allInInput
          )} -> Murni Rp ${formatRupiahNumber(lkData.hasilSewaMurniBulan)} (${lkData.adjustPajakProfitPct}%)]`;
          const escapedName = respName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          nextCatatan = nextCatatan
            .replace(new RegExp(`\\s*\\[LK ${escapedName}:[^\\]]*\\]`, 'g'), '')
            .trim();
          nextCatatan = nextCatatan ? `${nextCatatan} ${respTag}` : respTag;
        } else {
          nextCatatan = nextCatatan.replace(/\s*\[LK Sewa Murni:[^\]]*\]/g, '').trim();
          const lkNoteTag = `[LK Sewa Murni: All-In Rp ${formatRupiahNumber(
            allInInput
          )} -> Murni Rp ${formatRupiahNumber(lkData.hasilSewaMurniBulan)} (Adj. ${
            lkData.adjustPajakProfitPct
          }%${lkData.includeWorkshop && lkData.mode === 'alat_berat' ? ', incl. Workshop' : ''})]`;
          nextCatatan = nextCatatan ? `${nextCatatan} ${lkNoteTag}` : lkNoteTag;
        }
      }

      if (respondentId && existing.respondents && existing.respondents.length > 0) {
        const nextRespondents = existing.respondents.map((r) => {
          if (r.id !== respondentId) return r;
          return {
            ...r,
            tipeSewa: 'all_in' as TipeSewaAlat,
            lkSewaAlat: lkData,
            harga: lkData.hasilSewaMurniBulan
          };
        });

        return {
          ...existing,
          respondents: nextRespondents,
          catatan: nextCatatan,
          statusRekon: nextStatus,
          isVerified: nextStatus === 'rekon_selesai'
        };
      }

      // Kab-level fallback when 0 respondents exist
      return {
        ...existing,
        tipeSewa: 'all_in',
        lkSewaAlat: lkData,
        harga2027: lkData.hasilSewaMurniBulan,
        catatan: nextCatatan,
        statusRekon: nextStatus,
        isVerified: nextStatus === 'rekon_selesai'
      };
    });

    const st = updatedKab ? getSewaAlatKabStatus(updatedKab) : null;
    if (st && st.total > 0) {
      if (st.allPure) {
        showToast(
          `Harga responden diubah ke Sewa Murni (Rp ${formatRupiahNumber(
            lkData.hasilSewaMurniBulan
          )}). Semua ${st.total} responden siap — Tabel Rekon Daerah utama otomatis diperbarui!`
        );
      } else {
        showToast(
          `Detail responden diperbarui (Rp ${formatRupiahNumber(
            lkData.hasilSewaMurniBulan
          )}). Progres Kab/Kota: ${st.pureCount}/${st.total} responden siap Sewa Murni.`
        );
      }
    } else {
      showToast(
        `Biaya sewa murni (Rp ${formatRupiahNumber(
          lkData.hasilSewaMurniBulan
        )}) berhasil diterapkan ke Tabel Rekon Daerah & Tabel Anomali!`
      );
    }
  };

  // Guard Dokumen & Arsip and Simulasi Ranking views strictly for Admin Provinsi
  useEffect(() => {
    const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';
    if ((activeView === 'dokumen_arsip' || activeView === 'simulasi_ranking') && !isPemilik) {
      setActiveView(currentUser.role === 'kabupaten' ? 'anomali_rekon' : 'rekon_daerah');
    }
  }, [activeView, currentUser.isOwner, currentUser.role]);

  // Upload Apply Data (Supports Multi-Commodity & Single-Commodity updates + Dynamic Commodity Naming from Tabel 7.1)
  const handleApplyUploadedData = (
    updatedDatabaseSlice: Record<string, KabupatenRekon[]>,
    sheetType: 'rekonda26' | 'tabel71',
    summary?: {
      updatedCommoditiesCount: number;
      isMultiCommodity: boolean;
      commodityMetadata?: Record<string, CommodityMetaOverride>;
    }
  ) => {
    const recomputedSlice: Record<string, KabupatenRekon[]> = {};

    for (const [key, updatedList] of Object.entries(updatedDatabaseSlice)) {
      const komKode = key.split('_')[1] || selectedKomoditas.kode;
      const isSewa = isSewaAlatKomoditas(komKode);

      recomputedSlice[key] = updatedList.map((item) => {
        const metric = recalculateKabupatenMetrics(item, isSewa);
        if (sheetType === 'rekonda26') {
          metric.harga2026 = item.harga2026;
          metric.hargaTw3_2025 = item.hargaTw3_2025;
          metric.hargaTw4_2025 = item.hargaTw4_2025;
          metric.hargaTw1_2026 = item.hargaTw1_2026;
          metric.hargaTw2_2026 = item.hargaTw2_2026;
          metric.rasio =
            item.harga2026 > 0 && metric.harga2027 > 0
              ? parseFloat(((metric.harga2027 / item.harga2026) * 100).toFixed(2))
              : 0;
        }
        return metric;
      });
    }

    if (
      sheetType === 'tabel71' &&
      summary?.commodityMetadata &&
      Object.keys(summary.commodityMetadata).length > 0
    ) {
      const mergedNames: Record<string, CommodityMetaOverride> = {
        ...commodityNameOverrides,
        ...summary.commodityMetadata
      };
      setCommodityNameOverrides(mergedNames);
      lastLocalSettingsMutationAtRef.current = Date.now();
      upsertRekondaSettingToSupabase('commodity_names', mergedNames).catch((err) => {
        console.warn('Supabase commodity_names sync notice:', err);
      });
    }

    setDatabase((prev) => {
      const nextDb = {
        ...prev,
        ...recomputedSlice
      };

      syncedOverridesRef.current = {
        ...syncedOverridesRef.current,
        ...recomputedSlice
      };

      lastLocalRecordMutationAtRef.current = Date.now();
      const actor = currentUser.email || currentUser.name || 'Admin Provinsi';

      upsertRekondaBatchToSupabase(recomputedSlice).catch((err) => {
        console.warn('Supabase rekonda_records batch sync notice:', err);
      });

      syncRekondaOverridesToSupabase(syncedOverridesRef.current, actor).catch((err) => {
        console.warn('Supabase database sync notice:', err);
      });

      fetch('/api/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: nextDb })
      }).catch((err) => console.log('Server sync notice:', err));

      return nextDb;
    });

    const countLabel = summary?.updatedCommoditiesCount || Object.keys(recomputedSlice).length;
    showToast(
      sheetType === 'rekonda26'
        ? summary?.isMultiCommodity
          ? `Data Harga Tahun Sebelumnya untuk ${countLabel} komoditas/kualitas berhasil diperbarui ke kolom Harga 2026!`
          : 'Data tahun sebelumnya berhasil disinkronkan ke kolom Harga 2026!'
        : summary?.isMultiCommodity
        ? `Data Harga Tahun Berjalan & penamaan untuk ${countLabel} komoditas/kualitas berhasil diperbarui!`
        : 'Data Harga Tahun Berjalan & nama komoditas berhasil diperbarui ke kolom Harga 2027!'
    );
  };

  // Stepper handlers
  const handlePrevKomoditas = () => {
    setKomoditasIndex((prev) => (prev > 0 ? prev - 1 : komoditasList.length - 1));
  };

  const handleNextKomoditas = () => {
    setKomoditasIndex((prev) => (prev < komoditasList.length - 1 ? prev + 1 : 0));
  };

  const handleTampilkan = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchData(false), fetchSettings(false)]);
      showToast('Data rekonsiliasi & pengaturan global berhasil dimuat dari Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    downloadRekonDaerahPdf({
      provinsi: selectedProvinsi,
      komoditas: selectedKomoditas,
      data: chartSortedData.length > 0 ? chartSortedData : projectedKabupatenData,
      periodeText: globalSettings.periodeBannerText
    });
    showToast('File PDF Rekon Daerah berhasil diunduh.');
  };

  // Add / Edit Respondent handlers
  const handleOpenAddRespondent = (defaultTahun?: number, defaultTw?: number) => {
    if (!currentUser.isOwner) {
      alert('Akses khusus Admin Provinsi (harga6100@gmail.com).');
      return;
    }
    setRespondentForm({
      isOpen: true,
      initialData: null,
      defaultTahun: defaultTahun || 2026,
      defaultTriwulan: defaultTw || 3
    });
  };

  const handleOpenEditRespondent = (item: RespondenData) => {
    if (!currentUser.isOwner) {
      alert('Akses khusus Admin Provinsi (harga6100@gmail.com).');
      return;
    }
    setRespondentForm({
      isOpen: true,
      initialData: item,
      defaultTahun: item.tahun,
      defaultTriwulan: item.triwulan
    });
  };

  const handleSaveRespondent = (respData: Omit<RespondenData, 'id'> & { id?: string }) => {
    if (!detailModalKab) return;

    let updatedRespondents: RespondenData[];
    if (respData.id) {
      updatedRespondents = detailModalKab.respondents.map((r) =>
        r.id === respData.id ? ({ ...r, ...respData } as RespondenData) : r
      );
      showToast(`Data responden ${respData.nama} berhasil diperbarui.`);
    } else {
      const newEntry: RespondenData = {
        id: `res_${Date.now()}`,
        ...respData
      };
      updatedRespondents = [...detailModalKab.respondents, newEntry];
      showToast(`Responden ${respData.nama} berhasil ditambahkan.`);
    }

    const updatedKab = {
      ...detailModalKab,
      respondents: updatedRespondents
    };
    handleUpdateKabupaten(updatedKab);
  };

  const handleDeleteRespondent = (id: string) => {
    if (!detailModalKab) return;
    const updatedRespondents = detailModalKab.respondents.filter((r) => r.id !== id);
    const updatedKab = {
      ...detailModalKab,
      respondents: updatedRespondents
    };
    handleUpdateKabupaten(updatedKab);
    showToast('Data responden berhasil dihapus.');
  };

  // Note Modal Save
  const handleSaveNote = (kabupatenId: string, noteText: string) => {
    if (!currentUser.isLoggedIn) {
      setIsAuthModalOpen(true);
      return;
    }
    const isProvinsiAdmin = currentUser.isOwner || currentUser.role === 'pemilik';
    if (!isProvinsiAdmin && (globalSettings.isRekonLocked || !globalSettings.allowKabKotaEditAnomali)) {
      showToast('Input rekon sedang dikunci oleh Admin Provinsi.');
      return;
    }
    const kab = currentKabupatenData.find((k) => k.id === kabupatenId);
    if (kab) {
      handleUpdateKabupaten({
        ...kab,
        catatan: noteText
      });
      showToast(`Catatan untuk ${kab.nama} berhasil disimpan ke server.`);
    }
  };

  // Excel exports
  const handleExportExcelTable = () => {
    exportCurrentTableToExcel(selectedProvinsi, selectedKomoditas, projectedKabupatenData);
    showToast('Tabel berhasil diekspor ke file Excel (.xlsx).');
  };

  const handleExportSeluruhKualitas = () => {
    exportSeluruhKualitasToExcel(selectedProvinsi, komoditasList, database);
    showToast(`Seluruh data harga dari ${komoditasList.length} kualitas/komoditas berhasil diekspor ke Excel (.xlsx).`);
  };

  const handleExportSeluruhResponden = () => {
    exportSeluruhRespondenToExcel(selectedProvinsi, komoditasList, database);
    showToast(`Seluruh data responden dari ${komoditasList.length} kualitas/komoditas berhasil diekspor ke Excel (.xlsx).`);
  };

  // Sync active detail modal (always resolve from unprojected currentKabupatenData so all raw respondents stay visible/editable)
  const activeDetailKab = detailModalKab
    ? currentKabupatenData.find((k) => k.id === detailModalKab.id || k.kode === detailModalKab.kode) || detailModalKab
    : null;

  const anomalyCount = projectedKabupatenData.filter(
    (d) =>
      (d.harga2027 > 0 && d.koefisienVariasi > 20) ||
      (d.harga2027 > 0 && d.harga2026 > 0 && (d.rasio > 120 || d.rasio < 80))
  ).length;

  // If Landing Login is requested or active
  if (showLandingLogin) {
    return (
      <LoginLandingPage
        currentUser={currentUser}
        onLoginOwner={handleLoginOwner}
        onLoginKabupaten={handleLoginKabupaten}
        onEnterAsGuest={handleEnterAsGuest}
        onClose={currentUser.isLoggedIn ? () => setShowLandingLogin(false) : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-80 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Fixed Uncollapsed Sidebar (Desktop: always visible, Mobile: toggled drawer) */}
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => {
          const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';
          if (v === 'dokumen_arsip' && !isPemilik) {
            showToast('Akses terbatas: Menu Dokumen & Arsip khusus Admin Provinsi.');
            return;
          }
          if (v === 'simulasi_ranking' && !isPemilik) {
            showToast('Akses terbatas: Menu Simulasi Ranking khusus Admin Provinsi.');
            return;
          }
          if (currentUser.role === 'kabupaten' && v === 'rekon_daerah') {
            showToast(`Perhatian: Akun Admin Kab/Kota [${currentUser.kabupatenKode}] berfokus pada penyelesaian Tabel Anomali Rekon.`);
          }
          setActiveView(v);
          setIsMobileSidebarOpen(false);
        }}
        anomalyCount={anomalyCount}
        documentsCount={documents.length}
        currentUser={currentUser}
        onOpenAuth={() => {
          setIsMobileSidebarOpen(false);
          setIsAuthModalOpen(true);
        }}
        onOpenLandingLogin={() => {
          setIsMobileSidebarOpen(false);
          setShowLandingLogin(true);
        }}
        onOpenUpload={() => {
          setIsMobileSidebarOpen(false);
          setIsUploadModalOpen(true);
        }}
        onOpenDisplayAdjust={() => {
          setIsMobileSidebarOpen(false);
          setIsDisplayAdjustOpen(true);
        }}
        onOpenGlobalSettings={() => {
          const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';
          if (!isPemilik) {
            showToast('Akses terbatas: Menu Pengaturan Global khusus Admin Provinsi.');
            return;
          }
          setIsMobileSidebarOpen(false);
          setIsGlobalSettingsOpen(true);
        }}
        globalSettings={globalSettings}
        onOpenUserManagement={() => {
          setIsMobileSidebarOpen(false);
          setIsUserManagementOpen(true);
        }}
        onOpenLkSewaAlat={() => handleOpenLkModal()}
        onDownloadSeluruhKualitas={() => {
          setIsMobileSidebarOpen(false);
          handleExportSeluruhKualitas();
        }}
        onDownloadSeluruhResponden={() => {
          setIsMobileSidebarOpen(false);
          handleExportSeluruhResponden();
        }}
        onLogout={() => {
          setIsMobileSidebarOpen(false);
          handleLogout();
        }}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Layout with desktop left padding for fixed sidebar */}
      <div className="lg:pl-64 print:pl-0 flex flex-col flex-1 min-h-screen min-w-0 w-full">
        {/* Mobile Sidebar Launcher Strip ONLY (No Header Menu Bar) */}
        <div className="lg:hidden sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-3 h-12 flex items-center justify-between gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 cursor-pointer shrink-0"
          >
            <Menu className="w-4 h-4 text-rose-400" />
            <span>Menu</span>
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <Database className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-extrabold text-sm tracking-tight font-mono truncate">
              REKONDA
            </span>
          </div>

          <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[110px]">
            {currentUser.isOwner || currentUser.role === 'pemilik'
              ? 'Admin Prov'
              : currentUser.role === 'kabupaten'
              ? `[${currentUser.kabupatenKode}]`
              : 'Tamu'}
          </span>
        </div>

        {/* Main Container with responsive scaling and width adjust */}
        <main
          className={`flex-1 w-full min-w-0 ${
            displaySettings.width === 'full' ? 'max-w-none px-2 sm:px-4 lg:px-6' : 'max-w-7xl mx-auto px-2 sm:px-4 lg:px-6'
          } ${
            displaySettings.scale === 'small'
              ? 'text-[92%]'
              : displaySettings.scale === 'large'
              ? 'text-[108%]'
              : 'text-[100%]'
          } py-3 sm:py-4 transition-all duration-150`}
        >
        {/* View Switcher: Rekon Daerah vs Tabel Anomali Rekon vs Dokumen & Arsip */}
        {activeView === 'rekon_daerah' ? (
          <>
            {/* Filter & Banner Section */}
            <FilterSection
              provinsiList={PROVINSI_LIST}
              selectedProvinsi={selectedProvinsi}
              onSelectProvinsi={(prov) => {
                setSelectedProvinsi(prov);
                setSelectedKabupatenId(null);
              }}
              komoditasList={komoditasList}
              selectedKomoditas={selectedKomoditas}
              onSelectKomoditas={(kom) => {
                const idx = komoditasList.findIndex((k) => k.kode === kom.kode);
                if (idx >= 0) setKomoditasIndex(idx);
              }}
              currentIndex={komoditasIndex}
              totalKomoditas={komoditasList.length}
              onPrevKomoditas={handlePrevKomoditas}
              onNextKomoditas={handleNextKomoditas}
              onTampilkan={handleTampilkan}
              isLoading={isLoading}
              onDownloadSeluruhKualitas={handleExportSeluruhKualitas}
              onDownloadSeluruhResponden={handleExportSeluruhResponden}
              data={projectedKabupatenData}
              globalSettings={globalSettings}
            />

            {/* Main Data Table with Responsive Scroll & Density */}
            <RekonTable
              data={projectedKabupatenData}
              selectedKomoditas={selectedKomoditas}
              dbKey={currentKey}
              density={displaySettings.density}
              comparisonMode={comparisonMode}
              onChangeComparisonMode={setComparisonMode}
              onOpenDetail={(item) => {
                const rawItem =
                  currentKabupatenData.find((k) => k.id === item.id || k.kode === item.kode) || item;
                setDetailModalKab(rawItem);
                setSelectedKabupatenId(rawItem.id);
              }}
              onOpenNote={(item) => {
                if (!currentUser.isLoggedIn) {
                  setIsAuthModalOpen(true);
                  return;
                }
                const rawItem =
                  currentKabupatenData.find((k) => k.id === item.id || k.kode === item.kode) || item;
                setNoteModalKab(rawItem);
              }}
              onExportExcel={handleExportExcelTable}
              onPrint={handlePrint}
              selectedId={selectedKabupatenId}
              onSelectRow={(item) => setSelectedKabupatenId(item.id)}
              onSortedDataChange={(sorted) => setChartSortedData(sorted)}
              onOpenLkSewaAlat={(kab) => handleOpenLkModal(selectedKomoditas.kode, kab.kode)}
              onChangeTipeSewa={(kab, nextTipe) =>
                handleChangeTipeSewa(currentKey, kab.kode, null, nextTipe)
              }
              currentUser={currentUser}
            />

            {/* Dynamic Bar Chart: Exactly synchronized with table sort order */}
            <GrafikRekonda
              data={chartSortedData.length > 0 ? chartSortedData : projectedKabupatenData}
              onSelectKabupaten={(item) => {
                const rawItem =
                  currentKabupatenData.find((k) => k.id === item.id || k.kode === item.kode) || item;
                setSelectedKabupatenId(rawItem.id);
                setDetailModalKab(rawItem);
              }}
              selectedId={selectedKabupatenId}
            />
          </>
        ) : activeView === 'anomali_rekon' ? (
          /* Tabel Anomali Rekon */
          <AnomaliRekonTable
            database={database}
            density={displaySettings.density}
            komoditasList={komoditasList}
            provinsi={selectedProvinsi}
            selectedKomoditas={selectedKomoditas}
            currentUser={currentUser}
            comparisonMode={comparisonMode}
            onChangeComparisonMode={setComparisonMode}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onUpdateAnomali={handleUpdateAnomali}
            onOpenLkSewaAlat={(komKode, kabKode) => handleOpenLkModal(komKode, kabKode)}
            onChangeTipeSewa={(targetDbKey, kabKode, nextTipe) =>
              handleChangeTipeSewa(targetDbKey, kabKode, null, nextTipe)
            }
            onOpenDetail={(kab, kom) => {
              const idx = komoditasList.findIndex((k) => k.kode === kom.kode);
              if (idx >= 0) setKomoditasIndex(idx);
              setDetailModalKab(kab);
              setSelectedKabupatenId(kab.id);
            }}
          />
        ) : activeView === 'simulasi_ranking' ? (
          /* Simulasi Ranking & What-If Harga (Mode Sandbox Lokal, Khusus Admin Provinsi) */
          <SimulasiRankingView
            database={database}
            provinsi={selectedProvinsi}
            komoditasList={komoditasList}
            activeTriwulan={globalSettings.defaultTriwulanAktif}
            currentUser={currentUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        ) : activeView === 'buku_pedoman' ? (
          /* Buku Pedoman Penggunaan Web untuk Admin Kab/Kota */
          <BukuPedomanView
            currentUser={currentUser}
            globalSettings={globalSettings}
            onNavigateView={(v) => setActiveView(v)}
            onOpenUserManagement={() => setIsUserManagementOpen(true)}
          />
        ) : (
          /* Dokumen & Arsip Cloud (Supabase Storage + Realtime app_documents) */
          <DocumentsView
            documents={documents}
            isLoadingDocs={isLoadingDocs}
            docsError={docsError}
            currentUser={currentUser}
            komoditasList={komoditasList}
            onRefreshDocuments={loadSupabaseDocumentsAndState}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onSuccessToast={showToast}
          />
        )}
      </main>


      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-[11px] py-3.5 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span>REKONDA 2026/2027 · Sistem Rekonsiliasi Data IKK Lintas Tahun</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Standar Indeks Kemahalan Konstruksi (IKK)</span>
            <span>·</span>
            <span>Supabase Cloud Sync Active</span>
          </div>
        </div>
      </footer>
      </div>

      {/* Detail Rekonda Modal (Matching Screenshot 2 + Sorting on respondents + Per-Respondent Sewa Alat) */}
      {activeDetailKab && (
        <DetailModal
          isOpen={Boolean(activeDetailKab)}
          onClose={() => setDetailModalKab(null)}
          kabupaten={activeDetailKab}
          komoditas={selectedKomoditas}
          onUpdateKabupaten={handleUpdateKabupaten}
          onOpenAddRespondent={handleOpenAddRespondent}
          onOpenEditRespondent={handleOpenEditRespondent}
          onDeleteRespondent={handleDeleteRespondent}
          onChangeRespondentTipeSewa={(kabKode, respId, nextTipe) =>
            handleChangeTipeSewa(currentKey, kabKode, respId, nextTipe)
          }
          onBatchChangeAllRespondentsTipeSewa={(kabKode, nextTipe) =>
            handleChangeTipeSewa(currentKey, kabKode, null, nextTipe)
          }
          onOpenLkForRespondent={(komKode, kabKode, respId) =>
            handleOpenLkModal(komKode, kabKode, respId)
          }
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* Add / Edit Respondent Form Modal */}
      <RespondentFormModal
        isOpen={respondentForm.isOpen}
        onClose={() => setRespondentForm((prev) => ({ ...prev, isOpen: false }))}
        onSave={handleSaveRespondent}
        initialData={respondentForm.initialData}
        defaultTahun={respondentForm.defaultTahun}
        defaultTriwulan={respondentForm.defaultTriwulan}
        kabupatenNama={detailModalKab ? `[${detailModalKab.kode}] ${detailModalKab.nama}` : ''}
      />

      {/* Note Quick Viewer & Editor Modal */}
      {noteModalKab && (
        <NotePreviewModal
          isOpen={Boolean(noteModalKab)}
          onClose={() => setNoteModalKab(null)}
          kabupaten={noteModalKab}
          onSaveNote={handleSaveNote}
        />
      )}

      {/* Auth Modal (Google Login / Owner Verification) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onOpenLandingLogin={() => {
          setIsAuthModalOpen(false);
          setShowLandingLogin(true);
        }}
        onLogout={handleLogout}
      />

      {/* Document Upload Modal (rekonda26 & Harga Tahun Berjalan) */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        currentData={currentKabupatenData}
        database={database}
        komoditasList={komoditasList}
        provinsiKode={selectedProvinsi.kode}
        onApplyData={handleApplyUploadedData}
        selectedKomoditas={selectedKomoditas}
        onQuickLoginAsOwner={() => handleLogin('harga6100@gmail.com', 'Admin Rekonda')}
      />

      {/* Display & Device Adjuster Modal */}
      <DisplayAdjustModal
        isOpen={isDisplayAdjustOpen}
        onClose={() => setIsDisplayAdjustOpen(false)}
        settings={displaySettings}
        onUpdateSettings={handleUpdateDisplaySettings}
        onResetSettings={handleResetDisplaySettings}
      />

      {/* User Management Modal (Tambah & Kelola Admin Kab/Kota) */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        onSuccessToast={showToast}
        currentUser={currentUser}
      />

      {/* LK Penghitungan Sewa Alat Berat (Kode 5101 - 5803, Per-Responden, Khusus Admin Provinsi) */}
      <LkSewaAlatModal
        isOpen={lkModalState.isOpen}
        onClose={() => setLkModalState((prev) => ({ ...prev, isOpen: false }))}
        provinsi={selectedProvinsi}
        komoditasList={komoditasList}
        database={database}
        initialKomoditasKode={lkModalState.komoditasKode}
        initialKabupatenKode={lkModalState.kabupatenKode}
        initialRespondentId={lkModalState.respondentId}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onApplyLkResult={handleApplyLkResult}
        onChangeTipeSewa={handleChangeTipeSewa}
      />

      {/* Global Settings Modal (Supabase `rekonda_settings`) */}
      <GlobalSettingsModal
        isOpen={isGlobalSettingsOpen}
        onClose={() => setIsGlobalSettingsOpen(false)}
        settings={globalSettings}
        currentUser={currentUser}
        onSaveSettings={handleSaveGlobalSettings}
      />
    </div>
  );
}

