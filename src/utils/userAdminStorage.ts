import { RegisteredAdmin } from '../types/userAdmin';
import { KABUPATEN_KALBAR_LIST } from '../data/kabupatenList';
import { syncAdminsToSupabase } from '../services/supabaseDocuments';

let cachedAdmins: RegisteredAdmin[] = [];
const listeners = new Set<(admins: RegisteredAdmin[]) => void>();

function notifyListeners() {
  const snapshot = [...cachedAdmins];
  listeners.forEach((cb) => cb(snapshot));
}

export function subscribeRegisteredAdmins(
  listener: (admins: RegisteredAdmin[]) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hydrateRegisteredAdminsFromCloud(admins: RegisteredAdmin[]): void {
  if (!Array.isArray(admins)) return;
  cachedAdmins = [...admins];
  notifyListeners();
}

export function getRegisteredAdmins(): RegisteredAdmin[] {
  return [...cachedAdmins];
}

export function saveRegisteredAdmin(admin: RegisteredAdmin): void {
  const existingIdx = cachedAdmins.findIndex(
    (a) => a.id === admin.id || a.kabupatenKode === admin.kabupatenKode
  );

  let updated: RegisteredAdmin[];
  if (existingIdx >= 0) {
    updated = [...cachedAdmins];
    updated[existingIdx] = admin;
  } else {
    updated = [...cachedAdmins, admin];
  }

  cachedAdmins = updated;
  notifyListeners();
  syncAdminsToSupabase(updated).catch((err) => {
    console.warn('Supabase admin sync notice:', err);
  });
}

export function deleteRegisteredAdmin(idOrKode: string): void {
  const updated = cachedAdmins.filter((a) => a.id !== idOrKode && a.kabupatenKode !== idOrKode);
  cachedAdmins = updated;
  notifyListeners();
  syncAdminsToSupabase(updated).catch((err) => {
    console.warn('Supabase admin delete sync notice:', err);
  });
}

/**
 * Validates login for Kabupaten Admin against cloud-synced registered admins list.
 * Returns the matching RegisteredAdmin, or error.
 */
export function validateKabupatenAdminLogin(
  kabKodeOrUsername: string,
  passwordInput: string
): { success: boolean; admin?: RegisteredAdmin; error?: string } {
  const admins = getRegisteredAdmins();
  const cleanInput = kabKodeOrUsername.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  const matched = admins.find(
    (a) =>
      a.kabupatenKode === cleanInput ||
      a.username.toLowerCase() === cleanInput
  );

  if (!matched) {
    return {
      success: false,
      error:
        'Akun Admin belum terdaftar! Silakan hubungi Admin Provinsi untuk menambahkan akun Admin wilayah ini terlebih dahulu.'
    };
  }

  if (matched.status !== 'aktif') {
    return {
      success: false,
      error: 'Akun Admin ini sedang dinonaktifkan oleh Admin Provinsi.'
    };
  }

  if (matched.password !== cleanPass && cleanPass.toLowerCase() !== matched.password.toLowerCase()) {
    return {
      success: false,
      error: 'Kata sandi tidak sesuai dengan akun Admin terdaftar.'
    };
  }

  // Update last login and sync to Supabase
  const updatedAdmin = {
    ...matched,
    lastLogin: new Date().toISOString()
  };
  saveRegisteredAdmin(updatedAdmin);

  return { success: true, admin: updatedAdmin };
}

/**
 * Batch generates default admin accounts for all 14 Kabupaten/Kota in Kalbar
 * that don't have an account registered yet, and syncs to Supabase.
 */
export function generateDefaultAllKabupatenAdmins(): RegisteredAdmin[] {
  const existingKodes = new Set(cachedAdmins.map((a) => a.kabupatenKode));
  const newAdmins: RegisteredAdmin[] = [...cachedAdmins];

  KABUPATEN_KALBAR_LIST.forEach((kab) => {
    if (!existingKodes.has(kab.kode)) {
      newAdmins.push({
        id: `admin_${kab.kode}_${Date.now()}`,
        kabupatenKode: kab.kode,
        kabupatenNama: kab.nama,
        username: `admin${kab.kode}`,
        namaLengkap: `Admin BPS ${kab.nama}`,
        password: `rekonda${kab.kode}`,
        createdAt: new Date().toISOString(),
        status: 'aktif'
      });
    }
  });

  cachedAdmins = newAdmins;
  notifyListeners();
  syncAdminsToSupabase(newAdmins).catch((err) => {
    console.warn('Supabase batch admin sync notice:', err);
  });

  return newAdmins;
}
