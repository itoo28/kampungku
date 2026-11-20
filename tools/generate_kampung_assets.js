/**
 * Deterministic Pixel Art Asset Generator for Kampungku (Godot 4)
 * Produces strict integer-scaled (4x4 per logical pixel) crisp PNG assets
 * harmonized with a 16-bit top-down Indonesian village RPG palette.
 *
 * Run: node tools/generate_kampung_assets.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCALE = 4; // 1 logical pixel = 4x4 real pixels

// ============================================================================
// Pure-JS PNG Encoder (RGBA8)
// ============================================================================
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRGBA(hex) {
  if (!hex || hex === '.' || hex === ' ') return [0, 0, 0, 0];
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

// ============================================================================
// Pixel Canvas Helper (Logical Pixels -> Exact Integer Scaled PNG)
// ============================================================================
class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  px(x, y, hex) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const [r, g, b, a] = typeof hex === 'string' ? hexToRGBA(hex) : hex;
    if (a === 0) return;
    const idx = (iy * this.w + ix) * 4;
    if (a === 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      const sa = a / 255;
      const da = this.data[idx + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA > 0) {
        this.data[idx] = Math.round((r * sa + this.data[idx] * da * (1 - sa)) / outA);
        this.data[idx + 1] = Math.round((g * sa + this.data[idx + 1] * da * (1 - sa)) / outA);
        this.data[idx + 2] = Math.round((b * sa + this.data[idx + 2] * da * (1 - sa)) / outA);
        this.data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  getPx(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return [0, 0, 0, 0];
    const idx = (y * this.w + x) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  rect(x, y, w, h, hex) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.px(x + dx, y + dy, hex);
      }
    }
  }

  rectOutline(x, y, w, h, borderHex, fillHex = null) {
    if (fillHex) this.rect(x + 1, y + 1, w - 2, h - 2, fillHex);
    for (let dx = 0; dx < w; dx++) {
      this.px(x + dx, y, borderHex);
      this.px(x + dx, y + h - 1, borderHex);
    }
    for (let dy = 0; dy < h; dy++) {
      this.px(x, y + dy, borderHex);
      this.px(x + w - 1, y + dy, borderHex);
    }
  }

  ellipse(cx, cy, rx, ry, hex) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) this.px(x, y, hex);
      }
    }
  }

  blit(other, ox, oy, flipX = false) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const sx = flipX ? (other.w - 1 - x) : x;
        const rgba = other.getPx(sx, y);
        if (rgba[3] > 0) this.px(ox + x, oy + y, rgba);
      }
    }
  }

  outline(outlineHex = '#1c141d') {
    const copy = new Uint8Array(this.data);
    const hasAlpha = (x, y) => {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
      return copy[(y * this.w + x) * 4 + 3] > 0;
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!hasAlpha(x, y)) {
          if (hasAlpha(x - 1, y) || hasAlpha(x + 1, y) || hasAlpha(x, y - 1) || hasAlpha(x, y + 1)) {
            this.px(x, y, outlineHex);
          }
        }
      }
    }
  }

  // Wrap sprite with borderless shadow underneath after outlining
  withGroundShadow(cx, cy, rx, ry, shadowHex = '#1c141d50') {
    const out = new PixelCanvas(this.w, this.h);
    out.ellipse(cx, cy, rx, ry, shadowHex);
    out.blit(this, 0, 0);
    return out;
  }

  savePNG(filePath, scale = SCALE) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const outW = this.w * scale;
    const outH = this.h * scale;
    const outBuf = Buffer.alloc(outW * outH * 4);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const srcIdx = (y * this.w + x) * 4;
        const r = this.data[srcIdx];
        const g = this.data[srcIdx + 1];
        const b = this.data[srcIdx + 2];
        const a = this.data[srcIdx + 3];
        if (a === 0) continue;
        for (let sy = 0; sy < scale; sy++) {
          const rowStart = ((y * scale + sy) * outW + x * scale) * 4;
          for (let sx = 0; sx < scale; sx++) {
            const dstIdx = rowStart + sx * 4;
            outBuf[dstIdx] = r;
            outBuf[dstIdx + 1] = g;
            outBuf[dstIdx + 2] = b;
            outBuf[dstIdx + 3] = a;
          }
        }
      }
    }
    fs.writeFileSync(filePath, encodePNG(outW, outH, outBuf));
  }
}

// ============================================================================
// Tiny Crisp 3x5 Pixel Font (for INDOMARET, WARUNG, POS RONDA signs)
// ============================================================================
const PIXEL_FONT_3X5 = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  Y: ['101', '101', '010', '010', '010'],
  ' ': ['000', '000', '000', '000', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

function drawText(c, text, x, y, color) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = PIXEL_FONT_3X5[ch];
    if (glyph) {
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (glyph[gy][gx] === '1') c.px(cx + gx, y + gy, color);
        }
      }
      cx += 4;
    } else {
      cx += 3;
    }
  }
}

// ============================================================================
// Shared Indonesian Village RPG Color Palette (Matched to Reference Image)
// ============================================================================
const PAL = {
  OUTLINE: '#1c141d',
  SHADOW: '#1c141d48',

  // Grass & Foliage
  GRASS_BASE: '#46b82a',
  GRASS_DARK: '#33941c',
  GRASS_DEEP: '#236e12',
  GRASS_LIGHT: '#6ad638',
  GRASS_HIGH: '#8aeb4b',

  // Cobblestone & Dirt Paths
  STONE_LIGHT: '#dbd4c8',
  STONE_MID: '#c7bfb2',
  STONE_DARK: '#aba396',
  STONE_MORTAR: '#8c8377',
  DIRT_LIGHT: '#9c5c33',
  DIRT_MID: '#7a4524',
  DIRT_DARK: '#572f17',
  DIRT_DEEP: '#3d1f0e',

  // Tilled Soil & Sawah
  SOIL_DARK: '#4a2714',
  SOIL_MID: '#6b3b20',
  SOIL_LIGHT: '#8c512d',
  SOIL_TOP: '#a8673d',
  WATER_DEEP: '#347ca6',
  WATER_MID: '#4c9ac2',
  WATER_LIGHT: '#7cc6e3',
  WATER_FOAM: '#cdeef9',

  // Terracotta & Slate Roofs
  TERR_HIGH: '#f27c49',
  TERR_BASE: '#de5228',
  TERR_MID: '#bd3b1a',
  TERR_DARK: '#8c2812',
  SLATE_HIGH: '#6a7f96',
  SLATE_BASE: '#4c5e73',
  SLATE_DARK: '#344152',

  // Wood, Bamboo, Straw
  WOOD_HIGH: '#c9884d',
  WOOD_BASE: '#a16332',
  WOOD_DARK: '#784420',
  WOOD_DEEP: '#522b12',
  BAMBOO_HIGH: '#e6c16c',
  BAMBOO_BASE: '#c79b42',
  BAMBOO_DARK: '#997024',
  STRAW_HIGH: '#edd082',
  STRAW_BASE: '#cfa34c',
  STRAW_DARK: '#9c7228',

  // Stucco & Stone Walls
  CREAM_HIGH: '#f5e4c3',
  CREAM_BASE: '#e8cfa0',
  CREAM_SHAD: '#cca976',
  WHITE: '#f5f5f5',
  GRAY_WALL: '#dce2ec',
  WALL_BASE_LIGHT: '#9a948a',
  WALL_BASE_DARK: '#726b62',

  // Windows & Glass
  GLASS_DARK: '#233647',
  GLASS_MID: '#4b86b5',
  GLASS_HIGH: '#8ccbf2',
  INTERIOR_DARK: '#2b1d24',

  // Indomaret Brand Colors
  INDO_RED: '#e02b20',
  INDO_RED_DARK: '#a81912',
  INDO_BLUE: '#1a5dc4',
  INDO_BLUE_DARK: '#103b82',
  INDO_YELLOW: '#f7c823',
};

function hash2(x, y, seed = 1337) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

// ============================================================================
// 1. GROUND TILES (32x32 logical -> 128x128 PNG @ 4x)
// ============================================================================
function generateGroundTiles() {
  // 1A. Seamless Vibrant Meadow Grass Tile (rumput_tile.png)
  {
    const c = new PixelCanvas(32, 32);
    c.rect(0, 0, 32, 32, PAL.GRASS_BASE);
    const tufts = [
      [4, 5], [14, 3], [24, 7], [9, 14], [20, 13], [28, 18],
      [3, 24], [15, 22], [25, 28], [12, 29],
    ];
    for (const [tx, ty] of tufts) {
      c.px(tx, ty, PAL.GRASS_DARK);
      c.px((tx + 1) % 32, ty, PAL.GRASS_LIGHT);
      c.px(tx, (ty + 1) % 32, PAL.GRASS_DARK);
    }
    const flowers = [[7, 9], [22, 21]];
    for (const [fx, fy] of flowers) {
      c.px(fx, fy, PAL.INDO_YELLOW);
      c.px(fx - 1, fy, PAL.WHITE);
      c.px(fx + 1, fy, PAL.WHITE);
      c.px(fx, fy - 1, PAL.WHITE);
      c.px(fx, fy + 1, PAL.WHITE);
    }
    c.savePNG('sprites/rumput_tile.png');
  }

  // 1B. Interactive Tilled Soil Tile (tanah_cangkul.png) - 16x16 logical -> 64x64 px (realistic scale)
  {
    const c = new PixelCanvas(16, 16);
    c.rect(1, 1, 14, 14, PAL.SOIL_MID);
    // 3 crisp horizontal agricultural furrows
    for (let row = 0; row < 3; row++) {
      const y0 = 2 + row * 4;
      c.rect(2, y0, 12, 1, PAL.SOIL_TOP);
      c.rect(2, y0 + 1, 12, 2, PAL.SOIL_LIGHT);
      c.rect(2, y0 + 3, 12, 1, PAL.SOIL_DARK);
      for (let x = 3; x < 13; x += 3) {
        if (hash2(x, row, 77) > 0.45) c.px(x, y0 + 1, PAL.SOIL_TOP);
        if (hash2(x, row, 91) > 0.55) c.px(x + 1, y0 + 2, PAL.SOIL_MID);
      }
    }
    // Soft rounded dark-soil border (transparent outer corners so individual plots blend nicely)
    c.rect(1, 0, 14, 1, PAL.SOIL_DARK);
    c.rect(1, 15, 14, 1, PAL.SOIL_DARK);
    c.rect(0, 1, 1, 14, PAL.SOIL_DARK);
    c.rect(15, 1, 1, 14, PAL.SOIL_DARK);
    c.px(1, 1, PAL.SOIL_DARK); c.px(14, 1, PAL.SOIL_DARK);
    c.px(1, 14, PAL.SOIL_DARK); c.px(14, 14, PAL.SOIL_DARK);
    c.savePNG('sprites/tanah_cangkul.png');
  }

  // Organic rounded pebble cobblestone shader (matched to reference image!)
  function paintCobblePixel(c, x, y) {
    const cx = Math.floor(x / 4);
    const cy = Math.floor(y / 4);
    const offsetX = (cy % 2) * 2;
    const px = (x + offsetX) % 4;
    const py = y % 4;
    const stoneSeed = hash2(Math.floor((x + offsetX) / 4), cy, 909);

    // Rounded pebble corners = mortar
    const isCorner = (px === 0 && py === 0) || (px === 3 && py === 0) || (px === 0 && py === 3) || (px === 3 && py === 3);
    if (isCorner || px === 0 && py === 1 && stoneSeed < 0.3) {
      c.px(x, y, PAL.STONE_MORTAR);
    } else if (py === 0) {
      c.px(x, y, PAL.STONE_LIGHT);
    } else if (py === 3 || px === 3) {
      c.px(x, y, PAL.STONE_DARK);
    } else {
      c.px(x, y, stoneSeed > 0.68 ? PAL.STONE_LIGHT : stoneSeed < 0.28 ? PAL.STONE_DARK : PAL.STONE_MID);
    }
  }

  // 1C. Vertical Cobblestone Village Road (sprites/jalan_vertikal.png) - 128x128
  {
    const c = new PixelCanvas(32, 32);
    for (let y = 0; y < 32; y++) {
      const wobbleL = Math.round(Math.sin((y / 32) * Math.PI * 2) * 1);
      const wobbleR = Math.round(Math.cos((y / 32) * Math.PI * 2) * 1);
      const xLeft = 4 + wobbleL;
      const xRight = 27 + wobbleR;

      for (let x = 0; x < 32; x++) {
        if (x < xLeft - 2 || x > xRight + 2) {
          c.px(x, y, PAL.GRASS_BASE);
        } else if (x === xLeft - 2 || x === xRight + 2) {
          c.px(x, y, PAL.GRASS_DARK);
        } else if (x === xLeft - 1 || x === xRight + 1) {
          c.px(x, y, (y % 3 === 0) ? PAL.GRASS_DARK : PAL.DIRT_DARK);
        } else if (x === xLeft || x === xRight) {
          c.px(x, y, PAL.DIRT_LIGHT);
        } else {
          paintCobblePixel(c, x, y);
        }
      }
      if (y % 6 === 2) {
        c.px(xLeft - 1, y, PAL.GRASS_LIGHT);
        c.px(xRight + 1, y, PAL.GRASS_LIGHT);
      }
      if (y === 10) { c.px(13, y, PAL.GRASS_DARK); c.px(14, y, PAL.GRASS_LIGHT); }
      if (y === 23) { c.px(19, y, PAL.GRASS_DARK); c.px(20, y, PAL.GRASS_LIGHT); }
    }
    c.savePNG('sprites/jalan_vertikal.png');
  }

  // 1D. Horizontal Cobblestone Village Road (sprites/lingkungan/jalan_batu_h.png) - 128x128
  {
    const c = new PixelCanvas(32, 32);
    for (let x = 0; x < 32; x++) {
      const wobbleT = Math.round(Math.sin((x / 32) * Math.PI * 2) * 1);
      const wobbleB = Math.round(Math.cos((x / 32) * Math.PI * 2) * 1);
      const yTop = 4 + wobbleT;
      const yBot = 27 + wobbleB;

      for (let y = 0; y < 32; y++) {
        if (y < yTop - 2 || y > yBot + 2) {
          c.px(x, y, PAL.GRASS_BASE);
        } else if (y === yTop - 2 || y === yBot + 2) {
          c.px(x, y, PAL.GRASS_DARK);
        } else if (y === yTop - 1 || y === yBot + 1) {
          c.px(x, y, (x % 3 === 0) ? PAL.GRASS_DARK : PAL.DIRT_DARK);
        } else if (y === yTop || y === yBot) {
          c.px(x, y, PAL.DIRT_LIGHT);
        } else {
          paintCobblePixel(c, x, y);
        }
      }
      if (x % 6 === 3) {
        c.px(x, yTop - 1, PAL.GRASS_LIGHT);
        c.px(x, yBot + 1, PAL.GRASS_LIGHT);
      }
      if (x === 9) { c.px(x, 14, PAL.GRASS_DARK); c.px(x, 15, PAL.GRASS_LIGHT); }
      if (x === 23) { c.px(x, 19, PAL.GRASS_DARK); c.px(x, 20, PAL.GRASS_LIGHT); }
    }
    c.savePNG('sprites/lingkungan/jalan_batu_h.png');
  }

  // 1E. Crossroads / Plaza Cobblestone Tile (sprites/lingkungan/jalan_simpang.png) - 128x128
  {
    const c = new PixelCanvas(32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        paintCobblePixel(c, x, y);
      }
    }
    const corners = [
      [0, 0, 1, 1], [31, 0, -1, 1], [0, 31, 1, -1], [31, 31, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          const d = dx + dy;
          const px = cx + dx * sx;
          const py = cy + dy * sy;
          if (d <= 2) c.px(px, py, PAL.GRASS_BASE);
          else if (d === 3) c.px(px, py, PAL.GRASS_DARK);
          else if (d === 4) c.px(px, py, PAL.DIRT_DARK);
        }
      }
    }
    c.px(11, 10, PAL.GRASS_DARK); c.px(12, 10, PAL.GRASS_LIGHT);
    c.px(20, 21, PAL.GRASS_DARK); c.px(21, 21, PAL.GRASS_LIGHT);
    c.savePNG('sprites/lingkungan/jalan_simpang.png');
  }

  // 1F. Dirt Cliff Terrace (sprites/lingkungan/tebing_tanah.png) - 128x64
  {
    const c = new PixelCanvas(32, 16);
    for (let x = 0; x < 32; x++) {
      const lip = (x % 4 === 0) ? 3 : 2;
      for (let y = 0; y < 16; y++) {
        if (y < lip) c.px(x, y, PAL.GRASS_BASE);
        else if (y === lip) c.px(x, y, PAL.GRASS_DARK);
        else if (y === lip + 1) c.px(x, y, PAL.DIRT_DEEP);
        else if (y < 7) c.px(x, y, PAL.DIRT_LIGHT);
        else if (y < 11) c.px(x, y, (x + y) % 5 === 0 ? PAL.DIRT_LIGHT : PAL.DIRT_MID);
        else if (y < 14) c.px(x, y, PAL.DIRT_DARK);
        else if (y === 14) c.px(x, y, PAL.OUTLINE);
        else c.px(x, y, PAL.GRASS_DARK);
      }
    }
    c.savePNG('sprites/lingkungan/tebing_tanah.png');
  }

  // 1G. Stone Staircase on Cliff (sprites/lingkungan/tangga_batu.png) - 128x64
  {
    const c = new PixelCanvas(32, 16);
    c.rect(0, 0, 32, 16, PAL.DIRT_DARK);
    c.rect(0, 0, 3, 16, PAL.DIRT_MID);
    c.rect(29, 0, 3, 16, PAL.DIRT_MID);
    c.rect(3, 0, 1, 16, PAL.OUTLINE);
    c.rect(28, 0, 1, 16, PAL.OUTLINE);
    for (let step = 0; step < 4; step++) {
      const sy = step * 4;
      c.rect(4, sy, 24, 1, PAL.STONE_LIGHT);
      c.rect(4, sy + 1, 24, 2, PAL.STONE_MID);
      c.rect(4, sy + 3, 24, 1, PAL.STONE_MORTAR);
      c.px(12 + step * 2, sy + 1, PAL.STONE_DARK);
      c.px(20 - step * 2, sy + 2, PAL.STONE_DARK);
    }
    c.savePNG('sprites/lingkungan/tangga_batu.png');
  }

  // 1H. Flooded Rice Paddy Tile (sprites/lingkungan/sawah_air.png) - 256x192
  {
    const c = new PixelCanvas(64, 48);
    // Grassy earthen bunds (pematang sawah) that blend cleanly on grass
    c.rectOutline(0, 0, 64, 48, PAL.GRASS_DARK, PAL.GRASS_BASE);
    c.rectOutline(1, 1, 62, 46, PAL.GRASS_LIGHT);
    c.rectOutline(2, 2, 60, 44, PAL.DIRT_LIGHT);
    c.rectOutline(3, 3, 58, 42, PAL.DIRT_MID);
    c.rectOutline(4, 4, 56, 40, PAL.DIRT_DEEP);
    // Flooded water interior
    c.rect(5, 5, 54, 38, PAL.WATER_MID);
    c.rect(5, 5, 54, 3, PAL.WATER_DEEP);
    for (let y = 10; y < 40; y += 6) {
      for (let x = 8; x < 54; x += 11) {
        c.rect(x, y, 4, 1, PAL.WATER_LIGHT);
        c.px(x + 5, y + 2, PAL.WATER_FOAM);
      }
    }
    for (let row = 0; row < 4; row++) {
      const py = 12 + row * 8;
      for (let col = 0; col < 6; col++) {
        const px = 10 + col * 8 + (row % 2) * 2;
        c.rect(px - 1, py + 2, 5, 1, PAL.WATER_LIGHT);
        c.px(px + 1, py + 1, PAL.GRASS_DEEP);
        c.px(px + 2, py + 1, PAL.GRASS_DEEP);
        c.px(px, py, PAL.GRASS_DARK);
        c.px(px + 1, py, PAL.GRASS_BASE);
        c.px(px + 2, py, PAL.GRASS_BASE);
        c.px(px + 3, py, PAL.GRASS_DARK);
        c.px(px - 1, py - 1, PAL.GRASS_LIGHT);
        c.px(px + 1, py - 2, PAL.GRASS_HIGH);
        c.px(px + 2, py - 1, PAL.GRASS_LIGHT);
        c.px(px + 4, py - 1, PAL.GRASS_HIGH);
        if ((row + col) % 3 === 0) {
          c.px(px, py - 2, PAL.BAMBOO_HIGH);
          c.px(px + 3, py - 2, PAL.BAMBOO_HIGH);
        }
      }
    }
    c.savePNG('sprites/lingkungan/sawah_air.png');
  }

  // 1I. Planted Rice Cluster Overlay Sprite (sprites/lingkungan/padi_tumbuh.png) - 96x96
  {
    const c = new PixelCanvas(24, 24);
    for (let i = 0; i < 3; i++) {
      const bx = 4 + i * 7;
      const by = 18 - (i % 2) * 2;
      c.rect(bx, by, 4, 2, PAL.GRASS_DEEP);
      c.px(bx - 1, by - 2, PAL.GRASS_DARK);
      c.px(bx, by - 3, PAL.GRASS_BASE);
      c.px(bx + 1, by - 5, PAL.GRASS_LIGHT);
      c.px(bx + 2, by - 4, PAL.GRASS_BASE);
      c.px(bx + 3, by - 6, PAL.BAMBOO_HIGH);
      c.px(bx + 4, by - 5, PAL.BAMBOO_BASE);
      c.px(bx + 4, by - 2, PAL.GRASS_LIGHT);
    }
    c.outline(PAL.OUTLINE);
    c.savePNG('sprites/lingkungan/padi_tumbuh.png');
  }

  // 1J. Crisp Pixel Tile Selector (sprites/selector.png) - 16x16 logical -> 64x64 px
  {
    const c = new PixelCanvas(16, 16);
    const arm = 5;
    const drawCorner = (cx, cy, dx, dy) => {
      for (let i = 0; i < arm; i++) {
        c.px(cx + dx * i, cy, PAL.OUTLINE);
        c.px(cx + dx * i, cy + dy, PAL.INDO_YELLOW);
        c.px(cx, cy + dy * i, PAL.OUTLINE);
        c.px(cx + dx, cy + dy * i, PAL.INDO_YELLOW);
      }
      c.px(cx + dx * 2, cy + dy * 2, PAL.OUTLINE);
      c.px(cx + dx, cy + dy, PAL.WHITE);
    };
    drawCorner(0, 0, 1, 1);
    drawCorner(15, 0, -1, 1);
    drawCorner(0, 15, 1, -1);
    drawCorner(15, 15, -1, -1);
    c.savePNG('sprites/selector.png');
  }

  // 1J-2. Designated Farmable Plot Backdrop (sprites/lingkungan/area_ladang.png)
  // 104x72 logical -> 416x288 px (frames a 96x64 logical = 384x256 px = 6x4 grid of 64x64 tiles!)
  {
    const c = new PixelCanvas(104, 72);
    // Outer grassy rim blending with meadow
    c.rectOutline(0, 0, 104, 72, PAL.GRASS_DARK, PAL.DIRT_MID);
    c.rectOutline(1, 1, 102, 70, PAL.DIRT_LIGHT);
    c.rectOutline(2, 2, 100, 68, PAL.DIRT_DARK);
    // Soft cleared loam interior (lighter warm dry earth so player sees farmable area clearly)
    c.rect(3, 3, 98, 66, '#b57b4a');
    c.rectOutline(3, 3, 98, 66, '#9c6236');
    // Subtle pixel pebble/earth speckles + faint 16x16 grid markers inside farmable 4..100, 4..68
    for (let y = 4; y < 68; y++) {
      for (let x = 4; x < 100; x++) {
        const n = hash2(x, y, 512);
        if (n > 0.91) c.px(x, y, '#c98e59');
        else if (n < 0.08) c.px(x, y, '#9c6236');
        // Tiny grass specks near inner border
        if ((x === 4 || x === 99 || y === 4 || y === 67) && n > 0.72) {
          c.px(x, y, PAL.GRASS_DARK);
        }
      }
    }
    // 4 short bamboo corner stakes marking the farmable boundary
    const stakes = [[1, 1], [100, 1], [1, 68], [100, 68]];
    for (const [sx, sy] of stakes) {
      c.rectOutline(sx, sy, 3, 3, PAL.OUTLINE, PAL.BAMBOO_HIGH);
      c.px(sx + 1, sy + 2, PAL.BAMBOO_DARK);
    }
    c.savePNG('sprites/lingkungan/area_ladang.png');
  }

  // 1K. Crisp Pixel Hoe Tool (sprites/cangkul.png) - 64x64
  {
    const c = new PixelCanvas(16, 16);
    for (let i = 3; i <= 11; i++) {
      c.px(i, 15 - i, PAL.WOOD_BASE);
      c.px(i, 16 - i, PAL.WOOD_DARK);
    }
    c.rect(9, 2, 4, 2, '#d8e0e8');
    c.rect(11, 4, 3, 2, '#9aa5b4');
    c.px(13, 6, '#768291');
    c.outline(PAL.OUTLINE);
    c.savePNG('sprites/cangkul.png');
  }

  // 1L. Mobile Action Button (sprites/btn_cangkul.png) - 96x96
  {
    const c = new PixelCanvas(24, 24);
    c.ellipse(12, 12, 10.5, 10.5, PAL.OUTLINE);
    c.ellipse(12, 12, 9.2, 9.2, PAL.CREAM_BASE);
    c.ellipse(12, 12, 7.8, 7.8, PAL.GRASS_DARK);
    for (let i = 6; i <= 15; i++) {
      c.px(i, 21 - i, PAL.WOOD_HIGH);
      c.px(i, 22 - i, PAL.WOOD_DARK);
    }
    c.rect(13, 5, 4, 2, PAL.WHITE);
    c.rect(15, 7, 3, 2, '#b8c4d0');
    c.savePNG('sprites/btn_cangkul.png');
  }
}

// ============================================================================
// 2. INDONESIAN FARMER CHARACTER (32x40 logical -> 128x160 PNG @ 4x)
//    Strict pixel-locked head/caping/torso + borderless shadow!
// ============================================================================
function generatePetaniSprites() {
  const FW = 32;
  const FH = 40;

  const SKIN_LIGHT = '#f7c192';
  const SKIN_BASE = '#e8a370';
  const SKIN_SHAD = '#c77f4e';
  const HAIR_DARK = '#1f161b';
  const HAIR_MID = '#38282b';
  const HAT_HIGH = '#f2cc79';
  const HAT_BASE = '#d9a44e';
  const HAT_SHAD = '#a8742a';
  const HAT_DEEP = '#754c18';
  const SHIRT_HIGH = '#f7f0df';
  const SHIRT_BASE = '#e3d5b8';
  const SHIRT_SHAD = '#bfb093';
  const SARUNG_LIGHT = '#56b868';
  const SARUNG_BASE = '#348c46';
  const SARUNG_DARK = '#21612f';
  const PANTS_BASE = '#5e3c25';
  const PANTS_DARK = '#422817';

  function renderFrame(dir, frameIdx) {
    const c = new PixelCanvas(FW, FH);
    const bob = (frameIdx === 1 || frameIdx === 3) ? -1 : 0;
    const step = frameIdx === 1 ? -1 : (frameIdx === 3 ? 1 : 0);

    const drawCaping = (yOff) => {
      const y0 = 2 + yOff;
      const widths = [2, 4, 8, 12, 16, 20, 22, 24, 22];
      for (let ry = 0; ry < widths.length; ry++) {
        const w = widths[ry];
        const xStart = Math.floor(16 - w / 2);
        for (let dx = 0; dx < w; dx++) {
          const x = xStart + dx;
          let col = HAT_BASE;
          if (ry <= 1) col = HAT_HIGH;
          else if (ry === widths.length - 1) col = HAT_DEEP;
          else if ((dx + ry) % 4 === 0) col = HAT_HIGH;
          else if (dx > w * 0.68) col = HAT_SHAD;
          c.px(x, y0 + ry, col);
        }
      }
      c.rect(7, y0 + 8, 18, 2, HAT_DEEP);
    };

    if (dir === 'down' || dir === 'up') {
      const isUp = dir === 'up';
      const by = bob;

      const lFootY = step === -1 ? 34 : (step === 1 ? 32 : 33);
      const rFootY = step === 1 ? 34 : (step === -1 ? 32 : 33);

      // Left leg
      c.rect(11, 27 + by, 4, lFootY - (27 + by), PANTS_BASE);
      c.rect(11, 27 + by, 1, lFootY - (27 + by), PANTS_DARK);
      c.rect(11, lFootY, 4, 3, SKIN_BASE);
      c.rect(11, lFootY + 2, 4, 1, '#7a4a28');

      // Right leg
      c.rect(17, 27 + by, 4, rFootY - (27 + by), PANTS_BASE);
      c.rect(20, 27 + by, 1, rFootY - (27 + by), PANTS_DARK);
      c.rect(17, rFootY, 4, 3, SKIN_BASE);
      c.rect(17, rFootY + 2, 4, 1, '#7a4a28');

      // Arms (opposite swing)
      const lArmY = 19 + by + (step === 1 ? 1 : (step === -1 ? -1 : 0));
      const rArmY = 19 + by + (step === -1 ? 1 : (step === 1 ? -1 : 0));
      c.rect(8, lArmY, 3, 4, SHIRT_BASE);
      c.rect(8, lArmY + 4, 3, 3, SKIN_BASE);
      c.px(8, lArmY + 6, SKIN_SHAD);
      c.rect(21, rArmY, 3, 4, SHIRT_BASE);
      c.rect(21, rArmY + 4, 3, 3, SKIN_BASE);
      c.px(23, rArmY + 6, SKIN_SHAD);

      // Torso (Cream Shirt + Green Sarung Sash)
      c.rect(11, 18 + by, 10, 7, SHIRT_BASE);
      c.rect(12, 18 + by, 8, 5, SHIRT_HIGH);
      if (!isUp) {
        c.px(15, 19 + by, SHIRT_SHAD);
        c.px(16, 19 + by, SHIRT_SHAD);
        c.px(15, 21 + by, SHIRT_SHAD);
      }
      c.rect(11, 24 + by, 10, 3, SARUNG_BASE);
      c.rect(12, 24 + by, 8, 1, SARUNG_LIGHT);
      c.rect(18, 25 + by, 2, 4, SARUNG_DARK);
      c.px(18, 26 + by, SARUNG_BASE);

      // Head (charming 16-bit RPG proportions)
      c.rect(10, 11 + by, 12, 7, isUp ? HAIR_DARK : SKIN_BASE);
      if (!isUp) {
        c.rect(11, 12 + by, 10, 5, SKIN_LIGHT);
        c.rect(11, 17 + by, 10, 1, SKIN_SHAD);
        // Cute rounded hair bangs framing side of face (friendly RPG eyes)
        c.rect(10, 11 + by, 12, 2, HAIR_DARK);
        c.rect(10, 13 + by, 1, 3, HAIR_DARK);
        c.rect(21, 13 + by, 1, 3, HAIR_DARK);
        c.px(12, 12 + by, HAIR_MID);
        c.px(19, 12 + by, HAIR_MID);
        // Cute 2x2 pixel eyes with bright white glint
        c.rect(12, 14 + by, 2, 2, '#1c141d');
        c.px(13, 14 + by, '#ffffff');
        c.rect(18, 14 + by, 2, 2, '#1c141d');
        c.px(18, 14 + by, '#ffffff');
        // Subtle smile/mouth
        c.px(15, 16 + by, SKIN_SHAD);
        c.px(16, 16 + by, SKIN_SHAD);
      } else {
        c.rect(11, 12 + by, 10, 4, HAIR_MID);
        c.rect(10, 16 + by, 12, 2, HAIR_DARK);
      }

      drawCaping(by);
      c.outline(PAL.OUTLINE);
      return c.withGroundShadow(16, 36, 6, 2, PAL.SHADOW);
    } else {
      const by = bob;
      const flip = (dir === 'left');
      const sc = new PixelCanvas(FW, FH);

      const backX = 14 - step * 2;
      const frontX = 14 + step * 2;

      // Back leg
      sc.rect(backX, 27 + by, 4, 6, PANTS_DARK);
      sc.rect(backX, 33 + by, 4, 2, SKIN_SHAD);
      sc.rect(backX, 34 + by, 5, 1, '#7a4a28');

      // Front leg
      sc.rect(frontX, 27 + by, 4, 6, PANTS_BASE);
      sc.rect(frontX, 33 + by, 4, 2, SKIN_BASE);
      sc.rect(frontX, 34 + by, 5, 1, '#7a4a28');

      // Torso (wider, well-proportioned)
      sc.rect(11, 18 + by, 10, 7, SHIRT_BASE);
      sc.rect(12, 18 + by, 8, 5, SHIRT_HIGH);
      sc.rect(11, 24 + by, 10, 3, SARUNG_BASE);
      sc.rect(12, 24 + by, 8, 1, SARUNG_LIGHT);
      sc.rect(12, 25 + by, 2, 4, SARUNG_DARK);

      // Head (facing right)
      sc.rect(11, 11 + by, 10, 7, SKIN_BASE);
      sc.rect(14, 12 + by, 7, 5, SKIN_LIGHT);
      sc.rect(10, 11 + by, 6, 7, HAIR_DARK);
      sc.rect(11, 11 + by, 9, 2, HAIR_DARK);
      sc.px(13, 13 + by, HAIR_MID);
      // Side eye
      sc.rect(18, 14 + by, 2, 2, '#1c141d');
      sc.px(19, 14 + by, '#ffffff');

      // Swinging arm with subtle separation line
      const armX = 14 - step * 2;
      sc.rect(armX - 1, 19 + by, 4, 4, SHIRT_SHAD);
      sc.rect(armX, 19 + by, 3, 4, SHIRT_HIGH);
      sc.rect(armX, 23 + by, 3, 3, SKIN_BASE);

      // Caping Hat (fixed profile)
      const y0 = 2 + by;
      const widths = [2, 4, 8, 12, 16, 20, 22, 24, 22];
      for (let ry = 0; ry < widths.length; ry++) {
        const w = widths[ry];
        const xStart = Math.floor(16 - w / 2);
        for (let dx = 0; dx < w; dx++) {
          let col = HAT_BASE;
          if (ry <= 1) col = HAT_HIGH;
          else if (ry === widths.length - 1) col = HAT_DEEP;
          else if ((dx + ry) % 4 === 0) col = HAT_HIGH;
          else if (dx > w * 0.65) col = HAT_SHAD;
          sc.px(xStart + dx, y0 + ry, col);
        }
      }
      sc.rect(7, y0 + 8, 18, 2, HAT_DEEP);

      sc.outline(PAL.OUTLINE);
      c.blit(sc, 0, 0, flip);
      return c.withGroundShadow(16, 36, 6, 2, PAL.SHADOW);
    }
  }

  const dirs = ['down', 'left', 'right', 'up'];
  const sheet = new PixelCanvas(FW * 4, FH * 4);

  dirs.forEach((dir, rowIdx) => {
    for (let f = 0; f < 4; f++) {
      const frame = renderFrame(dir, f);
      frame.savePNG(`sprites/petani/walk_${dir}_${f}.png`);
      sheet.blit(frame, f * FW, rowIdx * FH);
    }
  });
  sheet.savePNG('sprites/petani/petani_sheet_clean.png');

  // --- Dedicated Pixel-Locked Hoe Action Frames (2 frames per direction: windup & strike) ---
  function renderHoeFrame(dir, phase) {
    // phase 0 = windup (arms raised high), phase 1 = strike (lunge forward & down)
    const c = new PixelCanvas(FW, FH);
    const by = phase === 0 ? -1 : 1; // rise on windup, dip on strike

    const drawCapingAt = (target, yOff, xOff = 0) => {
      const y0 = 2 + yOff;
      const widths = [2, 4, 8, 12, 16, 20, 22, 24, 22];
      for (let ry = 0; ry < widths.length; ry++) {
        const w = widths[ry];
        const xStart = Math.floor(16 - w / 2) + xOff;
        for (let dx = 0; dx < w; dx++) {
          let col = HAT_BASE;
          if (ry <= 1) col = HAT_HIGH;
          else if (ry === widths.length - 1) col = HAT_DEEP;
          else if ((dx + ry) % 4 === 0) col = HAT_HIGH;
          else if (dx > w * 0.68) col = HAT_SHAD;
          target.px(xStart + dx, y0 + ry, col);
        }
      }
      target.rect(7 + xOff, y0 + 8, 18, 2, HAT_DEEP);
    };

    if (dir === 'down' || dir === 'up') {
      const isUp = dir === 'up';
      // Wide braced legs
      c.rect(10, 27 + by, 4, 6 - by, PANTS_BASE);
      c.rect(10, 27 + by, 1, 6 - by, PANTS_DARK);
      c.rect(10, 33, 4, 3, SKIN_BASE);
      c.rect(10, 35, 4, 1, '#7a4a28');

      c.rect(18, 27 + by, 4, 6 - by, PANTS_BASE);
      c.rect(21, 27 + by, 1, 6 - by, PANTS_DARK);
      c.rect(18, 33, 4, 3, SKIN_BASE);
      c.rect(18, 35, 4, 1, '#7a4a28');

      // Torso
      c.rect(11, 18 + by, 10, 7, SHIRT_BASE);
      c.rect(12, 18 + by, 8, 5, SHIRT_HIGH);
      c.rect(11, 24 + by, 10, 3, SARUNG_BASE);
      c.rect(12, 24 + by, 8, 1, SARUNG_LIGHT);
      c.rect(18, 25 + by, 2, 4, SARUNG_DARK);

      // Arms: raised overhead on windup (phase 0), thrust down/center on strike (phase 1)
      if (phase === 0) {
        // Raised arms beside caping
        c.rect(7, 13 + by, 3, 5, SHIRT_BASE);
        c.rect(7, 10 + by, 3, 3, SKIN_BASE);
        c.rect(22, 13 + by, 3, 5, SHIRT_BASE);
        c.rect(22, 10 + by, 3, 3, SKIN_BASE);
      } else {
        // Thrust arms down together toward center
        c.rect(9, 20 + by, 3, 4, SHIRT_BASE);
        c.rect(12, 23 + by, 3, 3, SKIN_BASE);
        c.rect(20, 20 + by, 3, 4, SHIRT_BASE);
        c.rect(17, 23 + by, 3, 3, SKIN_BASE);
      }

      // Head
      c.rect(10, 11 + by, 12, 7, isUp ? HAIR_DARK : SKIN_BASE);
      if (!isUp) {
        c.rect(11, 12 + by, 10, 5, SKIN_LIGHT);
        c.rect(11, 17 + by, 10, 1, SKIN_SHAD);
        c.rect(10, 11 + by, 12, 2, HAIR_DARK);
        c.rect(10, 13 + by, 1, 3, HAIR_DARK);
        c.rect(21, 13 + by, 1, 3, HAIR_DARK);
        // Focused eyes
        c.rect(12, 14 + by, 2, 2, '#1c141d');
        c.px(13, 14 + by, '#ffffff');
        c.rect(18, 14 + by, 2, 2, '#1c141d');
        c.px(18, 14 + by, '#ffffff');
        // Determined mouth
        c.rect(15, 16 + by, 2, 1, SKIN_SHAD);
      } else {
        c.rect(11, 12 + by, 10, 4, HAIR_MID);
        c.rect(10, 16 + by, 12, 2, HAIR_DARK);
      }

      drawCapingAt(c, by, 0);
      c.outline(PAL.OUTLINE);
      return c.withGroundShadow(16, 36, 7, 2, PAL.SHADOW);
    } else {
      const flip = (dir === 'left');
      const sc = new PixelCanvas(FW, FH);
      const leanX = phase === 0 ? -1 : 2;

      // Wide braced stance
      sc.rect(11, 27 + by, 4, 6 - by, PANTS_DARK);
      sc.rect(11, 33, 4, 2, SKIN_SHAD);
      sc.rect(11, 34, 5, 1, '#7a4a28');

      sc.rect(17 + (phase === 1 ? 1 : 0), 27 + by, 4, 6 - by, PANTS_BASE);
      sc.rect(17 + (phase === 1 ? 1 : 0), 33, 4, 2, SKIN_BASE);
      sc.rect(17 + (phase === 1 ? 1 : 0), 34, 5, 1, '#7a4a28');

      // Torso leaning back on windup, forward on strike
      sc.rect(11 + leanX, 18 + by, 10, 7, SHIRT_BASE);
      sc.rect(12 + leanX, 18 + by, 8, 5, SHIRT_HIGH);
      sc.rect(11 + leanX, 24 + by, 10, 3, SARUNG_BASE);
      sc.rect(12 + leanX, 24 + by, 8, 1, SARUNG_LIGHT);
      sc.rect(12 + leanX, 25 + by, 2, 4, SARUNG_DARK);

      // Head
      sc.rect(11 + leanX, 11 + by, 10, 7, SKIN_BASE);
      sc.rect(14 + leanX, 12 + by, 7, 5, SKIN_LIGHT);
      sc.rect(10 + leanX, 11 + by, 6, 7, HAIR_DARK);
      sc.rect(11 + leanX, 11 + by, 9, 2, HAIR_DARK);
      sc.rect(18 + leanX, 14 + by, 2, 2, '#1c141d');
      sc.px(19 + leanX, 14 + by, '#ffffff');

      // Action arm
      if (phase === 0) {
        // Raised behind/above shoulder
        sc.rect(9 + leanX, 13 + by, 3, 5, SHIRT_HIGH);
        sc.rect(9 + leanX, 10 + by, 3, 3, SKIN_BASE);
      } else {
        // Extended forward & down
        sc.rect(18 + leanX, 19 + by, 5, 3, SHIRT_HIGH);
        sc.rect(22 + leanX, 21 + by, 3, 3, SKIN_BASE);
      }

      drawCapingAt(sc, by, leanX);
      sc.outline(PAL.OUTLINE);
      c.blit(sc, 0, 0, flip);
      return c.withGroundShadow(16, 36, 7, 2, PAL.SHADOW);
    }
  }

  for (const dir of dirs) {
    renderHoeFrame(dir, 0).savePNG(`sprites/petani/hoe_${dir}_0.png`);
    renderHoeFrame(dir, 1).savePNG(`sprites/petani/hoe_${dir}_1.png`);
  }
}

// ============================================================================
// 3. INDONESIAN VILLAGE BUILDINGS (sprites/bangunan/)
//    Clean trapezoid roof outlines (zero rectangular bounding boxes!)
// ============================================================================
function createShingledRoof(w, h, hi, base, dark, ridgeColor) {
  const rc = new PixelCanvas(w, h);
  for (let dy = 1; dy < h - 1; dy++) {
    const inset = Math.max(1, Math.floor((h - 2 - dy) * 0.35) + 1);
    const rx0 = inset;
    const rx1 = w - inset;
    for (let px = rx0; px < rx1; px++) {
      if (dy <= 2) {
        rc.px(px, dy, ridgeColor);
      } else if (dy % 3 === 0) {
        rc.px(px, dy, (px + Math.floor(dy / 3) * 2) % 4 === 0 ? dark : base);
      } else {
        const tileCol = (px + Math.floor(dy / 3) * 2) % 4;
        if (tileCol === 0) rc.px(px, dy, dark);
        else if (tileCol === 1) rc.px(px, dy, hi);
        else rc.px(px, dy, base);
      }
    }
  }
  rc.outline(PAL.OUTLINE);
  return rc;
}

function generateBuildings() {
  // 3A. INDOMARET DESA (80x64 logical -> 320x256 px)
  {
    const c = new PixelCanvas(80, 64);

    // Traced sloped terracotta roof above modern Indomaret fascia
    const roof = createShingledRoof(74, 18, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(roof, 3, 1);

    // Modern Indomaret Facade Top Canopy (Red - Yellow - Blue iconic stripes)
    c.rectOutline(3, 16, 74, 15, PAL.OUTLINE, PAL.WHITE);
    c.rect(4, 17, 72, 4, PAL.INDO_RED);
    c.rect(4, 21, 72, 2, PAL.INDO_YELLOW);
    c.rect(4, 23, 72, 7, PAL.INDO_BLUE);
    // White fascia border & sign plate
    c.rect(12, 18, 56, 9, PAL.OUTLINE);
    c.rect(13, 19, 54, 7, PAL.WHITE);
    c.rect(13, 19, 54, 1, PAL.INDO_RED);
    c.rect(13, 25, 54, 1, PAL.INDO_BLUE);
    drawText(c, 'INDOMARET', 22, 20, PAL.INDO_BLUE_DARK);

    // Storefront Walls + Stone Plinth
    c.rectOutline(5, 30, 70, 29, PAL.OUTLINE, PAL.GRAY_WALL);
    c.rect(6, 31, 68, 2, '#bcc4d0');
    c.rect(6, 53, 68, 5, PAL.WALL_BASE_LIGHT);
    c.rect(6, 56, 68, 2, PAL.WALL_BASE_DARK);

    // Left Glass Window with Shelves
    c.rectOutline(9, 34, 22, 17, PAL.OUTLINE, PAL.GLASS_DARK);
    c.rect(10, 35, 20, 15, PAL.GLASS_MID);
    c.rect(11, 38, 18, 2, PAL.CREAM_HIGH);
    c.rect(12, 37, 3, 1, PAL.INDO_RED);
    c.rect(16, 37, 4, 1, PAL.INDO_YELLOW);
    c.rect(22, 37, 4, 1, PAL.GRASS_LIGHT);
    c.rect(11, 43, 18, 2, PAL.CREAM_HIGH);
    c.rect(12, 42, 4, 1, PAL.INDO_BLUE);
    c.rect(18, 42, 3, 1, PAL.TERR_HIGH);
    c.rect(23, 42, 4, 1, PAL.WHITE);
    c.px(11, 36, PAL.GLASS_HIGH); c.px(12, 36, PAL.GLASS_HIGH);
    c.px(11, 37, PAL.GLASS_HIGH);

    // Right Glass Window with Drink Chiller & Ice Cream Box
    c.rectOutline(49, 34, 22, 17, PAL.OUTLINE, PAL.GLASS_DARK);
    c.rect(50, 35, 20, 15, PAL.GLASS_MID);
    c.rect(51, 38, 18, 2, PAL.CREAM_HIGH);
    c.rect(52, 37, 3, 1, PAL.WATER_FOAM);
    c.rect(57, 37, 4, 1, PAL.INDO_YELLOW);
    c.rect(63, 37, 4, 1, PAL.INDO_RED);
    c.rect(51, 43, 18, 5, PAL.WHITE);
    c.rect(52, 44, 16, 1, PAL.INDO_RED);
    c.px(51, 36, PAL.GLASS_HIGH); c.px(52, 36, PAL.GLASS_HIGH);

    // Blue Sliding Doors + Doorstep
    c.rectOutline(33, 33, 14, 25, PAL.OUTLINE, PAL.INDO_BLUE);
    c.rect(35, 35, 4, 21, PAL.GLASS_MID);
    c.rect(41, 35, 4, 21, PAL.GLASS_MID);
    c.rect(39, 35, 2, 21, PAL.INDO_BLUE_DARK);
    c.px(36, 36, PAL.GLASS_HIGH); c.px(42, 36, PAL.GLASS_HIGH);
    c.rectOutline(31, 58, 18, 5, PAL.OUTLINE, PAL.STONE_LIGHT);
    c.rect(34, 59, 12, 3, PAL.INDO_RED_DARK);

    // Roadside Indomaret Pole Sign on Front Left
    c.rect(5, 45, 3, 17, PAL.OUTLINE);
    c.rect(6, 46, 1, 15, PAL.STONE_LIGHT);
    c.rectOutline(1, 36, 11, 10, PAL.OUTLINE, PAL.WHITE);
    c.rect(2, 37, 9, 3, PAL.INDO_RED);
    c.rect(2, 40, 9, 2, PAL.INDO_YELLOW);
    c.rect(2, 42, 9, 3, PAL.INDO_BLUE);

    c.savePNG('sprites/bangunan/indomaret.png');
  }

  // 3B. WARUNG DESA (72x64 logical -> 288x256 px)
  {
    const c = new PixelCanvas(72, 64);

    // Walls first (so traced sloped roof cleanly overhangs them)
    c.rectOutline(6, 22, 60, 34, PAL.OUTLINE, PAL.CREAM_BASE);
    for (let y = 41; y < 54; y++) {
      for (let x = 8; x < 64; x++) {
        c.px(x, y, ((x + y) % 2 === 0) ? PAL.BAMBOO_BASE : PAL.BAMBOO_DARK);
      }
    }
    c.rect(6, 22, 3, 34, PAL.WOOD_DARK);
    c.rect(63, 22, 3, 34, PAL.WOOD_DARK);
    c.rect(42, 22, 3, 34, PAL.WOOD_DARK);

    // Traced Sloped Terracotta Genteng Roof
    const roof = createShingledRoof(68, 24, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(roof, 2, 1);

    // "WARUNG" Signboard Hanging Under Roof
    c.rectOutline(13, 21, 30, 9, PAL.OUTLINE, PAL.GRASS_DARK);
    c.rect(14, 22, 28, 7, '#1b6e30');
    drawText(c, 'WARUNG', 16, 23, PAL.INDO_YELLOW);

    // Open Serving Counter + Awning + Kerupuk Jars + Bananas
    c.rectOutline(10, 31, 30, 14, PAL.OUTLINE, PAL.INTERIOR_DARK);
    for (let x = 9; x < 42; x++) {
      const col = (Math.floor(x / 3) % 2 === 0) ? PAL.GRASS_BASE : PAL.CREAM_HIGH;
      c.rect(x, 30, 1, 4, col);
      c.px(x, 34, PAL.OUTLINE);
    }
    c.rect(13, 35, 3, 4, PAL.INDO_YELLOW);
    c.px(14, 39, PAL.BAMBOO_DARK);
    c.rectOutline(9, 43, 32, 4, PAL.OUTLINE, PAL.WOOD_HIGH);
    c.rect(20, 39, 4, 4, PAL.WHITE); c.rect(20, 38, 4, 1, PAL.INDO_RED);
    c.rect(26, 39, 4, 4, PAL.WHITE); c.rect(26, 38, 4, 1, PAL.INDO_BLUE);
    c.rect(32, 39, 4, 4, PAL.WHITE); c.rect(32, 38, 4, 1, PAL.INDO_YELLOW);

    // Right Doorway
    c.rectOutline(47, 33, 12, 22, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(49, 35, 8, 18, PAL.WOOD_HIGH);
    c.rect(50, 37, 6, 6, PAL.WOOD_DARK);
    c.px(56, 45, PAL.INDO_YELLOW);

    // Front Wooden Bench
    c.rectOutline(12, 54, 26, 7, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(13, 55, 24, 2, PAL.WOOD_HIGH);
    c.rect(14, 59, 3, 4, PAL.WOOD_DARK);
    c.rect(33, 59, 3, 4, PAL.WOOD_DARK);

    c.savePNG('sprites/bangunan/warung.png');
  }

  // 3C. POS RONDA / GARDU SISKAMLING (56x60 logical -> 224x240 px)
  {
    const c = new PixelCanvas(56, 60);

    // Raised wooden deck & concrete piers
    c.rectOutline(8, 45, 40, 8, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(9, 46, 38, 3, PAL.WOOD_HIGH);
    c.rect(9, 49, 38, 3, PAL.WOOD_DARK);
    c.rectOutline(8, 52, 6, 6, PAL.OUTLINE, PAL.STONE_MID);
    c.rectOutline(42, 52, 6, 6, PAL.OUTLINE, PAL.STONE_MID);
    c.rectOutline(22, 51, 12, 7, PAL.OUTLINE, PAL.WOOD_HIGH);
    c.rect(23, 54, 10, 1, PAL.WOOD_DARK);

    // Back wall, schedule board, bamboo bench
    c.rectOutline(10, 23, 36, 22, PAL.OUTLINE, PAL.CREAM_SHAD);
    c.rect(11, 24, 34, 20, PAL.WOOD_DEEP);
    c.rectOutline(20, 29, 14, 8, PAL.OUTLINE, PAL.WHITE);
    c.rect(22, 31, 10, 1, PAL.INDO_RED);
    c.rect(22, 33, 8, 1, PAL.OUTLINE);
    c.rect(22, 35, 9, 1, PAL.OUTLINE);
    c.rect(12, 39, 32, 5, PAL.BAMBOO_BASE);
    c.rect(12, 39, 32, 1, PAL.BAMBOO_HIGH);

    // Pillars & bamboo railings
    c.rectOutline(8, 22, 4, 24, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rectOutline(44, 22, 4, 24, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rectOutline(12, 39, 10, 6, PAL.OUTLINE, PAL.BAMBOO_BASE);
    c.rectOutline(34, 39, 10, 6, PAL.OUTLINE, PAL.BAMBOO_BASE);

    // Hanging Kentongan + Lantern
    c.rectOutline(47, 29, 4, 10, PAL.OUTLINE, PAL.BAMBOO_HIGH);
    c.rect(48, 32, 2, 4, PAL.WOOD_DEEP);
    c.px(46, 30, PAL.WOOD_HIGH);
    c.rect(14, 24, 1, 3, PAL.OUTLINE);
    c.rectOutline(12, 27, 5, 6, PAL.OUTLINE, PAL.INDO_YELLOW);
    c.px(14, 29, PAL.WHITE);

    // Traced Sloped Terracotta Genteng Roof
    const roof = createShingledRoof(52, 23, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(roof, 2, 1);

    // Wooden Plaque: "POS RONDA"
    c.rectOutline(9, 19, 38, 8, PAL.OUTLINE, PAL.WOOD_DARK);
    drawText(c, 'POS RONDA', 11, 21, PAL.INDO_YELLOW);

    c.savePNG('sprites/bangunan/pos_ronda.png');
  }

  // 3D. SAUNG SAWAH (56x56 logical -> 224x224 px)
  {
    const c = new PixelCanvas(56, 56);
    c.rectOutline(8, 39, 40, 7, PAL.OUTLINE, PAL.BAMBOO_BASE);
    c.rect(9, 40, 38, 2, PAL.BAMBOO_HIGH);
    for (let x = 11; x < 46; x += 4) c.rect(x, 40, 1, 5, PAL.BAMBOO_DARK);
    c.rectOutline(9, 46, 4, 7, PAL.OUTLINE, PAL.BAMBOO_DARK);
    c.rectOutline(43, 46, 4, 7, PAL.OUTLINE, PAL.BAMBOO_DARK);
    c.rectOutline(10, 21, 36, 18, PAL.OUTLINE, PAL.WOOD_DEEP);
    c.rectOutline(10, 20, 3, 21, PAL.OUTLINE, PAL.BAMBOO_HIGH);
    c.rectOutline(43, 20, 3, 21, PAL.OUTLINE, PAL.BAMBOO_HIGH);
    c.rectOutline(13, 33, 30, 5, PAL.OUTLINE, PAL.BAMBOO_BASE);

    const roof = createShingledRoof(52, 22, PAL.STRAW_HIGH, PAL.STRAW_BASE, PAL.STRAW_DARK, PAL.WOOD_DARK);
    c.blit(roof, 2, 1);
    for (let x = 4; x < 52; x += 2) c.px(x, 22, PAL.STRAW_DARK);
    c.savePNG('sprites/bangunan/saung_sawah.png');
  }

  // 3E. RUMAH WARGA DESA (72x68 logical -> 288x272 px)
  // Matching reference image's cozy timber-framed village house!
  {
    const c = new PixelCanvas(72, 68);

    // Cream Stucco Walls with Timber Framing
    c.rectOutline(7, 29, 58, 34, PAL.OUTLINE, PAL.CREAM_BASE);
    c.rect(8, 30, 56, 3, PAL.CREAM_SHAD);
    c.rect(7, 29, 3, 34, PAL.WOOD_DARK);
    c.rect(62, 29, 3, 34, PAL.WOOD_DARK);
    c.rect(34, 29, 3, 13, PAL.WOOD_DARK);
    c.rect(8, 57, 56, 5, PAL.WALL_BASE_LIGHT);
    c.rect(8, 60, 56, 2, PAL.WALL_BASE_DARK);

    // Red wooden front door + doorstep
    c.rectOutline(16, 40, 14, 22, PAL.OUTLINE, PAL.WOOD_DARK);
    c.rect(18, 42, 10, 19, PAL.INDO_RED);
    c.rect(19, 43, 8, 17, PAL.INDO_RED_DARK);
    c.rect(20, 44, 6, 15, PAL.INDO_RED);
    c.px(26, 51, PAL.STONE_LIGHT);
    c.rectOutline(14, 62, 18, 4, PAL.OUTLINE, PAL.STONE_LIGHT);

    // Gridded Windows
    for (const wx of [38, 50]) {
      c.rectOutline(wx, 38, 10, 12, PAL.OUTLINE, PAL.WOOD_DARK);
      c.rect(wx + 1, 39, 8, 10, PAL.GLASS_DARK);
      c.rect(wx + 2, 40, 2, 3, PAL.GLASS_MID);
      c.rect(wx + 6, 40, 2, 3, PAL.GLASS_MID);
      c.rect(wx + 2, 45, 2, 3, PAL.GLASS_MID);
      c.rect(wx + 6, 45, 2, 3, PAL.GLASS_MID);
    }

    // Traced Sloped Terracotta Roof + Brick Chimney
    const roof = createShingledRoof(68, 28, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(roof, 2, 3);
    c.rectOutline(52, 1, 7, 10, PAL.OUTLINE, PAL.STONE_MID);
    c.rect(53, 2, 5, 2, PAL.STONE_LIGHT);

    c.savePNG('sprites/bangunan/rumah_desa.png');
  }

  // 3F. ALFAMART DESA (80x64 logical -> 320x256 px)
  {
    const c = new PixelCanvas(80, 64);

    // Traced Slate-Blue Shingled Roof behind modern Alfamart fascia
    const roof = createShingledRoof(74, 18, PAL.SLATE_HIGH, PAL.SLATE_BASE, PAL.SLATE_DARK, PAL.SLATE_DARK);
    c.blit(roof, 3, 1);

    // Iconic Alfamart Canopy: Bold Red top, Yellow accent band, Blue bottom stripe
    c.rectOutline(3, 16, 74, 15, PAL.OUTLINE, PAL.INDO_RED);
    c.rect(4, 17, 72, 9, PAL.INDO_RED);
    c.rect(4, 26, 72, 2, PAL.INDO_YELLOW);
    c.rect(4, 28, 72, 2, PAL.INDO_BLUE);
    // Crisp White Signboard Plaque with Red/Blue "ALFAMART" text
    c.rect(14, 18, 52, 9, PAL.OUTLINE);
    c.rect(15, 19, 50, 7, PAL.WHITE);
    c.rect(15, 25, 50, 1, PAL.INDO_YELLOW);
    // "ALFAMART" = 8 chars * 4 = 32px -> centered at x = 24
    drawText(c, 'ALFAMART', 24, 20, PAL.INDO_RED);

    // Clean Cream/White Tiled Storefront Wall + Stone Plinth
    c.rectOutline(5, 30, 70, 29, PAL.OUTLINE, PAL.WHITE);
    c.rect(6, 31, 68, 2, '#d2d8e2');
    c.rect(6, 53, 68, 5, PAL.WALL_BASE_LIGHT);
    c.rect(6, 56, 68, 2, PAL.WALL_BASE_DARK);

    // Left Storefront Glass Window (Snacks & Red/Yellow Shelf Displays)
    c.rectOutline(9, 34, 22, 17, PAL.OUTLINE, PAL.GLASS_DARK);
    c.rect(10, 35, 20, 15, PAL.GLASS_MID);
    c.rect(11, 38, 18, 2, PAL.CREAM_HIGH);
    c.rect(12, 37, 4, 1, PAL.INDO_YELLOW);
    c.rect(17, 37, 4, 1, PAL.INDO_RED);
    c.rect(23, 37, 4, 1, PAL.INDO_BLUE);
    c.rect(11, 44, 18, 2, PAL.CREAM_HIGH);
    c.rect(12, 43, 3, 1, PAL.GRASS_LIGHT);
    c.rect(17, 43, 5, 1, PAL.INDO_RED);
    c.rect(23, 43, 4, 1, PAL.WHITE);
    c.px(11, 36, PAL.GLASS_HIGH); c.px(12, 36, PAL.GLASS_HIGH);

    // Right Storefront Glass Window (Drink Fridge + Promo Poster)
    c.rectOutline(49, 34, 22, 17, PAL.OUTLINE, PAL.GLASS_DARK);
    c.rect(50, 35, 20, 15, PAL.GLASS_MID);
    c.rect(51, 37, 9, 11, PAL.WHITE); // beverage chiller
    c.rect(52, 38, 7, 2, PAL.WATER_LIGHT);
    c.rect(52, 41, 7, 2, PAL.INDO_RED);
    c.rect(52, 44, 7, 2, PAL.GRASS_LIGHT);
    c.rect(62, 38, 7, 9, PAL.INDO_YELLOW); // red-yellow promo poster
    c.rect(63, 39, 5, 3, PAL.INDO_RED);
    c.px(51, 36, PAL.GLASS_HIGH); c.px(52, 36, PAL.GLASS_HIGH);

    // Center Red-Framed Automatic Sliding Glass Doors + Blue Welcome Mat
    c.rectOutline(33, 33, 14, 25, PAL.OUTLINE, PAL.INDO_RED);
    c.rect(35, 35, 4, 21, PAL.GLASS_MID);
    c.rect(41, 35, 4, 21, PAL.GLASS_MID);
    c.rect(39, 35, 2, 21, PAL.INDO_RED_DARK);
    c.px(36, 36, PAL.GLASS_HIGH); c.px(42, 36, PAL.GLASS_HIGH);
    c.rectOutline(31, 58, 18, 5, PAL.OUTLINE, PAL.STONE_LIGHT);
    c.rect(34, 59, 12, 3, PAL.INDO_BLUE);

    // Roadside Alfamart Pole Sign on Front Right
    c.rect(72, 45, 3, 17, PAL.OUTLINE);
    c.rect(73, 46, 1, 15, PAL.STONE_LIGHT);
    c.rectOutline(68, 36, 11, 10, PAL.OUTLINE, PAL.INDO_RED);
    c.rect(69, 37, 9, 5, PAL.INDO_RED);
    c.rect(69, 42, 9, 1, PAL.INDO_YELLOW);
    c.rect(69, 43, 9, 2, PAL.INDO_BLUE);

    c.savePNG('sprites/bangunan/alfamart.png');
  }

  // 3G. WARUNG KOPI / WARKOP (72x64 logical -> 288x256 px)
  {
    const c = new PixelCanvas(72, 64);

    // Dark Wooden Plank Walls
    c.rectOutline(6, 22, 60, 34, PAL.OUTLINE, PAL.WOOD_BASE);
    for (let y = 26; y < 55; y += 4) c.rect(8, y, 56, 1, PAL.WOOD_DARK);
    c.rect(6, 22, 3, 34, PAL.WOOD_DEEP);
    c.rect(63, 22, 3, 34, PAL.WOOD_DEEP);
    c.rect(46, 22, 3, 34, PAL.WOOD_DEEP);

    // Slate-Gray Shingled Roof
    const roof = createShingledRoof(68, 24, PAL.SLATE_HIGH, PAL.SLATE_BASE, PAL.SLATE_DARK, PAL.SLATE_DARK);
    c.blit(roof, 2, 1);

    // "WARKOP" Signboard (Warm Blue & Yellow)
    c.rectOutline(12, 20, 32, 9, PAL.OUTLINE, PAL.INDO_BLUE_DARK);
    c.rect(13, 21, 30, 7, PAL.INDO_BLUE);
    drawText(c, 'WARKOP', 16, 22, PAL.INDO_YELLOW);

    // Open Coffee Counter with Blue-White Striped Tarpaulin Awning & Hanging Coffee Sachets (Rentengan!)
    c.rectOutline(10, 31, 34, 14, PAL.OUTLINE, PAL.INTERIOR_DARK);
    for (let x = 9; x < 45; x++) {
      const col = (Math.floor(x / 3) % 2 === 0) ? '#2f78d6' : PAL.WHITE;
      c.rect(x, 30, 1, 4, col);
      c.px(x, 34, PAL.OUTLINE);
    }
    // Colorful Hanging Coffee & Drink Sachets (Rentengan Kopi!)
    const sachetColors = [PAL.INDO_RED, PAL.INDO_YELLOW, PAL.WOOD_HIGH, PAL.GRASS_LIGHT, PAL.INDO_RED, PAL.WHITE];
    for (let i = 0; i < 6; i++) {
      const sx = 12 + i * 5;
      c.rect(sx, 35, 3, 4, sachetColors[i]);
      c.px(sx + 1, 36, PAL.WHITE);
    }
    // Countertop + Steaming Silver Thermos & Coffee Mugs
    c.rectOutline(9, 43, 36, 4, PAL.OUTLINE, PAL.WOOD_HIGH);
    c.rect(14, 39, 4, 4, PAL.STONE_LIGHT); c.rect(14, 38, 4, 1, PAL.INDO_RED); // termos air panas
    c.px(15, 36, PAL.WHITE); c.px(16, 35, PAL.WHITE); // uap panas
    c.rect(24, 41, 3, 2, PAL.WHITE); // gelas kopi 1
    c.rect(31, 41, 3, 2, PAL.INDO_YELLOW); // gelas kopi 2
    c.rect(37, 40, 4, 3, PAL.CREAM_HIGH); // toples gorengan

    // Right Entrance Door
    c.rectOutline(50, 33, 11, 22, PAL.OUTLINE, PAL.WOOD_DARK);
    c.rect(52, 35, 7, 18, PAL.BAMBOO_BASE);
    c.px(57, 44, PAL.OUTLINE);

    // Two Cozy Blue/Wood Stools & Long Warkop Bench Out Front
    c.rectOutline(11, 54, 30, 7, PAL.OUTLINE, PAL.WOOD_HIGH);
    c.rect(12, 55, 28, 2, PAL.BAMBOO_HIGH);
    c.rect(13, 59, 3, 4, PAL.WOOD_DARK);
    c.rect(36, 59, 3, 4, PAL.WOOD_DARK);

    c.savePNG('sprites/bangunan/warung_kopi.png');
  }

  // 3H. WARUNG BAKSO / MIE AYAM (76x64 logical -> 304x256 px)
  {
    const c = new PixelCanvas(76, 64);

    // Warm Cream Plaster Walls with Red Trim
    c.rectOutline(6, 22, 64, 34, PAL.OUTLINE, PAL.CREAM_HIGH);
    c.rect(7, 48, 62, 7, PAL.TERR_MID);
    c.rect(6, 22, 3, 34, PAL.WOOD_DARK);
    c.rect(67, 22, 3, 34, PAL.WOOD_DARK);

    // Traced Terracotta Genteng Roof
    const roof = createShingledRoof(72, 23, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(roof, 2, 1);

    // Classic Bright Yellow & Red Indonesian Warung Banner "BAKSO"
    c.rectOutline(15, 19, 34, 10, PAL.OUTLINE, PAL.INDO_YELLOW);
    c.rect(16, 20, 32, 8, PAL.INDO_YELLOW);
    drawText(c, 'BAKSO', 22, 22, PAL.INDO_RED);

    // Striped Red-Yellow Awning
    for (let x = 9; x < 67; x++) {
      const col = (Math.floor(x / 4) % 2 === 0) ? PAL.INDO_RED : PAL.INDO_YELLOW;
      c.rect(x, 29, 1, 4, col);
      c.px(x, 33, PAL.OUTLINE);
    }

    // Iconic Glass Gerobak Bakso (Meatball Cart) on Front Left!
    c.rectOutline(10, 35, 28, 22, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(11, 36, 26, 2, PAL.WOOD_HIGH);
    // Glass display case showing bowls, meatballs, noodles
    c.rectOutline(12, 38, 15, 10, PAL.OUTLINE, PAL.GLASS_HIGH);
    c.rect(13, 39, 13, 8, PAL.GLASS_MID);
    c.rect(14, 44, 5, 2, PAL.WHITE); // mangkok ayam jago
    c.rect(20, 44, 4, 2, PAL.INDO_YELLOW); // mie kuning
    c.px(15, 42, PAL.INDO_RED); c.px(17, 42, PAL.GRASS_LIGHT); // saus & kecap
    // Stainless steel soup pot + rising steam!
    c.rectOutline(28, 41, 8, 7, PAL.OUTLINE, PAL.STONE_LIGHT);
    c.rect(29, 42, 6, 2, PAL.WHITE);
    c.px(31, 38, PAL.WHITE); c.px(33, 36, PAL.WHITE); c.px(30, 35, PAL.WHITE);
    // Gerobak lower blue-painted wooden panel
    c.rect(12, 49, 24, 6, PAL.INDO_BLUE);
    c.rect(13, 50, 22, 2, '#3a82e0');

    // Open Dining Entrance on Right + Table & Bowls
    c.rectOutline(42, 34, 22, 21, PAL.OUTLINE, PAL.INTERIOR_DARK);
    c.rectOutline(44, 45, 18, 6, PAL.OUTLINE, PAL.WOOD_HIGH);
    c.rect(47, 43, 4, 2, PAL.WHITE);
    c.rect(55, 43, 4, 2, PAL.WHITE);
    // Dining bench in front
    c.rectOutline(43, 54, 20, 7, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(44, 55, 18, 2, PAL.WOOD_HIGH);
    c.rect(45, 59, 3, 4, PAL.WOOD_DARK);
    c.rect(58, 59, 3, 4, PAL.WOOD_DARK);

    c.savePNG('sprites/bangunan/warung_bakso.png');
  }

  // 3I. RUMAH ATAP BIRU (72x68 logical -> 288x272 px)
  // Matches the bright blue shingled roof house from the reference image!
  {
    const c = new PixelCanvas(72, 68);

    // Cream/Ivory Walls with Timber Corner Trim & Stone Base
    c.rectOutline(7, 29, 58, 34, PAL.OUTLINE, PAL.CREAM_HIGH);
    c.rect(8, 30, 56, 3, PAL.CREAM_SHAD);
    c.rect(7, 29, 3, 34, PAL.WOOD_BASE);
    c.rect(62, 29, 3, 34, PAL.WOOD_BASE);
    c.rect(8, 57, 56, 5, PAL.WALL_BASE_LIGHT);
    c.rect(8, 60, 56, 2, PAL.WALL_BASE_DARK);

    // Centered Carved Teakwood Door + Porch Step
    c.rectOutline(29, 40, 14, 22, PAL.OUTLINE, PAL.WOOD_DEEP);
    c.rect(31, 42, 10, 19, PAL.WOOD_BASE);
    c.rect(32, 43, 8, 7, PAL.WOOD_HIGH);
    c.rect(32, 52, 8, 7, PAL.WOOD_DARK);
    c.px(39, 51, PAL.INDO_YELLOW);
    c.rectOutline(27, 62, 18, 4, PAL.OUTLINE, PAL.STONE_LIGHT);

    // Symmetrical Windows with Flower Planter Boxes
    for (const wx of [13, 49]) {
      c.rectOutline(wx, 38, 11, 11, PAL.OUTLINE, PAL.WOOD_DARK);
      c.rect(wx + 1, 39, 9, 9, PAL.GLASS_DARK);
      c.rect(wx + 2, 40, 3, 3, PAL.GLASS_MID);
      c.rect(wx + 6, 40, 3, 3, PAL.GLASS_MID);
      c.rect(wx + 2, 44, 3, 3, PAL.GLASS_MID);
      c.rect(wx + 6, 44, 3, 3, PAL.GLASS_MID);
      // Flower box under window
      c.rectOutline(wx - 1, 49, 13, 4, PAL.OUTLINE, PAL.TERR_MID);
      c.px(wx + 1, 48, PAL.GRASS_LIGHT); c.px(wx + 3, 48, PAL.INDO_RED);
      c.px(wx + 6, 48, PAL.GRASS_BASE); c.px(wx + 8, 48, PAL.INDO_YELLOW);
    }

    // Vibrant Blue Shingled Roof (matching reference left house!)
    const roof = createShingledRoof(68, 28, '#669ef2', '#356fd4', '#1d4596', '#2452ad');
    c.blit(roof, 2, 3);

    c.savePNG('sprites/bangunan/rumah_biru.png');
  }

  // 3J. RUMAH JOGLO JAWA (80x68 logical -> 320x272 px)
  // Authentic Javanese two-tier Joglo roof + teakwood pendopo veranda!
  {
    const c = new PixelCanvas(80, 68);

    // Raised Pendopo Stone Floor + Warm Teakwood Walls
    c.rectOutline(6, 33, 68, 28, PAL.OUTLINE, PAL.CREAM_BASE);
    c.rect(7, 34, 66, 3, PAL.CREAM_SHAD);
    c.rect(7, 55, 66, 5, PAL.STONE_MID);
    c.rect(7, 58, 66, 2, PAL.STONE_DARK);
    // 4 Carved Teakwood Joglo Pillars (Soko Guru veranda)
    for (const px of [8, 25, 52, 69]) {
      c.rectOutline(px, 32, 4, 29, PAL.OUTLINE, PAL.WOOD_BASE);
      c.rect(px + 1, 33, 1, 27, PAL.WOOD_HIGH);
    }

    // Grand Double Carved Javanese Front Door (Gebyok)
    c.rectOutline(32, 39, 16, 21, PAL.OUTLINE, PAL.WOOD_DEEP);
    c.rect(34, 41, 5, 18, PAL.WOOD_BASE);
    c.rect(41, 41, 5, 18, PAL.WOOD_BASE);
    c.rect(35, 42, 3, 7, PAL.WOOD_HIGH);
    c.rect(42, 42, 3, 7, PAL.WOOD_HIGH);
    c.px(38, 50, PAL.INDO_YELLOW);
    c.px(41, 50, PAL.INDO_YELLOW);
    // Broad stone entrance steps
    c.rectOutline(28, 60, 24, 5, PAL.OUTLINE, PAL.STONE_LIGHT);
    c.rect(29, 62, 22, 1, PAL.STONE_DARK);

    // Traditional Wooden Lattice Windows (Kisi-Kisi)
    for (const wx of [14, 58]) {
      c.rectOutline(wx, 40, 9, 11, PAL.OUTLINE, PAL.WOOD_DEEP);
      c.rect(wx + 1, 41, 7, 9, PAL.INTERIOR_DARK);
      c.rect(wx + 3, 41, 1, 9, PAL.WOOD_BASE);
      c.rect(wx + 5, 41, 1, 9, PAL.WOOD_BASE);
      c.rect(wx + 1, 45, 7, 1, PAL.WOOD_BASE);
    }

    // Two-Tier Iconic Joglo Roof (Lower Wide Eaves + Steep Upper Crown!)
    const lowerRoof = createShingledRoof(76, 17, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.TERR_MID);
    c.blit(lowerRoof, 2, 18);
    const upperCrown = createShingledRoof(42, 18, PAL.TERR_HIGH, PAL.TERR_BASE, PAL.TERR_DARK, PAL.WOOD_HIGH);
    c.blit(upperCrown, 19, 2);
    // Decorative Javanese Roof Finial (Mahkota Genteng)
    c.rect(38, 0, 4, 3, PAL.OUTLINE);
    c.rect(39, 1, 2, 2, PAL.BAMBOO_HIGH);

    c.savePNG('sprites/bangunan/rumah_joglo.png');
  }

  // 3K. RUMAH HIJAU KAMPUNG (72x68 logical -> 288x272 px)
  // Iconic Indonesian village pastel-green painted wall + slate gray roof!
  {
    const c = new PixelCanvas(72, 68);

    // Mint/Sage Green Indonesian Village Plaster Wall + White Trim
    c.rectOutline(7, 29, 58, 34, PAL.OUTLINE, '#9ad49c');
    c.rect(8, 30, 56, 3, '#7bb87e');
    c.rect(8, 56, 56, 6, PAL.WALL_BASE_LIGHT);
    c.rect(8, 59, 56, 3, PAL.WALL_BASE_DARK);
    // Crisp white concrete corner pilasters
    c.rect(8, 30, 3, 27, PAL.WHITE);
    c.rect(61, 30, 3, 27, PAL.WHITE);

    // Classic Wooden Door on Right with White Frame & Ventilation Louver (Boven)
    c.rectOutline(44, 37, 14, 25, PAL.OUTLINE, PAL.WHITE);
    c.rect(46, 39, 10, 2, PAL.INTERIOR_DARK); // ventilasi pintu
    c.rect(46, 42, 10, 19, PAL.WOOD_BASE);
    c.rect(47, 43, 8, 8, PAL.WOOD_HIGH);
    c.rect(47, 52, 8, 8, PAL.WOOD_DARK);
    c.px(48, 51, PAL.INDO_YELLOW);
    c.rectOutline(42, 62, 18, 4, PAL.OUTLINE, PAL.STONE_LIGHT);

    // Wide Indonesian Double Window on Left with White Trim
    c.rectOutline(14, 38, 22, 13, PAL.OUTLINE, PAL.WHITE);
    c.rect(16, 40, 8, 9, PAL.GLASS_DARK);
    c.rect(26, 40, 8, 9, PAL.GLASS_DARK);
    c.rect(17, 41, 6, 3, PAL.GLASS_MID);
    c.rect(27, 41, 6, 3, PAL.GLASS_MID);
    c.rect(17, 45, 6, 3, PAL.GLASS_MID);
    c.rect(27, 45, 6, 3, PAL.GLASS_MID);
    c.px(17, 41, PAL.GLASS_HIGH); c.px(27, 41, PAL.GLASS_HIGH);

    // Potted Plant on Front Left Porch
    c.rectOutline(14, 56, 6, 6, PAL.OUTLINE, PAL.TERR_BASE);
    c.ellipse(17, 54, 4, 3, PAL.GRASS_BASE);
    c.px(16, 53, PAL.GRASS_HIGH);

    // Slate-Gray Shingled Roof (matching center house of reference image!)
    const roof = createShingledRoof(68, 28, PAL.SLATE_HIGH, PAL.SLATE_BASE, PAL.SLATE_DARK, PAL.SLATE_HIGH);
    c.blit(roof, 2, 3);

    c.savePNG('sprites/bangunan/rumah_hijau.png');
  }
}

// ============================================================================
// 4. VILLAGE PROPS (sprites/properti/) - With Borderless Shadows!
// ============================================================================
function generateProps() {
  // 4A. Wooden Street Lamp Post (sprites/properti/lampu_jalan.png) - 96x176 px
  {
    const c = new PixelCanvas(24, 44);
    c.rectOutline(9, 36, 6, 5, PAL.OUTLINE, PAL.STONE_MID);
    c.rectOutline(10, 6, 4, 31, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(11, 7, 1, 29, PAL.WOOD_HIGH);
    c.rectOutline(4, 8, 16, 4, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(5, 9, 14, 1, PAL.WOOD_HIGH);
    c.rect(17, 12, 1, 2, PAL.OUTLINE);
    c.rectOutline(15, 14, 5, 7, PAL.OUTLINE, PAL.SLATE_DARK);
    c.rect(16, 15, 3, 5, PAL.INDO_YELLOW);
    c.px(17, 17, PAL.WHITE);
    c.withGroundShadow(12, 41, 5, 2, PAL.SHADOW).savePNG('sprites/properti/lampu_jalan.png');
  }

  // 4B. Wooden Bench (sprites/properti/bangku_kayu.png) - 144x96 px
  {
    const c = new PixelCanvas(36, 24);
    c.rectOutline(4, 14, 4, 7, PAL.OUTLINE, PAL.WOOD_DARK);
    c.rectOutline(28, 14, 4, 7, PAL.OUTLINE, PAL.WOOD_DARK);
    c.rectOutline(3, 3, 30, 8, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(4, 4, 28, 2, PAL.WOOD_HIGH);
    c.rect(4, 7, 28, 1, PAL.WOOD_DARK);
    c.rect(4, 8, 28, 2, PAL.WOOD_HIGH);
    c.rectOutline(2, 11, 32, 6, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(3, 12, 30, 2, PAL.WOOD_HIGH);
    c.rect(3, 15, 30, 1, PAL.WOOD_DARK);
    c.withGroundShadow(18, 21, 16, 2, PAL.SHADOW).savePNG('sprites/properti/bangku_kayu.png');
  }

  // 4C. Wooden Village Fences (pagar_h.png & pagar_v.png)
  {
    const ch = new PixelCanvas(32, 20);
    ch.rectOutline(0, 6, 32, 4, PAL.OUTLINE, PAL.WOOD_BASE);
    ch.rect(0, 7, 32, 1, PAL.WOOD_HIGH);
    ch.rectOutline(0, 12, 32, 4, PAL.OUTLINE, PAL.WOOD_BASE);
    ch.rect(0, 13, 32, 1, PAL.WOOD_HIGH);
    for (const px of [4, 22]) {
      ch.rectOutline(px, 2, 6, 16, PAL.OUTLINE, PAL.WOOD_BASE);
      ch.rect(px + 1, 3, 4, 2, PAL.WOOD_HIGH);
      ch.rect(px + 1, 5, 1, 11, PAL.WOOD_HIGH);
    }
    ch.savePNG('sprites/properti/pagar_h.png');

    const cv = new PixelCanvas(12, 32);
    cv.rectOutline(4, 0, 4, 32, PAL.OUTLINE, PAL.WOOD_BASE);
    cv.rect(5, 0, 1, 32, PAL.WOOD_HIGH);
    for (const py of [2, 18]) {
      cv.rectOutline(3, py, 6, 10, PAL.OUTLINE, PAL.WOOD_BASE);
      cv.rect(4, py + 1, 4, 2, PAL.WOOD_HIGH);
    }
    cv.savePNG('sprites/properti/pagar_v.png');
  }

  // 4D. Lush Village Canopy Tree (sprites/properti/pohon_rindang.png) - 192x224 px
  {
    const c = new PixelCanvas(48, 56);
    c.rect(19, 32, 10, 19, PAL.WOOD_BASE);
    c.rect(20, 33, 3, 17, PAL.WOOD_HIGH);
    c.rect(26, 33, 2, 17, PAL.WOOD_DARK);
    c.rect(16, 48, 16, 4, PAL.WOOD_DARK);

    // Layered foliage spheres matching bottom-right reference trees
    const lobes = [
      [24, 23, 18, 15],
      [13, 27, 11, 10],
      [35, 27, 11, 10],
      [24, 14, 14, 11],
    ];
    for (const [lx, ly, rx, ry] of lobes) c.ellipse(lx, ly, rx, ry, PAL.GRASS_DEEP);
    for (const [lx, ly, rx, ry] of lobes) c.ellipse(lx, ly - 1, rx - 1, ry - 1, PAL.GRASS_DARK);
    for (const [lx, ly, rx, ry] of lobes) c.ellipse(lx - 1, ly - 3, rx - 3, ry - 3, PAL.GRASS_BASE);
    // Distinct sub-crown leaf puff highlights
    c.ellipse(15, 22, 6, 4, PAL.GRASS_LIGHT);
    c.ellipse(32, 23, 5, 4, PAL.GRASS_LIGHT);
    c.ellipse(22, 11, 8, 5, PAL.GRASS_LIGHT);
    c.ellipse(20, 9, 4, 3, PAL.GRASS_HIGH);
    c.outline(PAL.OUTLINE);
    c.withGroundShadow(24, 51, 14, 4, PAL.SHADOW).savePNG('sprites/properti/pohon_rindang.png');
  }

  // 4E. Indonesian Coconut Palm Tree (sprites/properti/pohon_kelapa.png) - 176x240 px
  {
    const c = new PixelCanvas(44, 60);
    for (let y = 20; y < 56; y++) {
      const cx = Math.round(21 + Math.sin((y - 20) * 0.08) * 2.5);
      const col = (y % 4 === 0) ? PAL.WOOD_DARK : PAL.WOOD_BASE;
      c.rect(cx - 2, y, 4, 1, col);
      c.px(cx - 1, y, PAL.WOOD_HIGH);
    }
    c.ellipse(20, 21, 2.5, 2.5, PAL.WOOD_DEEP);
    c.ellipse(24, 21, 2.5, 2.5, PAL.WOOD_DARK);
    c.ellipse(22, 23, 2.5, 2.5, PAL.WOOD_BASE);
    const fronds = [
      [-1, -0.35], [1, -0.35],
      [-1, 0.15], [1, 0.15],
      [-0.6, -0.75], [0.6, -0.75],
    ];
    for (const [dx, dy] of fronds) {
      for (let t = 1; t <= 16; t++) {
        const fx = Math.round(22 + dx * t);
        const fy = Math.round(18 + dy * t + (t * t) * 0.03);
        const w = t < 12 ? 2 : 1;
        c.rect(fx - w, fy, w * 2, 2, t < 8 ? PAL.GRASS_LIGHT : PAL.GRASS_BASE);
        if (t % 2 === 0) c.px(fx, fy + 2, PAL.GRASS_DARK);
      }
    }
    c.ellipse(22, 17, 4, 3, PAL.GRASS_HIGH);
    c.outline(PAL.OUTLINE);
    c.withGroundShadow(22, 56, 9, 3, PAL.SHADOW).savePNG('sprites/properti/pohon_kelapa.png');
  }

  // 4F. Clay Pots Pair (sprites/properti/gentong_tanah.png) - 80x80 px
  {
    const c = new PixelCanvas(20, 20);
    c.ellipse(6, 13, 4.5, 4.5, PAL.TERR_BASE);
    c.ellipse(5, 12, 2, 2, PAL.TERR_HIGH);
    c.rect(4, 7, 5, 2, PAL.TERR_DARK);
    c.rect(5, 7, 3, 1, PAL.OUTLINE);
    c.ellipse(14, 15, 4, 4, '#6a74b8');
    c.ellipse(13, 14, 2, 2, '#99a3e0');
    c.rect(12, 10, 4, 2, '#4d5594');
    c.outline(PAL.OUTLINE);
    c.savePNG('sprites/properti/gentong_tanah.png');
  }

  // 4G. Flowering Bush Cluster (sprites/properti/semak_bunga.png) - 96x80 px
  {
    const c = new PixelCanvas(24, 20);
    c.ellipse(12, 13, 9, 6, PAL.GRASS_DEEP);
    c.ellipse(8, 12, 6, 5, PAL.GRASS_DARK);
    c.ellipse(16, 12, 6, 5, PAL.GRASS_DARK);
    c.ellipse(12, 10, 7, 5, PAL.GRASS_BASE);
    c.ellipse(10, 8, 4, 3, PAL.GRASS_LIGHT);
    for (const [fx, fy, col] of [[7, 11, PAL.WHITE], [14, 9, '#5cd6ff'], [16, 13, PAL.INDO_YELLOW]]) {
      c.px(fx, fy, col);
      c.px(fx + 1, fy, col);
    }
    c.outline(PAL.OUTLINE);
    c.savePNG('sprites/properti/semak_bunga.png');
  }

  // 4H. Wooden Farm Signpost "LADANG" (sprites/properti/papan_ladang.png) - 28x22 logical -> 112x88 px
  {
    const c = new PixelCanvas(28, 22);
    // Wooden stake
    c.rectOutline(12, 11, 4, 9, PAL.OUTLINE, PAL.WOOD_DARK);
    c.rect(13, 12, 1, 7, PAL.WOOD_BASE);
    // Sign board
    c.rectOutline(1, 2, 26, 10, PAL.OUTLINE, PAL.WOOD_BASE);
    c.rect(2, 3, 24, 2, PAL.WOOD_HIGH);
    c.rect(2, 9, 24, 2, PAL.WOOD_DARK);
    drawText(c, 'LADANG', 2, 4, PAL.CREAM_HIGH);
    c.withGroundShadow(14, 19, 6, 2, PAL.SHADOW).savePNG('sprites/properti/papan_ladang.png');
  }
}

// ============================================================================
// 5. PIXEL ART FX SPRITES (sprites/efek/)
// ============================================================================
function generateEffects() {
  // 5A. Pixel Dirt Clod (sprites/efek/gumpalan_tanah.png) - 6x6 logical -> 24x24 px
  {
    const c = new PixelCanvas(6, 6);
    c.rect(1, 1, 4, 4, PAL.SOIL_LIGHT);
    c.px(2, 1, PAL.SOIL_TOP);
    c.px(1, 2, PAL.SOIL_TOP);
    c.px(4, 3, PAL.SOIL_DARK);
    c.px(3, 4, PAL.SOIL_DARK);
    c.outline(PAL.OUTLINE);
    c.savePNG('sprites/efek/gumpalan_tanah.png');
  }

  // 5B. Dynamic Hoe Swing Arc Trail (sprites/efek/tebasan_cangkul.png) - 20x20 logical -> 80x80 px
  {
    const c = new PixelCanvas(20, 20);
    // Crisp white/cream crescent whoosh arc (top-left sweeping to bottom-right)
    const pts = [
      [3, 2, 1], [5, 2, 1], [7, 3, 2], [9, 4, 2], [11, 6, 2],
      [13, 8, 3], [14, 10, 3], [15, 13, 2], [15, 16, 2], [14, 18, 1],
    ];
    for (const [px, py, thick] of pts) {
      for (let t = 0; t < thick; t++) {
        c.px(px - t, py, t === 0 ? '#ffffff' : '#fff0b8c8');
        c.px(px - t, py + 1, t === 0 ? '#fff5cf' : '#ffd87590');
      }
    }
    c.savePNG('sprites/efek/tebasan_cangkul.png');
  }

  // 5C. Ground Impact Dust Ring (sprites/efek/efek_dampak.png) - 18x10 logical -> 72x40 px
  {
    const c = new PixelCanvas(18, 10);
    // Expanding horizontal oval puff
    const ring = [
      [3, 4], [4, 3], [5, 3], [12, 3], [13, 3], [14, 4],
      [2, 5], [15, 5],
      [3, 6], [4, 7], [6, 7], [11, 7], [13, 7], [14, 6],
    ];
    for (const [rx, ry] of ring) {
      c.px(rx, ry, '#f5e4c3');
      c.px(rx, ry + 1, '#c7a478');
    }
    // Small inner earth sparks
    c.px(6, 2, PAL.SOIL_TOP);
    c.px(11, 2, PAL.SOIL_TOP);
    c.px(8, 1, '#ffffff');
    c.px(9, 1, '#ffffff');
    c.savePNG('sprites/efek/efek_dampak.png');
  }
}

console.log('Regenerating refined Kampungku 2D Pixel Art Assets...');
generateGroundTiles();
generatePetaniSprites();
generateBuildings();
generateProps();
generateEffects();
console.log('Done! Refined assets saved.');
