import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Lock,
  Unlock,
  Calendar,
  Save,
  RefreshCw,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import {
  ActiveTriwulanKey,
  DEFAULT_GLOBAL_SETTINGS,
  RekondaGlobalSettings,
  UserAuth
} from '../types/rekonda';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RekondaGlobalSettings;
  currentUser: UserAuth;
  onSaveSettings: (nextSettings: RekondaGlobalSettings) => Promise<void>;
}

const TRIWULAN_OPTIONS: { value: ActiveTriwulanKey; label: string }[] = [
  { value: 'III-2026', label: 'TW III 2026 (Juli – September 2026)' },
  { value: 'IV-2026', label: 'TW IV 2026 (Oktober – Desember 2026)' },
  { value: 'I-2027', label: 'TW I 2027 (Januari – Maret 2027)' },
  { value: 'II-2027', label: 'TW II 2027 (April – Juni 2027)' }
];

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  currentUser,
  onSaveSettings
}) => {
  const [draft, setDraft] = useState<RekondaGlobalSettings>(settings);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
      setErrorMsg('');
    }
  }, [isOpen, settings]);

  const isPemilik = currentUser.isOwner || currentUser.role === 'pemilik';

  if (!isOpen || !isPemilik) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPemilik) return;

    setIsSaving(true);
    setErrorMsg('');
    try {
      await onSaveSettings({
        ...draft,
        updatedBy: currentUser.email || currentUser.name || 'Admin Provinsi',
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pengaturan global ke Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shadow-xs">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Pengaturan Global Aplikasi (Sync Cloud)
              </h4>
              <p className="text-[11px] text-slate-400">
                Disimpan ke Supabase &amp; aktif otomatis di semua perangkat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {!isPemilik && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Hanya Admin Provinsi yang dapat mengubah pengaturan global aplikasi.</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
              {errorMsg}
            </div>
          )}

          {/* 1. Triwulan Aktif Default */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-rose-600" />
              <span>Periode / Triwulan Aktif Default</span>
            </label>
            <select
              disabled={!isPemilik || isSaving}
              value={draft.defaultTriwulanAktif}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  defaultTriwulanAktif: e.target.value as ActiveTriwulanKey
                }))
              }
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 disabled:bg-slate-100 cursor-pointer"
            >
              {TRIWULAN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Label Banner Periode */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 block">
              Label Keterangan Periode Header
            </label>
            <input
              type="text"
              disabled={!isPemilik || isSaving}
              value={draft.periodeBannerText}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, periodeBannerText: e.target.value }))
              }
              placeholder={DEFAULT_GLOBAL_SETTINGS.periodeBannerText}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 disabled:bg-slate-100"
            />
          </div>

          {/* 3. Status Kunci Input / Rekon Kab/Kota */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {draft.isRekonLocked ? (
                  <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <Unlock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-slate-900">
                    Kunci Input &amp; Perubahan Rekon (Kab/Kota)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Jika aktif, seluruh akun Admin Kab/Kota hanya dapat membaca data (Read-Only). Admin Provinsi tetap memiliki akses penuh.
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!isPemilik || isSaving}
                onClick={() =>
                  setDraft((prev) => ({ ...prev, isRekonLocked: !prev.isRekonLocked }))
                }
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${
                  draft.isRekonLocked
                    ? 'bg-rose-600 text-white border-rose-700'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {draft.isRekonLocked ? 'Terkunci' : 'Terbuka'}
              </button>
            </div>

            <div className="pt-2.5 border-t border-slate-200 space-y-2">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-700 font-medium">
                  Izinkan Admin Kab/Kota ubah status &amp; catatan Anomali
                </span>
                <input
                  type="checkbox"
                  disabled={!isPemilik || isSaving || draft.isRekonLocked}
                  checked={draft.allowKabKotaEditAnomali}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      allowKabKotaEditAnomali: e.target.checked
                    }))
                  }
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-700 font-medium">
                  Izinkan Admin Kab/Kota konfirmasi Sewa Murni / All-In
                </span>
                <input
                  type="checkbox"
                  disabled={!isPemilik || isSaving || draft.isRekonLocked}
                  checked={draft.allowKabKotaKonfSewa}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      allowKabKotaKonfSewa: e.target.checked
                    }))
                  }
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {settings.updatedAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Terakhir disinkronkan oleh <strong>{settings.updatedBy || 'Admin'}</strong>
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
            >
              Tutup
            </button>
            {isPemilik && (
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan &amp; Sinkronkan</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
