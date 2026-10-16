# Kampungku 🌾

**Kampungku** adalah game simulasi pertanian 2D (*Farming Sim*) bernuansa pedesaan Indonesia dengan gaya visual **Top-Down Pixel Art**, dikembangkan menggunakan **Godot Engine 4**. Proyek ini dirancang dengan pendekatan *mobile-first* untuk platform Android dan mendukung pengujian langsung di Desktop (PC/Laptop).

---

## 🎮 Fitur Saat Ini (Tahap Prototype)

- **Pergerakan 8 Arah Responsif**: Karakter dapat bergerak ke 8 arah mata angin dengan kecepatan jalan yang seimbang (vektor diagonal dinormalisasi sehingga tidak lebih cepat saat bergerak serong).
- **Dukungan Multi-Input**:
  - **Desktop (PC/Laptop)**: Kontrol menggunakan keyboard tombol **WASD** atau **Panah (Arrow Keys)**.
  - **Mobile (Android)**: Kontrol layar sentuh dan drag (*touch/drag control*) responsif dengan *deadzone* anti-jitter dan radius seret dinamis.
- **Animasi Karakter 4 Arah**:
  - Berjalan: `walk_down` (depan), `walk_up` (belakang), `walk_left` (kiri), dan `walk_right` (kanan).
  - Diam (*Idle*): Karakter tetap menghadap ke arah terakhir saat input berhenti (`idle_down`, `idle_up`, dll.).
- **Lingkungan Prototype**:
  - Hamparan padang rumput hijau yang berulang secara mulus (*seamless tile*).
  - Jalan setapak vertikal tanah liat berbatu dengan style pixel art yang selaras dengan karakter petani.
  - Kamera pelacak (*Camera2D*) yang mengikuti karakter dengan efek perpindahan halus (*position smoothing*).

---

## 🛠️ Spesifikasi Teknis

| Parameter | Spesifikasi |
|---|---|
| **Engine** | Godot Engine 4.x (GDScript 2.0) |
| **Gaya Seni** | 2D Top-Down Pixel Art (16-bit / Retro) |
| **Target Platform** | Android (Utama) & Desktop Windows/Linux/Mac (Testing) |
| **Mode Layar** | Canvas Items, Aspect: Expand (Responsif untuk berbagai rasio layar HP) |

---

## 📁 Struktur Folder Proyek

```text
kampungku/
├── sprites/
│   ├── petani/
│   │   ├── walk_down_*.png       # Frame animasi hadap depan (0-3)
│   │   ├── walk_up_*.png         # Frame animasi hadap belakang (0-3)
│   │   ├── walk_left_*.png       # Frame animasi hadap kiri (0-3)
│   │   ├── walk_right_*.png      # Frame animasi hadap kanan (0-3)
│   │   ├── petani_frames.tres    # Resource SpriteFrames Godot
│   │   └── petani_sheet_clean.png# Spritesheet grid 4x4 bersih
│   ├── jalan_vertikal.png        # Tekstur jalan setapak vertikal
│   └── rumput_tile.png           # Tekstur tile rumput seamless
├── petani.tscn                   # Scene utama berisi karakter, background, dan kamera
├── petani.gd                     # Script logika pergerakan & animasi karakter
├── project.godot                 # File konfigurasi utama Godot Engine
├── AGENTS.md                     # Pedoman arsitektur dan aturan pengembangan proyek
└── README.md                     # Dokumentasi proyek
```

---

## 🚀 Cara Menjalankan Proyek

1. **Clone repository ini**:
   ```bash
   git clone https://github.com/itoo28/kampungku.git
   ```
2. **Buka di Godot**:
   - Buka **Godot Engine 4.x** (disarankan versi 4.3 atau lebih baru).
   - Klik tombol **Import**, lalu arahkan ke folder proyek `kampungku` dan pilih file `project.godot`.
3. **Jalankan Game**:
   - Tekan tombol **F5** (Play Project) atau **F6** (Play Current Scene).
   - Gunakan keyboard (**WASD / Panah**) atau **klik & drag mouse** pada layar untuk menggerakkan petani.

---

## 🗺️ Rencana Pengembangan Selanjutnya (Roadmap)

- [ ] Implementasi sistem grid tanah menggunakan `TileMapLayer`.
- [ ] Sistem interaksi alat pertanian (mencangkul tanah, menyiram air, menabur benih).
- [ ] Siklus pertumbuhan tanaman lokal (padi, jagung, cabai).
- [ ] Tampilan antarmuka (*UI/HUD*) untuk tas inventaris (*inventory*) dan joystick virtual layar sentuh.
- [ ] Siklus waktu (pagi, siang, sore, malam) dan cuaca tropis (hujan/panas).
