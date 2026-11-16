export interface AppDocumentMetadata {
  is_system?: boolean;
  system_type?: 'rekonda_admins' | 'rekonda_db_snapshot';
  client_id?: string;
  storage_path?: string;
  original_name?: string;
  file_size?: number;
  kategori?: string;
  sheet_type?: string;
  komoditas_kode?: string;
  komoditas_nama?: string;
  kabupaten_kode?: string;
  kabupaten_nama?: string;
  uploaded_by?: string;
  catatan?: string;
  affected_kab_count?: number;
  updated_at?: string;
  admins?: unknown[];
  [key: string]: unknown;
}

export interface AppDocument {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: string;
  metadata: AppDocumentMetadata | null;
  created_at: string;
}
