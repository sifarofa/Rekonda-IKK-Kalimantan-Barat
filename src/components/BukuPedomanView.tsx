import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Eye,
  MessageSquare,
  Layers,
  Wrench,
  FileSpreadsheet,
  KeyRound,
  ArrowRight,
  HelpCircle,
  Lock,
  LayoutDashboard,
  SlidersHorizontal,
  FileDown
} from 'lucide-react';
import { ActiveViewType, RekondaGlobalSettings, UserAuth } from '../types/rekonda';
import { downloadBukuPedomanPdf } from '../utils/pdfExport';

interface BukuPedomanViewProps {
  currentUser: UserAuth;
  globalSettings?: RekondaGlobalSettings;
  onNavigateView: (view: ActiveViewType) => void;
  onOpenUserManagement: () => void;
}

interface GuideSection {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  badge?: string;
  keywords: string[];
  renderContent: () => React.ReactNode;
}

export const BukuPedomanView: React.FC<BukuPedomanViewProps> = ({
  currentUser,
  globalSettings,
  onNavigateView,
  onOpenUserManagement
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string>('all');

  const isKabupaten = currentUser.role === 'kabupaten';
  const kabLabel =
    isKabupaten && currentUser.kabupatenKode
      ? `[${currentUser.kabupatenKode}] ${currentUser.kabupatenNama || ''}`
      : 'Kabupaten / Kota (Kalimantan Barat)';

  const sections: GuideSection[] = useMemo(
    () => [
      {
        id: 'login_akses',
        number: 'Bab 1',
        title: 'Masuk Akun, Hak Akses & Pengaturan Kata Sandi',
        subtitle: 'Cara login sesuai kode wilayah, batas hak akses Kab/Kota, dan ganti kata sandi mandiri.',
        badge: 'Persiapan',
        keywords: ['login', 'sandi', 'password', 'akun', 'kabupaten', 'hak akses', 'kunci', 'ganti akun'],
        renderContent: () => (
          <div className="space-y-4 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-sky-600" />
                  <span>Langkah Login Admin Kab/Kota</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                  <li>
                    Pada halaman Portal Login, pilih tab <strong>Admin Kab/Kota</strong>.
                  </li>
                  <li>
                    Pilih wilayah Kabupaten/Kota Anda (misal: <span className="font-mono font-semibold">6101 SAMBAS</span> s.d. <span className="font-mono font-semibold">6172 KOTA SINGKAWANG</span>).
                  </li>
                  <li>
                    Isi kolom <strong>Kata Sandi</strong> sesuai kredensial wilayah yang diberikan Admin Provinsi, lalu klik <strong>Masuk ke Aplikasi</strong>.
                  </li>
                  <li>
                    Setelah masuk, status wilayah aktif Anda akan tampil di bagian atas Sidebar kiri.
                  </li>
                </ol>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Ganti Kata Sandi &amp; Batasan Akses</span>
                </div>
                <ul className="space-y-1.5 text-slate-700">
                  <li className="flex items-start gap-1.5">
                    <span className="text-sky-600 font-bold mt-0.5">•</span>
                    <span>
                      <strong>Ubah Kata Sandi:</strong> Buka menu <strong>Manajemen Pengguna &rarr; Kelola Akun</strong> di sidebar untuk mengganti kata sandi wilayah Anda sendiri. Perubahan otomatis tersinkron ke cloud.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-sky-600 font-bold mt-0.5">•</span>
                    <span>
                      <strong>Isolasi Wilayah:</strong> Admin Kab/Kota dapat melihat data perbandingan provinsi di <em>Rekon Daerah</em>, namun hanya berhak mengubah status, catatan, dan konfirmasi sewa alat pada <strong>kode kabupaten/kota miliknya sendiri</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-slate-400 font-bold mt-0.5">•</span>
                    <span>
                      <strong>Menu Khusus Provinsi:</strong> Upload Excel/Template, Tambah/Hapus Responden, Simulasi Ranking, LK Sewa Alat, Dokumen &amp; Arsip, serta Pengaturan Global hanya diakses oleh Admin Provinsi.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {globalSettings?.isRekonLocked && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2.5 text-amber-950 text-xs">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Status Saat Ini Terkunci:</strong> Admin Provinsi sedang mengaktifkan mode <em>Input Terkunci</em>. Perubahan catatan, status rekon, atau konfirmasi sewa sementara dinonaktifkan sampai kunci dibuka kembali.
                </div>
              </div>
            )}
          </div>
        )
      },
      {
        id: 'tabel_anomali',
        number: 'Bab 2',
        title: 'Menyelesaikan Tabel Anomali Rekon (Fokus Utama)',
        subtitle: 'Cara menyaring anomali CV & Rasio, memeriksa harga responden, mengisi catatan justifikasi, dan menandai Rekon Selesai.',
        badge: 'Tugas Utama',
        keywords: ['anomali', 'cv', 'rasio', 'justifikasi', 'catatan', 'status rekon', 'rekon selesai', 'belum rekon', 'jenis kuesioner'],
        renderContent: () => (
          <div className="space-y-4 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5">
              <div className="font-bold text-amber-950 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Kapan Suatu Komoditas Masuk ke Tabel Anomali?</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded border border-amber-200/80 p-2.5">
                  <div className="font-bold text-amber-900">1. Anomali CV (&gt; 20%)</div>
                  <p className="text-slate-600 mt-0.5">
                    Koefisien Variasi harga antar responden survei di kabupaten/kota melebihi 20%.
                  </p>
                </div>
                <div className="bg-white rounded border border-amber-200/80 p-2.5">
                  <div className="font-bold text-rose-800">2. Anomali Rasio (&lt; 80% / &gt; 120%)</div>
                  <p className="text-slate-600 mt-0.5">
                    Rata-rata Harga 2027 naik lebih dari 20% atau turun lebih dari 20% dibandingkan Harga 2026.
                  </p>
                </div>
                <div className="bg-white rounded border border-amber-200/80 p-2.5">
                  <div className="font-bold text-slate-900">3. Anomali Ganda (CV &amp; Rasio)</div>
                  <p className="text-slate-600 mt-0.5">
                    Kedua batas toleransi CV dan Rasio terpicu sekaligus pada komoditas tersebut.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="font-bold text-slate-900">Alur Penyelesaian Langkah demi Langkah:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="font-bold text-slate-900">Langkah 1 — Saring Daftar Anomali Wilayah Anda</div>
                  <p className="text-slate-600">
                    Buka menu <strong>Tabel Anomali Rekon</strong> di sidebar. Kolom <strong>Kabupaten / Kota</strong> otomatis terkunci ke wilayah Anda. Gunakan filter:
                  </p>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li><strong>Jenis Kuesioner:</strong> Natural, Pabrikan, atau Sewa Alat &amp; Upah (otomatis menyaring daftar komoditas).</li>
                    <li><strong>Kriteria Anomali:</strong> pilih <em>Anomali CV</em>, <em>Anomali Rasio</em>, atau <em>Ganda</em>.</li>
                    <li><strong>Status Rekon:</strong> filter <em>Belum Rekon</em> untuk memprioritaskan pekerjaan tersisa.</li>
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="font-bold text-slate-900">Langkah 2 — Periksa Rincian Responden</div>
                  <p className="text-slate-600">
                    Klik tombol <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold text-[11px]"><Eye className="w-3 h-3" /> Detail</span> pada baris anomali untuk melihat harga per toko/responden dari TW III '26 hingga TW II '27 serta perbandingannya dengan Harga '26.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="font-bold text-slate-900">Langkah 3 — Isi Catatan Lapangan &amp; Justifikasi</div>
                  <p className="text-slate-600">
                    Di dalam jendela <strong>Detail Rekonda</strong>, gulir ke bagian <strong>Catatan Lapangan &amp; Rekon</strong>, klik tombol pensil kuning, ketik alasan teknis yang jelas, lalu klik <strong>Simpan Catatan</strong>.
                  </p>
                  <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px] text-slate-600">
                    <strong>Contoh catatan yang baik:</strong> &ldquo;Harga riil pasar naik karena biaya angkutan sungai bertambah di TW IV '26; responden A menjual merek SNI baru sesuai stok toko.&rdquo;
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="font-bold text-slate-900">Langkah 4 — Tandai Status &ldquo;Rekon Selesai&rdquo;</div>
                  <p className="text-slate-600">
                    Ubah dropdown <strong>Status Rekon</strong> di Tabel Anomali menjadi{' '}
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-[11px]">
                      Rekon Selesai
                    </span>{' '}
                    atau klik tombol <strong>Tandai Rekon Selesai</strong> di bagian bawah Detail Rekonda. Perubahan langsung tersimpan ke cloud.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      },
      {
        id: 'final_merek_acuan',
        number: 'Bab 3',
        title: "Memahami Basis '26 vs '27, Final '26 & Merek Acuan",
        subtitle: "Cara membaca penanda Final '26, Webentry (Non-Final), Non-Acuan '26, dan fitur Basis Hitung agar tidak bingung saat rasio berbeda.",
        badge: 'Analisis',
        keywords: ['final', 'webentry', 'merek acuan', 'apple to apple', 'basis hitung', 'rasio', '2026', 'non-final'],
        renderContent: () => (
          <div className="space-y-4 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            <p>
              Saat meninjau <strong>Detail Rekonda</strong>, kadang rasio komoditas terlihat turun atau naik meskipun harga masing-masing responden tampak sama. Hal ini wajar terjadi apabila komposisi responden pengumpulan 2027 berbeda dengan data yang masuk perhitungan <strong>final IKK 2026</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] font-semibold text-emerald-700">Final '26</div>
                <p className="text-[11.5px] text-slate-600 mt-1">
                  Responden dan mereknya ikut dihitung pada hasil final IKK Rekonda 2026.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] font-semibold text-amber-700">Webentry (Non-Final)</div>
                <p className="text-[11.5px] text-slate-600 mt-1">
                  Tahun lalu hanya tercatat di Webentry dan tidak masuk hitungan final 2026, namun tahun ini tetap terdata dalam pengumpulan.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] font-semibold text-amber-700">Non-Acuan '26</div>
                <p className="text-[11.5px] text-slate-600 mt-1">
                  Merek responden berbeda dengan <em>Merek Acuan</em> yang dipakai pada finalisasi tahun lalu (terlihat keterangan <span className="text-indigo-700 font-medium">Acuan '26</span>).
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] font-semibold text-slate-500">Baru '27</div>
                <p className="text-[11.5px] text-slate-600 mt-1">
                  Responden baru pada periode pengumpulan berjalan yang belum ada di database 2026.
                </p>
              </div>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-3.5 space-y-1.5">
              <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Menggunakan Simulasi Tampilan &ldquo;Basis Hitung&rdquo;</span>
              </div>
              <p className="text-indigo-950/90 text-xs">
                Pada toolbar tabel utama maupun bagian atas <strong>Detail Rekonda</strong>, Anda bisa mengganti tampilan sementara tanpa menghapus data survei apa pun:
              </p>
              <ul className="list-disc list-inside text-xs text-indigo-950/90 space-y-1">
                <li>
                  <strong>Semua Responden '27:</strong> mode standar seluruh responden pengumpulan. Jika ada entri non-final, akan muncul catatan halus <span className="text-amber-700 font-medium">+N non-final '26</span> di bawah Harga 2027.
                </li>
                <li>
                  <strong>Filter Merek Acuan '26:</strong> menghitung rata-rata sementara khusus responden yang mereknya sama dengan Merek Acuan final 2026.
                </li>
                <li>
                  <strong>Apple-to-Apple (Final '26):</strong> menghitung rata-rata sementara khusus responden yang ikut finalisasi 2026 sehingga perbandingan kenaikan/penurunan harga terlihat sebanding.
                </li>
              </ul>
            </div>
          </div>
        )
      },
      {
        id: 'sewa_alat',
        number: 'Bab 4',
        title: 'Konfirmasi Sewa Alat Berat & Genset (Kode 5101 – 5803)',
        subtitle: 'Cara mengonfirmasi status Sewa Murni vs All-In per responden di komoditas sewa alat berat dan generator set.',
        badge: 'Khusus 5101–5803',
        keywords: ['sewa alat', 'excavator', 'buldozer', 'genset', 'sewa murni', 'all-in', 'all in', 'lk', '5101', '5803'],
        renderContent: () => (
          <div className="space-y-3 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            <p>
              Untuk kelompok komoditas <strong>Sewa Alat Berat &amp; Genset (kode 5101 s.d. 5803)</strong>, dalam satu kabupaten/kota dapat terdapat campuran responden yang menyewakan unit secara <strong>Sewa Murni</strong> maupun paket <strong>All-In</strong> (termasuk solar, pelumas, operator, mobilisasi).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  <span>Kewajiban Admin Kab/Kota:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                  <li>
                    Buka komoditas kode <strong>5101–5803</strong> di <em>Rekon Daerah</em> atau klik ikon mata pada <em>Tabel Anomali</em>.
                  </li>
                  <li>
                    Di dalam <strong>Detail Rekonda</strong>, pada kolom <strong>Jenis Sewa</strong> setiap baris responden, pilih:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-slate-600">
                      <li>
                        <strong className="text-emerald-700">✓ Sewa Murni</strong> jika harga responden sudah murni sewa alat tanpa komponen BBM/operator.
                      </li>
                      <li>
                        <strong className="text-amber-800">⚙ All-In</strong> jika harga masih mencakup BBM, operator, atau biaya pendukung lain.
                      </li>
                    </ul>
                  </li>
                  <li>
                    Jika seluruh responden di wilayah Anda seragam, tersedia tombol cepat <strong>Semua Sewa Murni</strong> atau <strong>Semua All-In</strong>.
                  </li>
                </ol>
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-2">
                <div className="font-bold text-slate-900">Proses Lanjutan Setelah Konfirmasi:</div>
                <ul className="space-y-1.5 text-slate-700">
                  <li>
                    • Responden berstatus <strong>All-In</strong> akan menampilkan status <em>Menunggu LK</em> sampai <strong>Admin Provinsi</strong> menghitung pemisahan komponennya di <em>LK Sewa Alat</em>.
                  </li>
                  <li>
                    • Setelah Admin Provinsi menerapkan hasil LK, responden tersebut otomatis diperbarui menjadi nilai <strong>LK Murni</strong> (harga sewa murni per 200 jam).
                  </li>
                  <li>
                    • Nilai <strong>Harga 2027, CV, dan Rasio</strong> pada tabel utama otomatis dihitung penuh begitu <strong>seluruh responden</strong> di kabupaten/kota berstatus siap murni.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )
      },
      {
        id: 'rekon_ekspor',
        number: 'Bab 5',
        title: 'Menu Rekon Daerah, Ekspor Excel & Penyesuaian Layar',
        subtitle: 'Menelusuri 89 komoditas, grafik perbandingan 14 Kab/Kota, mengunduh Excel/Cetak, dan mengatur tampilan layar HP/Desktop.',
        keywords: ['rekon daerah', 'grafik', 'excel', 'unduh', 'cetak', 'print', 'tampilan', 'hp', 'layar', 'mobile'],
        renderContent: () => (
          <div className="space-y-3 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <LayoutDashboard className="w-4 h-4 text-rose-600" />
                  <span>Navigasi Komoditas &amp; Grafik</span>
                </div>
                <p className="text-slate-600">
                  Gunakan dropdown <strong>Kualitas / Komoditas Rekon</strong> atau tombol <strong>Sebelumnya / Selanjutnya</strong> untuk berpindah antar 89 komoditas. Klik baris tabel atau batang grafik untuk menyorot wilayah tertentu dan melihat detail respondennya.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Unduh Excel &amp; Cetak</span>
                </div>
                <p className="text-slate-600">
                  Di menu atas tabel atau bagian <strong>Ekspor Data Seluruh</strong> pada sidebar, Anda bisa mengunduh rekap per komoditas, rekap <strong>Seluruh Kualitas (89 komoditas)</strong>, ataupun rincian <strong>Seluruh Responden</strong> dalam format <code>.xlsx</code>.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                  <span>Sesuaikan Tampilan (HP / Layar Kecil)</span>
                </div>
                <p className="text-slate-600">
                  Klik <strong>Sesuaikan Tampilan</strong> di sidebar untuk mengatur kerapatan baris (<em>Padat / Standar / Lega</em>), skala teks, dan lebar tabel penuh agar nyaman dibaca di laptop maupun ponsel.
                </p>
              </div>
            </div>
          </div>
        )
      },
      {
        id: 'faq',
        number: 'Bab 6',
        title: 'Tanya Jawab Singkat (FAQ)',
        subtitle: 'Jawaban cepat kendala umum yang sering ditemui Admin Kab/Kota saat rekonsiliasi.',
        keywords: ['faq', 'tanya', 'bantuan', 'salah input', 'hapus', 'tambah responden', 'simpan', 'otomatis', 'sync'],
        renderContent: () => (
          <div className="space-y-2.5 text-xs sm:text-[13px] text-slate-700">
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="font-bold text-slate-900">
                1. Apakah saya perlu menekan tombol simpan global setelah mengubah Status Rekon atau Catatan?
              </div>
              <p className="text-slate-600 mt-1">
                Untuk catatan di <em>Detail Rekonda</em>, klik <strong>Simpan Catatan</strong>. Untuk <em>Status Rekon</em> dan pilihan <em>Jenis Sewa</em>, perubahan langsung tersimpan otomatis ke cloud Supabase dan tampil real-time di perangkat Admin Provinsi maupun Kab/Kota lain.
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3">
              <div className="font-bold text-slate-900">
                2. Mengapa kolom TW I '27 dan TW II '27 masih bertanda strip (-)?
              </div>
              <p className="text-slate-600 mt-1">
                Kolom triwulan menyesuaikan data aktual yang sudah diunggah. Tanda strip (<code>-</code>) berarti periode triwulan tersebut belum memiliki entri data atau memang belum memasuki masa rilis data.
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3">
              <div className="font-bold text-slate-900">
                3. Bagaimana jika ditemukan kesalahan input harga atau perlu menambah/menghapus responden?
              </div>
              <p className="text-slate-600 mt-1">
                Penambahan, pengeditan angka harga mentah, penghapusan responden, serta unggah ulang Excel master dikelola oleh <strong>Admin Provinsi</strong>. Tuliskan temuan perbaikan harga/responden pada kolom <strong>Catatan Lapangan &amp; Rekon</strong> lalu koordinasikan dengan Admin Provinsi.
              </p>
            </div>
          </div>
        )
      }
    ],
    [globalSettings?.isRekonLocked]
  );

  const visibleSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sections.filter((sec) => {
      if (activeSectionId !== 'all' && sec.id !== activeSectionId) return false;
      if (!q) return true;
      return (
        sec.number.toLowerCase().includes(q) ||
        sec.title.toLowerCase().includes(q) ||
        sec.subtitle.toLowerCase().includes(q) ||
        sec.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [sections, searchQuery, activeSectionId]);

  return (
    <div className="w-full space-y-4">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 px-4 sm:px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Buku Pedoman Penggunaan REKONDA
                </h1>
                <span className="text-[10.5px] font-bold bg-sky-500/25 text-sky-200 border border-sky-400/30 px-2 py-0.5 rounded-full">
                  Panduan Admin Kab/Kota
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Panduan operasional resmi untuk wilayah <strong>{kabLabel}</strong> — periode {globalSettings?.periodeBannerText || 'TW III/IV 2026 s/d TW I/II 2027'}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
            <button
              type="button"
              onClick={() => onNavigateView('anomali_rekon')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Buka Tabel Anomali</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBukuPedomanPdf({
                  kabLabel,
                  periodeText: globalSettings?.periodeBannerText
                })
              }
              title="Unduh Buku Pedoman dalam format PDF"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold border border-slate-600 transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </button>
          </div>
        </div>

        {/* Quick Ringkas Checklist Kerja Admin Kab/Kota */}
        <div className="p-4 sm:px-6 bg-slate-50/70 border-b border-slate-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Ringkasan Alur Kerja Harian Admin Kab/Kota
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <div className="font-bold text-slate-800">Login Kode Wilayah</div>
                <div className="text-[11px] text-slate-500">Masuk sesuai kode kab/kota Anda.</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <div className="font-bold text-slate-800">Cek Tabel Anomali</div>
                <div className="text-[11px] text-slate-500">Periksa baris CV &gt;20% atau Rasio ekstrem.</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <div className="font-bold text-slate-800">Konfirmasi Sewa &amp; Catatan</div>
                <div className="text-[11px] text-slate-500">Pilih Sewa Murni/All-In (5101–5803) &amp; isi catatan.</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                4
              </span>
              <div>
                <div className="font-bold text-slate-800">Tandai Rekon Selesai</div>
                <div className="text-[11px] text-slate-500">Status otomatis tersinkron ke Provinsi.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Quick Chapter Filter */}
        <div className="p-3 sm:px-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-2.5 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSectionId('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeSectionId === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Bab
            </button>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSectionId(s.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeSectionId === s.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.number}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik (mis. sewa alat, rasio)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Sections List */}
      {visibleSections.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          <HelpCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          Tidak ada topik pedoman yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="space-y-3.5">
          {visibleSections.map((sec) => (
            <section
              key={sec.id}
              className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden break-inside-avoid"
            >
              <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                      {sec.number}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      {sec.title}
                    </h2>
                    {sec.badge && (
                      <span className="text-[10px] font-bold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full">
                        {sec.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">{sec.subtitle}</p>
                </div>
              </div>
              <div className="p-4 sm:px-6 sm:py-4">{sec.renderContent()}</div>
            </section>
          ))}
        </div>
      )}

      {/* Quick Action Footer */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Siap melanjutkan rekonsiliasi wilayah? Pilih tindakan cepat di sebelah kanan.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenUserManagement}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
            <span>Ganti Sandi Akun</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('rekon_daerah')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
            <span>Ke Rekon Daerah</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('anomali_rekon')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <span>Mulai Cek Anomali</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
