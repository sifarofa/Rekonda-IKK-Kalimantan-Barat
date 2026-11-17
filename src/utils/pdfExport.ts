import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { KabupatenRekon, Komoditas, Provinsi } from '../types/rekonda';
import { formatPercent, formatRupiahNumber } from './formatters';

function savePdfBlob(doc: jsPDF, filename: string): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

function addPageFooters(doc: jsPDF, leftLabel: string): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(leftLabel, 14, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

export function downloadBukuPedomanPdf(params: {
  kabLabel?: string;
  periodeText?: string;
}): void {
  const {
    kabLabel = 'Admin Kab/Kota (Kalimantan Barat)',
    periodeText = 'TW III/IV 2026 s/d TW I/II 2027'
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let y = 14;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
  };

  const addSectionHeader = (bab: string, title: string) => {
    ensureSpace(16);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginX, y, contentWidth, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${bab} - ${title}`, marginX + 3, y + 6);
    y += 12;
  };

  const addSubHeading = (text: string) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(text, marginX, y);
    y += 5;
  };

  const addParagraph = (text: string, indentMm: number = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, contentWidth - indentMm);
    ensureSpace(lines.length * 4.3 + 2);
    doc.text(lines, marginX + indentMm, y);
    y += lines.length * 4.3 + 2;
  };

  const addBullet = (label: string, detail: string) => {
    const fullText = label ? `${label}: ${detail}` : detail;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(`- ${fullText}`, contentWidth - 4);
    ensureSpace(lines.length * 4.2 + 1.5);
    doc.text(lines, marginX + 3, y);
    y += lines.length * 4.2 + 1.5;
  };

  // Cover / Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 24, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('BUKU PEDOMAN PENGGUNAAN REKONDA', marginX + 5, y + 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Panduan Operasional Admin Kab/Kota | Wilayah: ${kabLabel}`, marginX + 5, y + 14.5);
  doc.text(`Periode IKK: ${periodeText} | BPS Provinsi Kalimantan Barat`, marginX + 5, y + 19.5);
  y += 29;

  // Ringkasan Alur Kerja 4 Langkah
  addSubHeading('Ringkasan Alur Kerja Harian Admin Kab/Kota');
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Langkah', 'Kegiatan Utama', 'Lokasi Menu']],
    body: [
      ['1. Login Wilayah', 'Masuk dengan Kode Kab/Kota dan Kata Sandi resmi.', 'Portal Login'],
      ['2. Cek Anomali', 'Periksa komoditas dengan CV > 20% atau Rasio < 80% / > 120%.', 'Tabel Anomali Rekon'],
      ['3. Justifikasi & Sewa', 'Isi Catatan Lapangan & konfirmasi Sewa Murni / All-In (5101-5803).', 'Detail Rekonda'],
      ['4. Rekon Selesai', 'Ubah Status Rekon menjadi Rekon Selesai (tersinkron otomatis ke cloud).', 'Tabel Anomali / Detail']
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [185, 28, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  // Bab 1
  addSectionHeader('Bab 1', 'Masuk Akun, Hak Akses & Pengaturan Kata Sandi');
  addBullet('Login Admin Kab/Kota', 'Pada Portal Login pilih tab Admin Kab/Kota, pilih wilayah (6101 s.d. 6172), masukkan Kata Sandi, lalu klik Masuk ke Aplikasi.');
  addBullet('Ubah Kata Sandi Mandiri', 'Buka Manajemen Pengguna -> Kelola Akun pada sidebar untuk mengubah kata sandi wilayah Anda sendiri. Perubahan otomatis tersinkron ke seluruh perangkat.');
  addBullet('Batas Hak Akses Wilayah', 'Admin Kab/Kota dapat melihat tabel Rekon Daerah 14 kabupaten/kota, namun pengeditan status, catatan, dan konfirmasi sewa alat hanya aktif untuk wilayah miliknya sendiri.');
  addBullet('Menu Khusus Admin Provinsi', 'Upload Excel/Template, Tambah/Hapus Responden, Simulasi Ranking, LK Sewa Alat, Dokumen & Arsip, serta Pengaturan Global hanya diakses Admin Provinsi.');
  y += 2;

  // Bab 2
  addSectionHeader('Bab 2', 'Menyelesaikan Tabel Anomali Rekon (Fokus Utama)');
  addParagraph('Suatu komoditas otomatis muncul di Tabel Anomali apabila memiliki Koefisien Variasi (CV) > 20%, Rasio Harga 2027 terhadap Harga 2026 < 80% atau > 120%, atau keduanya (Ganda).');
  addBullet('Langkah 1 - Saring Anomali', 'Gunakan filter Jenis Kuesioner (Natural, Pabrikan, Sewa Alat & Upah), Kualitas/Komoditas, Kriteria Anomali, dan Status Rekon (Belum Rekon). Wilayah otomatis terkunci ke Kab/Kota Anda.');
  addBullet('Langkah 2 - Periksa Responden', 'Klik tombol Detail (ikon mata) pada baris anomali untuk meninjau harga tiap toko/responden pada TW III 2026 s.d. TW II 2027 beserta pembanding Harga 2026.');
  addBullet('Langkah 3 - Isi Catatan Lapangan', 'Di dalam Detail Rekonda, klik ikon pensil kuning pada kotak Catatan Lapangan & Rekon, tuliskan justifikasi pasar secara jelas, lalu klik Simpan Catatan.');
  addBullet('Langkah 4 - Tandai Rekon Selesai', 'Ubah dropdown Status Rekon menjadi Rekon Selesai (atau klik Tandai Rekon Selesai di Detail Rekonda). Data langsung tersimpan ke cloud Supabase.');
  y += 2;

  // Bab 3
  addSectionHeader('Bab 3', "Memahami Basis '26 vs '27, Final '26 & Merek Acuan");
  addParagraph("Harga 2026 di tabel utama berasal dari hasil finalisasi IKK Rekonda 2026, sedangkan Harga 2027 sementara mengagregasi seluruh responden survei pengumpulan. Di Detail Rekonda terdapat penanda di bawah angka Harga '26:");
  addBullet("Final '26", 'Responden dan mereknya ikut dihitung pada hasil final IKK Rekonda 2026.');
  addBullet('Webentry (Non-Final)', 'Tahun lalu hanya tercatat di Webentry dan tidak ikut perhitungan final 2026, namun tetap terdata pada pengumpulan tahun berjalan.');
  addBullet("Non-Acuan '26", 'Merek responden berbeda dengan Merek Acuan yang dipakai pada finalisasi tahun lalu.');
  addBullet("Baru '27", 'Responden baru pada pengumpulan 2027 yang belum tercatat di database 2026.');
  addParagraph('Gunakan pemilih Basis Hitung di toolbar tabel utama (Semua Responden 27 / Filter Merek Acuan 26 / Apple-to-Apple Final 26) untuk mengecek perbandingan secara adil tanpa menghapus data responden survei.');
  y += 2;

  // Bab 4
  addSectionHeader('Bab 4', 'Konfirmasi Sewa Alat Berat & Genset (Kode 5101 - 5803)');
  addParagraph('Dalam 1 kab/kota dapat terdapat campuran responden Sewa Murni dan paket All-In (mencakup BBM, operator, atau mobilisasi).');
  addBullet('Konfirmasi Per Responden', 'Buka Detail Rekonda pada komoditas 5101-5803, lalu pilih kolom Jenis Sewa untuk setiap responden: Sewa Murni atau All-In. Tersedia juga tombol cepat Semua Sewa Murni / Semua All-In.');
  addBullet('Menunggu LK & LK Murni', 'Responden berstatus All-In akan menampilkan status Menunggu LK hingga Admin Provinsi menghitung pemisahan komponennya di LK Sewa Alat dan menerapkannya menjadi nilai LK Murni.');
  addBullet('Perhitungan Otomatis', 'Harga 2027, CV, dan Rasio di tabel utama otomatis terhitung setelah seluruh responden pada komoditas tersebut siap berstatus murni.');
  y += 2;

  // Bab 5
  addSectionHeader('Bab 5', 'Rekon Daerah, Ekspor Excel & Sesuaikan Tampilan');
  addBullet('Navigasi Komoditas', 'Gunakan pemilih Kualitas / Komoditas Rekon dan tombol Sebelumnya / Selanjutnya untuk berpindah antar 89 komoditas serta klik grafik batang untuk menyorot wilayah.');
  addBullet('Ekspor Data Excel (.xlsx)', 'Gunakan tombol Excel di tabel atau menu Ekspor Data Seluruh di sidebar untuk mengunduh rekap 89 kualitas maupun rincian seluruh responden.');
  addBullet('Sesuaikan Tampilan', 'Buka Sesuaikan Tampilan di sidebar untuk mengatur kerapatan baris, skala font, dan lebar penuh tabel agar nyaman dibuka dari laptop maupun HP.');
  y += 2;

  // Bab 6
  addSectionHeader('Bab 6', 'Tanya Jawab Singkat (FAQ)');
  addBullet('Apakah status tersimpan otomatis?', 'Ya. Perubahan Status Rekon dan Jenis Sewa langsung tersimpan otomatis ke Supabase. Untuk Catatan Lapangan di Detail Rekonda, pastikan klik Simpan Catatan.');
  addBullet('Kenapa TW I 27 & TW II 27 bertanda strip (-)?', 'Kolom triwulan mengikuti data aktual yang sudah diunggah; tanda strip berarti triwulan tersebut belum memiliki entri data.');
  addBullet('Jika ada salah input harga/responden?', 'Penambahan, koreksi harga mentah, atau penghapusan responden dikelola oleh Admin Provinsi. Catat usulan koreksi pada kolom Catatan Lapangan lalu koordinasikan dengan Admin Provinsi.');

  addPageFooters(doc, 'Buku Pedoman Admin Kab/Kota - REKONDA 2026/2027 (BPS Prov. Kalbar)');
  savePdfBlob(doc, `Buku_Pedoman_Admin_KabKota_REKONDA_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadRekonDaerahPdf(params: {
  provinsi: Provinsi;
  komoditas: Komoditas;
  data: KabupatenRekon[];
  periodeText?: string;
}): void {
  const { provinsi, komoditas, data, periodeText = 'TW III/IV 2026 s/d TW I/II 2027' } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginX = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('REKONSILIASI DATA HARGA KONSUMEN KONSTRUKSI (REKONDA 2026/2027)', marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Provinsi: [${provinsi.kode}] ${provinsi.nama}   |   Periode: ${periodeText}`, marginX, 18.5);
  doc.text(`Komoditas: [${komoditas.kode}] ${komoditas.nama} (${komoditas.satuan})`, marginX, 23.5);

  const body = data.map((r) => [
    `[${r.kode}] ${r.nama}`,
    r.harga2027 > 0 ? formatRupiahNumber(r.harga2027) : '-',
    r.hargaTw3_2026 > 0 ? formatRupiahNumber(r.hargaTw3_2026) : '-',
    r.hargaTw4_2026 > 0 ? formatRupiahNumber(r.hargaTw4_2026) : '-',
    r.hargaTw1_2027 > 0 ? formatRupiahNumber(r.hargaTw1_2027) : '-',
    r.hargaTw2_2027 > 0 ? formatRupiahNumber(r.hargaTw2_2027) : '-',
    r.harga2027 > 0 ? `${formatPercent(r.koefisienVariasi)}%` : '-',
    r.harga2027 > 0 && r.namaKualitas && r.namaKualitas !== '-' ? r.namaKualitas : '-',
    r.harga2026 > 0 ? formatRupiahNumber(r.harga2026) : '-',
    r.harga2027 > 0 && r.harga2026 > 0 ? `${formatPercent(r.rasio)}%` : '-',
    r.statusRekon === 'rekon_selesai' || r.isVerified ? 'Selesai' : 'Belum'
  ]);

  autoTable(doc, {
    startY: 27,
    margin: { left: marginX, right: marginX },
    head: [[
      'Kabupaten/Kota',
      'Harga 2027',
      "TW III '26",
      "TW IV '26",
      "TW I '27",
      "TW II '27",
      'CV (%)',
      'Merek Terbanyak',
      'Harga 2026',
      'Rasio',
      'Status'
    ]],
    body,
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
      10: { halign: 'center' }
    }
  });

  addPageFooters(doc, `REKONDA - [${provinsi.kode}] ${provinsi.nama} | [${komoditas.kode}]`);
  savePdfBlob(doc, `Rekon_Daerah_${provinsi.kode}_${komoditas.kode}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadAnomaliRekonPdf(params: {
  title: string;
  subtitle: string;
  rows: Array<{
    no: number;
    komoditasKode: string;
    komoditasNama: string;
    kabKode: string;
    kabNama: string;
    harga2027: number;
    harga2026: number;
    rasio: number;
    cv: number;
    status: string;
    catatan: string;
  }>;
}): void {
  const { title, subtitle, rows } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginX = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`${subtitle}   |   Total Anomali: ${rows.length} baris`, marginX, 18.5);

  const body = rows.map((r) => [
    String(r.no),
    `[${r.komoditasKode}] ${r.komoditasNama}`,
    `[${r.kabKode}] ${r.kabNama}`,
    r.harga2027 > 0 ? formatRupiahNumber(r.harga2027) : '-',
    r.harga2026 > 0 ? formatRupiahNumber(r.harga2026) : '-',
    r.harga2027 > 0 && r.harga2026 > 0 ? `${formatPercent(r.rasio)}%` : '-',
    r.harga2027 > 0 ? `${formatPercent(r.cv)}%` : '-',
    r.status === 'rekon_selesai' ? 'Rekon Selesai' : 'Belum Rekon',
    r.catatan || '-'
  ]);

  autoTable(doc, {
    startY: 22,
    margin: { left: marginX, right: marginX },
    head: [[
      'No',
      'Komoditas / Kualitas Rekon',
      'Kabupaten / Kota',
      'Harga 2027',
      'Harga 2026',
      'Rasio',
      'CV (%)',
      'Status Rekon',
      'Catatan & Justifikasi'
    ]],
    body,
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 55 },
      2: { cellWidth: 36 },
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'center', cellWidth: 25 },
      8: { cellWidth: 'auto' }
    }
  });

  addPageFooters(doc, 'Daftar Anomali Rekon - REKONDA 2026/2027');
  savePdfBlob(doc, `Daftar_Anomali_REKONDA_${new Date().toISOString().slice(0, 10)}.pdf`);
}
