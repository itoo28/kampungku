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
- **Lingkungan Kampung Indonesia (16-bit Pixel Art)**:
  - Hamparan padang rumput hijau cerah (*seamless tile*) dengan jalan setapak batu kampung (vertikal, horizontal, simpang empat) serta tebing tanah bertangga batu menuju lembah sawah.
  - Bangunan khas desa Indonesia lengkap dengan kolisi & *Y-sorting*: **Indomaret**, **Warung Bu Siti**, **Pos Ronda** (lengkap dengan kentongan & lentera), **Rumah Warga Desa** berpagar kayu, dan **Saung Sawah**.
  - Area persawahan dengan petak sawah berair, tanaman padi, pohon kelapa, pohon rindang, lampu jalan kayu, bangku kampung, dan lahan garapan interaktif (`TileMapLayer` `Ladang`) yang bisa dicangkul.
  - Kamera pelacak (*Camera2D*) dengan *pixel-snapping* dan filter tekstur *Nearest* agar sprite tetap tajam saat karakter bergerak.

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
│   ├── bangunan/                 # Bangunan kampung (indomaret, warung, pos_ronda, saung_sawah, rumah_desa)
│   ├── lingkungan/               # Jalan batu, simpang, tebing & tangga batu, sawah berair, padi
│   ├── properti/                 # Lampu jalan, bangku kayu, pagar, pohon rindang, pohon kelapa, gentong, semak
│   ├── petani/
│   │   ├── walk_down_*.png       # Frame animasi hadap depan (0-3)
│   │   ├── walk_up_*.png         # Frame animasi hadap belakang (0-3)
│   │   ├── walk_left_*.png       # Frame animasi hadap kiri (0-3)
│   │   ├── walk_right_*.png      # Frame animasi hadap kanan (0-3)
│   │   ├── petani_frames.tres    # Resource SpriteFrames Godot (8 FPS walk)
│   │   └── petani_sheet_clean.png# Spritesheet grid 4x4 pixel-locked (512x640)
│   ├── jalan_vertikal.png        # Tekstur jalan setapak batu vertikal
│   ├── rumput_tile.png           # Tekstur tile rumput seamless
│   ├── tanah_cangkul.png         # Tile tanah garapan ladang (128x128)
│   ├── ladang_tileset.tres       # TileSet Godot untuk TileMapLayer Ladang
│   ├── selector.png              # Selektor petak 128x128
│   ├── cangkul.png               # Sprite alat cangkul
│   └── btn_cangkul.png           # Tombol aksi cangkul mobile
├── tools/
│   └── generate_kampung_assets.js# Generator aset pixel art deterministik (skala integer 4x4)
├── petani.tscn                   # Scene utama sepetak kampung Indonesia (Ground, Ladang, DuniaKampung Y-Sort)
├── petani.gd                     # Script pergerakan, interaksi cangkul & animasi karakter
├── ladang.gd                     # Script TileMapLayer pengelola status petak ladang
├── mobile_controls.tscn/.gd      # Antarmuka tombol aksi sentuh untuk mobile
├── project.godot                 # Konfigurasi utama Godot Engine (Nearest filter & pixel snap)
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

- [x] Implementasi sistem grid tanah menggunakan `TileMapLayer` dan selektor petak 64x64.
- [x] Sistem interaksi alat mencangkul tanah (*tilling*), mendukung tombol Spasi dan tombol aksi sentuh mobile.
- [ ] Sistem menyiram air (*watering can*) dan menabur benih tanaman.
- [ ] Siklus pertumbuhan tanaman lokal (padi, jagung, cabai).
- [ ] Tampilan antarmuka (*UI/HUD*) untuk tas inventaris (*inventory*) dan joystick virtual layar sentuh.
- [ ] Siklus waktu (pagi, siang, sore, malam) dan cuaca tropis (hujan/panas).
