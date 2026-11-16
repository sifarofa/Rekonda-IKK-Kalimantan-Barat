import { supabase } from '../lib/supabase';
import { AppDocument, AppDocumentMetadata } from '../types/documents';
import { KabupatenRekon } from '../types/rekonda';
import { RegisteredAdmin } from '../types/userAdmin';

export const DOCUMENTS_BUCKET = 'documents';
export const APP_DOCUMENTS_TABLE = 'app_documents';

export const CLIENT_SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function buildSafeFileName(originalName: string): string {
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${Date.now()}_${sanitized}`;
}

export function extractStoragePath(doc: AppDocument): string | null {
  if (doc.metadata && typeof doc.metadata.storage_path === 'string' && doc.metadata.storage_path.trim()) {
    return doc.metadata.storage_path.trim();
  }
  if (doc.file_url && doc.file_url.includes(`/object/public/${DOCUMENTS_BUCKET}/`)) {
    const raw = doc.file_url.split(`/object/public/${DOCUMENTS_BUCKET}/`)[1];
    if (raw) {
      return decodeURIComponent(raw.split('?')[0]);
    }
  }
  if (doc.file_name && !doc.file_name.startsWith('system_')) {
    return doc.file_name;
  }
  return null;
}

export function isSystemSyncDocument(doc: Partial<AppDocument> | null | undefined): boolean {
  return Boolean(doc?.metadata && doc.metadata.is_system === true);
}

/**
 * Fetch ALL rows from app_documents ordered by created_at descending.
 */
export async function fetchAllAppDocuments(): Promise<AppDocument[]> {
  const { data, error } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat dokumen dari Supabase: ${error.message}`);
  }
  return (data || []) as AppDocument[];
}

/**
 * Upload a file to Supabase Storage bucket `documents`, get Public URL,
 * and insert metadata row into `app_documents`.
 */
export async function uploadDocumentToSupabase(params: {
  file: File;
  title?: string;
  metadata?: AppDocumentMetadata;
}): Promise<AppDocument> {
  const { file, title, metadata = {} } = params;
  const safeFileName = buildSafeFileName(file.name);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(safeFileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });

  if (uploadError) {
    throw new Error(`Gagal mengunggah file ke Storage: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(DOCUMENTS_BUCKET)
    .getPublicUrl(safeFileName);

  const publicUrl = publicUrlData.publicUrl;
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
  const finalType = file.type || (ext ? `application/${ext}` : 'application/octet-stream');

  const finalMetadata: AppDocumentMetadata = {
    ...metadata,
    is_system: false,
    storage_path: safeFileName,
    original_name: file.name,
    file_size: file.size
  };

  const { data: inserted, error: insertError } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .insert({
      title: (title || '').trim() || file.name,
      file_name: safeFileName,
      file_url: publicUrl,
      file_type: finalType,
      metadata: finalMetadata
    })
    .select('*')
    .single();

  if (insertError) {
    // Cleanup orphan file in bucket if table insert fails
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([safeFileName]).catch(() => {});
    throw new Error(`Gagal menyimpan metadata ke app_documents: ${insertError.message}`);
  }

  return inserted as AppDocument;
}

/**
 * Update document title & metadata in `app_documents`.
 */
export async function updateAppDocument(
  id: string,
  updates: { title?: string; metadata?: AppDocumentMetadata }
): Promise<AppDocument> {
  const { data, error } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Gagal memperbarui dokumen: ${error.message}`);
  }
  return data as AppDocument;
}

/**
 * Delete row from `app_documents` AND remove the associated file from `documents` bucket.
 */
export async function deleteDocumentFromSupabase(doc: AppDocument): Promise<void> {
  const storagePath = extractStoragePath(doc);

  if (storagePath) {
    const { error: removeError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([storagePath]);

    if (removeError) {
      console.warn('Storage remove notice:', removeError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .delete()
    .eq('id', doc.id);

  if (deleteError) {
    throw new Error(`Gagal menghapus baris di app_documents: ${deleteError.message}`);
  }
}

/* =========================================================================
 * Cloud Sync Helpers for Admin Users & Rekon Database (Zero localStorage)
 * Uses `app_documents` + `documents` bucket with metadata.is_system = true
 * so all devices stay synchronized in real-time via postgres_changes.
 * ========================================================================= */

let latestAdminSyncDocId: string | null = null;
let latestDbSyncDoc: AppDocument | null = null;

export function setKnownSystemSyncDocs(docs: AppDocument[]): void {
  const adminDoc = docs.find((d) => d.metadata?.is_system && d.metadata?.system_type === 'rekonda_admins');
  if (adminDoc) {
    latestAdminSyncDocId = adminDoc.id;
  }
  const dbDoc = docs.find((d) => d.metadata?.is_system && d.metadata?.system_type === 'rekonda_db_snapshot');
  if (dbDoc) {
    latestDbSyncDoc = dbDoc;
  }
}

export async function syncAdminsToSupabase(admins: RegisteredAdmin[]): Promise<void> {
  const payloadMetadata: AppDocumentMetadata = {
    is_system: true,
    system_type: 'rekonda_admins',
    client_id: CLIENT_SESSION_ID,
    updated_at: new Date().toISOString(),
    admins
  };

  if (latestAdminSyncDocId) {
    const { data, error } = await supabase
      .from(APP_DOCUMENTS_TABLE)
      .update({
        metadata: payloadMetadata
      })
      .eq('id', latestAdminSyncDocId)
      .select('id')
      .maybeSingle();

    if (!error && data?.id) {
      return;
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .insert({
      title: '[SYSTEM] Daftar User Admin Wilayah',
      file_name: 'system_rekonda_admins.json',
      file_url: 'system://rekonda_admins',
      file_type: 'application/json',
      metadata: payloadMetadata
    })
    .select('id')
    .single();

  if (insertError) {
    console.warn('Gagal sinkronisasi daftar admin ke Supabase:', insertError.message);
    return;
  }

  const previousId = latestAdminSyncDocId;
  latestAdminSyncDocId = inserted.id;
  if (previousId && previousId !== inserted.id) {
    try {
      await supabase.from(APP_DOCUMENTS_TABLE).delete().eq('id', previousId);
    } catch {
      // ignore cleanup error
    }
  }
}

export async function syncRekondaOverridesToSupabase(
  overrides: Record<string, KabupatenRekon[]>,
  updatedBy?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const snapshotPayload = {
    version: 1,
    updatedAt: nowIso,
    updatedBy: updatedBy || 'Admin',
    overrides
  };

  const jsonString = JSON.stringify(snapshotPayload);
  const jsonBlob = new Blob([jsonString], { type: 'application/json' });
  const safePath = `${Date.now()}_rekonda_data_sync.json`;

  let fileUrl = 'system://rekonda_db_inline';
  let storagePath: string | undefined = undefined;
  let inlineOverrides: Record<string, KabupatenRekon[]> | undefined = undefined;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(safePath, jsonBlob, {
      cacheControl: '0',
      upsert: false,
      contentType: 'application/json'
    });

  if (!uploadError) {
    const { data: pub } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(safePath);
    fileUrl = pub.publicUrl;
    storagePath = safePath;
  } else {
    // Fallback if bucket MIME policy rejects JSON: store overrides in JSONB metadata directly
    inlineOverrides = overrides;
  }

  const metadata: AppDocumentMetadata = {
    is_system: true,
    system_type: 'rekonda_db_snapshot',
    client_id: CLIENT_SESSION_ID,
    updated_at: nowIso,
    uploaded_by: updatedBy || 'Admin',
    ...(storagePath ? { storage_path: storagePath } : {}),
    ...(inlineOverrides ? { inline_overrides: inlineOverrides } : {})
  };

  const { data: inserted, error: insertError } = await supabase
    .from(APP_DOCUMENTS_TABLE)
    .insert({
      title: '[SYSTEM] Sinkronisasi Data Rekon Lintas Perangkat',
      file_name: storagePath || 'system_rekonda_db.json',
      file_url: fileUrl,
      file_type: 'application/json',
      metadata
    })
    .select('*')
    .single();

  if (insertError) {
    if (storagePath) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]).catch(() => {});
    }
    throw new Error(`Gagal sinkronisasi data ke Supabase: ${insertError.message}`);
  }

  const previousDoc = latestDbSyncDoc;
  latestDbSyncDoc = inserted as AppDocument;

  // Cleanup previous snapshot row & storage file so bucket/table stays clean
  if (previousDoc && previousDoc.id !== inserted.id) {
    await deleteDocumentFromSupabase(previousDoc).catch(() => {});
  }
}

export async function loadRekondaOverridesFromDoc(
  doc: AppDocument
): Promise<Record<string, KabupatenRekon[]> | null> {
  if (!doc.metadata || doc.metadata.system_type !== 'rekonda_db_snapshot') {
    return null;
  }

  if (doc.metadata.inline_overrides && typeof doc.metadata.inline_overrides === 'object') {
    return doc.metadata.inline_overrides as Record<string, KabupatenRekon[]>;
  }

  if (doc.file_url && doc.file_url.startsWith('http')) {
    const res = await fetch(doc.file_url, { cache: 'no-store' });
    if (!res.ok) return null;
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object' && parsed.overrides) {
      return parsed.overrides as Record<string, KabupatenRekon[]>;
    }
  }

  return null;
}
