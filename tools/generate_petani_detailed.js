/**
 * Detailed 16-bit Pixel Art Indonesian Village Youth ("Pemuda Desa") Generator
 * Canvas: 42x52 logical pixels, scaled 3x -> 126x156 PNG (zero anti-aliasing, zero mixels)
 * Features:
 *   - Organic curved chibi-RPG anatomy (sloped shoulders, youthful jawline, diagonal bent-knee strides!)
 *   - Authentic Pemuda Desa details: woven bamboo caping, tousled bangs, cream baju koko
 *     with rolled sleeves, red village shoulder cloth, green batik waist sash with swaying tail,
 *     rolled brown pangsi trousers, and Indonesian blue-strap sandal jepit!
 *   - 4-frame breathing + eye-blink idle, 6-frame fluid walk cycle, 3-frame dynamic hoe action
 *
 * Run: node tools/generate_petani_detailed.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCALE = 3; // 42x52 * 3 = 126x156 px
const FW = 42;
const FH = 52;

// ============================================================================
// Pure-JS PNG Encoder (RGBA8)
// ============================================================================
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRGBA(hex) {
  if (!hex) return [0, 0, 0, 0];
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  px(x, y, hex) {
    const ix = Math.round(x);
    const iy = Math.round(y);
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
      for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, hex);
    }
  }

  hline(x, y, len, hex) {
    for (let dx = 0; dx < len; dx++) this.px(x + dx, y, hex);
  }

  vline(x, y, len, hex) {
    for (let dy = 0; dy < len; dy++) this.px(x, y + dy, hex);
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

  outline(hex = '#1d131a') {
    const copy = new Uint8Array(this.data);
    const hasA = (x, y) => x >= 0 && x < this.w && y >= 0 && y < this.h && copy[(y * this.w + x) * 4 + 3] > 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!hasA(x, y) && (hasA(x - 1, y) || hasA(x + 1, y) || hasA(x, y - 1) || hasA(x, y + 1))) {
          this.px(x, y, hex);
        }
      }
    }
  }

  withGroundShadow(cx, cy, rx, ry, hex = '#1c141d46') {
    const out = new PixelCanvas(this.w, this.h);
    out.ellipse(cx, cy, rx, ry, hex);
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
        const si = (y * this.w + x) * 4;
        const a = this.data[si + 3];
        if (a === 0) continue;
        const r = this.data[si], g = this.data[si + 1], b = this.data[si + 2];
        for (let sy = 0; sy < scale; sy++) {
          const rs = ((y * scale + sy) * outW + x * scale) * 4;
          for (let sx = 0; sx < scale; sx++) {
            const di = rs + sx * 4;
            outBuf[di] = r; outBuf[di + 1] = g; outBuf[di + 2] = b; outBuf[di + 3] = a;
          }
        }
      }
    }
    fs.writeFileSync(filePath, encodePNG(outW, outH, outBuf));
  }
}

// ============================================================================
// Rich Hue-Shifted 16-Bit Indonesian Village Youth Palette
// ============================================================================
const C = {
  OUT: '#1d131a',
  SEAM_SKIN: '#82462b',
  SEAM_CLOTH: '#756452',
  SEAM_PANTS: '#29170d',
  SEAM_GREEN: '#164523',

  // Woven Bamboo Caping
  HAT_SPEC: '#fae39c',
  HAT_LIGHT: '#e8bc64',
  HAT_MID: '#cc913b',
  HAT_SHAD: '#9e6521',
  HAT_DEEP: '#693c13',
  HAT_RIM: '#7d4a1b',

  // Tousled Dark Indonesian Hair
  HAIR_DARK: '#1a1118',
  HAIR_BASE: '#2e2027',
  HAIR_HIGH: '#543b42',

  // Warm Sawo Matang Youthful Skin Ramp
  SKIN_HI: '#fad0a7',
  SKIN_BASE: '#eba97a',
  SKIN_SHAD: '#c98253',
  SKIN_DEEP: '#9c5935',
  BLUSH: '#e38471',

  // Cream Linen Baju Koko / Village Shirt (Rolled Sleeves)
  SHIRT_HI: '#fcf7eb',
  SHIRT_BASE: '#ede2cb',
  SHIRT_SHAD: '#cbbba0',
  SHIRT_DEEP: '#9e8b6f',
  COLLAR_TRIM: '#8f5932',

  // Red Village Scarf / Handuk Kecil on Shoulder
  SCARF_HI: '#eb5e49',
  SCARF_MID: '#c43a2b',
  SCARF_DARK: '#872219',

  // Green Batik Waist Sarung/Sash + Gold Batik Accents
  SASH_HI: '#64c973',
  SASH_BASE: '#34994a',
  SASH_SHAD: '#1f6b32',
  SASH_GOLD: '#f0cc6c',

  // Rolled Dark-Brown Pangsi Village Trousers
  PANTS_HI: '#7d5439',
  PANTS_BASE: '#5c3a24',
  PANTS_SHAD: '#3d2414',

  // Classic Indonesian Blue-Strap Flip-Flop Sandals (Sandal Jepit!)
  SANDAL_SOLE: '#dce6ed',
  SANDAL_SHAD: '#9fb2c2',
  SANDAL_STRAP: '#2576cf',
  SANDAL_STRAP_DK: '#164d8f',

  EYE_DARK: '#1a111a',
  EYE_IRIS: '#3b2420',
  WHITE: '#ffffff',
};

// ============================================================================
// Shared Organic Woven Caping Renderer
// ============================================================================
function drawCaping(c, cx, topY, tiltX = 0) {
  const widths = [2, 4, 8, 12, 16, 20, 24, 26, 28, 30, 32, 30, 26];
  for (let ry = 0; ry < widths.length; ry++) {
    const w = widths[ry];
    const shiftX = Math.round(tiltX * (1 - ry / widths.length));
    const x0 = Math.round(cx - w / 2) + shiftX;
    const y = topY + ry;
    for (let dx = 0; dx < w; dx++) {
      const px = x0 + dx;
      const frac = dx / Math.max(1, w - 1);
      const edgeDrop = (ry === 10 && (dx < 2 || dx > w - 3)) ? 1 : 0;

      let col = C.HAT_MID;
      if (ry === 0) col = C.HAT_RIM;
      else if (ry === 1) col = C.HAT_SPEC;
      else if (ry >= 11) col = (ry === 11 && (dx < 3 || dx > w - 4)) ? C.HAT_RIM : C.HAT_DEEP;
      else if (ry === 10) col = (dx % 3 === 0) ? C.HAT_SHAD : C.HAT_RIM;
      else {
        const weave = (dx + ry * 2) % 4;
        const rib = (Math.abs(dx - w / 2) % 5 < 1);
        if (frac < 0.32) col = (weave === 0) ? C.HAT_SPEC : C.HAT_LIGHT;
        else if (frac < 0.68) col = (weave === 0) ? C.HAT_LIGHT : (rib ? C.HAT_SHAD : C.HAT_MID);
        else col = (weave === 1) ? C.HAT_MID : C.HAT_SHAD;
      }
      c.px(px, y + edgeDrop, col);
    }
  }
  c.hline(cx - 10, topY + 11, 20, C.HAT_DEEP);
}

// ============================================================================
// Front & Back View Character Renderer (Sloped Shoulders & Youthful Face!)
// ============================================================================
function renderFrontBack(isUp, pose) {
  const c = new PixelCanvas(FW, FH);
  const cx = 21;
  const by = pose.bob || 0;
  const hby = pose.headBob !== undefined ? pose.headBob : by;
  const wide = pose.stanceWide || 0;

  // --- 1. LEGS & SANDAL JEPIT ---
  const drawLeg = (lx, legTopY, footY, lift, isLeft) => {
    const legH = Math.max(3, footY - legTopY);
    c.rect(lx, legTopY, 5, legH - 1, C.PANTS_BASE);
    c.vline(isLeft ? lx : lx + 4, legTopY, legH - 1, C.PANTS_SHAD);
    c.vline(lx + 2, legTopY + 1, Math.max(1, legH - 3), C.PANTS_HI);
    c.hline(lx, legTopY + legH - 2, 5, C.PANTS_HI);
    c.hline(lx, legTopY + legH - 1, 5, C.PANTS_SHAD);
    // Bare ankle + foot
    c.rect(lx + 1, footY - 1, 3, 2, C.SKIN_SHAD);
    c.rect(lx, footY + 1, 5, 2, lift ? C.SKIN_SHAD : C.SKIN_BASE);
    if (!lift) {
      c.px(lx + 2, footY + 1, C.SKIN_HI);
      c.hline(lx, footY + 3, 5, C.SANDAL_SOLE);
      c.px(lx + 2, footY + 1, C.SANDAL_STRAP);
      c.px(lx + 1, footY + 2, C.SANDAL_STRAP);
      c.px(lx + 3, footY + 2, C.SANDAL_STRAP);
    } else {
      c.hline(lx + 1, footY + 2, 3, C.SANDAL_SHAD);
      c.px(lx + 2, footY + 1, C.SANDAL_STRAP_DK);
    }
  };

  drawLeg(cx - 6 - wide, 37 + by, 44 + (pose.lLegY || 0), pose.lFootLift, true);
  drawLeg(cx + 1 + wide, 37 + by, 44 + (pose.rLegY || 0), pose.rFootLift, false);

  // --- 2. ARMS (Naturally Sloped Outer Shoulders + Crisp Seam Separation!) ---
  const drawArm = (side, ax, ay) => {
    if (pose.armsMode === 'raise') {
      const rx = cx + side * 8;
      const ry = 17 + by;
      c.rect(rx - 1, ry + 4, 4, 5, C.SHIRT_BASE);
      c.vline(side < 0 ? rx - 1 : rx + 2, ry + 4, 5, C.SHIRT_SHAD);
      c.hline(rx - 1, ry + 4, 4, C.SHIRT_HI);
      c.rect(rx - 1, ry, 4, 4, C.SKIN_BASE);
      c.px(rx, ry + 1, C.SKIN_HI);
      return;
    }
    if (pose.armsMode === 'strike') {
      const sx = cx + side * 5;
      const sy = 28 + by;
      c.rect(sx - 2, sy, 4, 4, C.SHIRT_BASE);
      c.hline(sx - 2, sy, 4, C.SHIRT_HI);
      c.rect(cx + side * 3 - 1, sy + 4, 4, 4, C.SKIN_BASE);
      c.px(cx + side * 3, sy + 5, C.SKIN_HI);
      return;
    }

    // Sloped organic sleeve (outermost top corner omitted for natural shoulder curve!)
    const startX = side < 0 ? ax + 1 : ax;
    c.hline(startX, ay, 3, C.SHIRT_BASE);
    c.px(side < 0 ? ax + 2 : ax + 1, ay, C.SHIRT_HI);
    c.rect(ax, ay + 1, 4, 3, C.SHIRT_BASE);
    c.vline(side < 0 ? ax : ax + 3, ay + 1, 3, C.SHIRT_SHAD);
    c.px(side < 0 ? ax + 1 : ax + 2, ay + 1, C.SHIRT_HI);
    // Rolled cuff
    c.hline(ax, ay + 4, 4, C.SHIRT_DEEP);
    // Tapered forearm & rounded hand
    c.rect(ax, ay + 5, 4, 2, C.SKIN_BASE);
    c.px(ax + (side < 0 ? 2 : 1), ay + 5, C.SKIN_HI);
    c.rect(ax + (side < 0 ? 1 : 0), ay + 7, 3, 2, C.SKIN_BASE);
    c.px(ax + (side < 0 ? 1 : 2), ay + 8, C.SKIN_SHAD);
  };

  drawArm(-1, cx - 10 + (pose.lArmX || 0), 27 + by + (pose.lArmY || 0));
  drawArm(1, cx + 6 + (pose.rArmX || 0), 27 + by + (pose.rArmY || 0));

  // --- 3. TORSO (Crisp Inner Arm Seams, Cream Baju Koko, Red Village Cloth, Green Batik Sash) ---
  c.hline(cx - 5, 26 + by, 10, C.SHIRT_BASE);
  c.rect(cx - 6, 27 + by, 12, 8, C.SHIRT_BASE);
  c.rect(cx - 5, 27 + by, 10, 6, C.SHIRT_HI);
  // Crisp inner arm-torso seam separation so arms never look fused to chest!
  if (!pose.armsMode) {
    c.vline(cx - 6, 28 + by, 6, C.SEAM_CLOTH);
    c.vline(cx + 5, 28 + by, 6, C.SEAM_CLOTH);
  }
  c.hline(cx - 5, 33 + by, 10, C.SHIRT_SHAD);

  if (!isUp) {
    // Open collar V-neck & wooden buttons
    c.rect(cx - 2, 26 + by, 4, 2, C.SKIN_BASE);
    c.px(cx - 2, 26 + by, C.SKIN_SHAD);
    c.px(cx + 1, 26 + by, C.SKIN_SHAD);
    c.px(cx - 3, 26 + by, C.COLLAR_TRIM);
    c.px(cx + 2, 26 + by, C.COLLAR_TRIM);
    c.px(cx, 29 + by, C.COLLAR_TRIM);
    c.px(cx, 31 + by, C.COLLAR_TRIM);
    // Red village cloth draped over left shoulder
    c.rect(cx - 5, 26 + by, 3, 5, C.SCARF_MID);
    c.px(cx - 4, 26 + by, C.SCARF_HI);
    c.px(cx - 4, 28 + by, C.SCARF_HI);
    c.hline(cx - 5, 30 + by, 3, C.SCARF_DARK);
  } else {
    c.rect(cx - 5, 26 + by, 3, 4, C.SCARF_DARK);
    c.px(cx - 4, 26 + by, C.SCARF_MID);
    c.vline(cx, 27 + by, 6, C.SHIRT_SHAD);
  }

  // Green Batik Waist Sash + Swaying Cloth Tail
  c.rect(cx - 6, 34 + by, 12, 4, C.SASH_BASE);
  c.hline(cx - 5, 34 + by, 10, C.SASH_HI);
  c.hline(cx - 6, 37 + by, 12, C.SASH_SHAD);
  c.px(cx - 4, 35 + by, C.SASH_GOLD);
  c.px(cx, 36 + by, C.SASH_GOLD);
  c.px(cx + 3, 35 + by, C.SASH_GOLD);

  const sw = pose.sashSway || 0;
  c.rect(cx + 2, 36 + by, 3, 3, C.SASH_SHAD);
  c.px(cx + 3, 36 + by, C.SASH_BASE);
  c.rect(cx + 2 + sw, 39 + by, 3, 3, C.SASH_BASE);
  c.px(cx + 3 + sw, 40 + by, C.SASH_GOLD);
  c.hline(cx + 2 + sw, 41 + by, 3, C.SASH_SHAD);

  // --- 4. NECK & CLEAN YOUTHFUL HEAD (Crisp Jawline, No Heavy Chin Shadow!) ---
  c.rect(cx - 2, 24 + hby, 4, 2, C.SKIN_SHAD);

  // Rounded head oval
  c.rect(cx - 6, 15 + hby, 12, 8, isUp ? C.HAIR_BASE : C.SKIN_BASE);
  c.hline(cx - 5, 23 + hby, 10, isUp ? C.HAIR_DARK : C.SKIN_BASE);
  c.hline(cx - 3, 24 + hby, 6, isUp ? C.HAIR_DARK : C.SEAM_SKIN); // crisp subtle youthful chin line!
  // Ears
  c.rect(cx - 7, 19 + hby, 2, 3, C.SKIN_SHAD);
  c.px(cx - 7, 19 + hby, C.SKIN_BASE);
  c.rect(cx + 5, 19 + hby, 2, 3, C.SKIN_SHAD);
  c.px(cx + 6, 19 + hby, C.SKIN_BASE);

  if (!isUp) {
    // Bright cheerful youthful face
    c.rect(cx - 5, 17 + hby, 10, 6, C.SKIN_HI);
    c.hline(cx - 4, 23 + hby, 8, C.SKIN_BASE);

    // Tousled Indonesian dark hair bangs & side locks
    c.rect(cx - 6, 15 + hby, 12, 2, C.HAIR_DARK);
    c.px(cx - 5, 17 + hby, C.HAIR_DARK);
    c.px(cx - 2, 17 + hby, C.HAIR_BASE);
    c.px(cx + 1, 17 + hby, C.HAIR_DARK);
    c.px(cx + 4, 17 + hby, C.HAIR_DARK);
    c.vline(cx - 6, 16 + hby, 4, C.HAIR_DARK);
    c.vline(cx + 5, 16 + hby, 4, C.HAIR_DARK);
    c.px(cx - 4, 16 + hby, C.HAIR_HIGH);
    c.px(cx + 2, 16 + hby, C.HAIR_HIGH);

    if (pose.blink) {
      c.hline(cx - 5, 20 + hby, 3, C.EYE_DARK);
      c.hline(cx + 2, 20 + hby, 3, C.EYE_DARK);
    } else {
      c.rect(cx - 5, 19 + hby, 2, 3, C.EYE_DARK);
      c.px(cx - 4, 19 + hby, C.WHITE);
      c.px(cx - 5, 21 + hby, C.EYE_IRIS);
      c.rect(cx + 3, 19 + hby, 2, 3, C.EYE_DARK);
      c.px(cx + 3, 19 + hby, C.WHITE);
      c.px(cx + 4, 21 + hby, C.EYE_IRIS);
      if (pose.determined) {
        c.px(cx - 4, 18 + hby, C.HAIR_DARK);
        c.px(cx + 3, 18 + hby, C.HAIR_DARK);
      }
    }
    // Rosy cheeks + gentle friendly smile
    c.px(cx - 5, 22 + hby, C.BLUSH);
    c.px(cx + 4, 22 + hby, C.BLUSH);
    c.hline(cx - 1, 22 + hby, 2, C.SKIN_SHAD);
  } else {
    c.rect(cx - 6, 15 + hby, 12, 8, C.HAIR_BASE);
    c.hline(cx - 5, 16 + hby, 10, C.HAIR_HIGH);
    c.rect(cx - 6, 21 + hby, 12, 3, C.HAIR_DARK);
    c.px(cx - 4, 24 + hby, C.HAIR_DARK);
    c.px(cx, 24 + hby, C.HAIR_DARK);
    c.px(cx + 3, 24 + hby, C.HAIR_DARK);
  }

  // --- 5. WOVEN BAMBOO CAPING ---
  drawCaping(c, cx, 4 + hby, pose.hatTilt || 0);

  c.outline(C.OUT);
  return c.withGroundShadow(cx, 48, 8, 2.5);
}

// ============================================================================
// Side View Character Renderer (Angled Bent-Knee Stride & Organic Swing!)
// ============================================================================
function renderSide(isLeft, pose) {
  const sc = new PixelCanvas(FW, FH);
  const cx = 21;
  const by = pose.bob || 0;
  const hby = pose.headBob !== undefined ? pose.headBob : by;
  const lean = pose.leanX || 0;

  // Helper to draw a dynamic angled side leg (thigh -> bent knee -> shin -> sandal jepit!)
  const drawAngledLeg = (thighX, footX, lift, isBack) => {
    const baseCol = isBack ? C.PANTS_SHAD : C.PANTS_BASE;
    const hiCol = isBack ? C.PANTS_BASE : C.PANTS_HI;
    const skinCol = isBack ? C.SKIN_SHAD : C.SKIN_BASE;
    const soleCol = isBack ? C.SANDAL_SHAD : C.SANDAL_SOLE;
    const strapCol = isBack ? C.SANDAL_STRAP_DK : C.SANDAL_STRAP;
    const midX = Math.round((thighX + footX) / 2);
    const liftY = lift ? -2 : 0;

    // Upper thigh (y = 37..40)
    sc.rect(thighX, 37 + by, 5, 4, baseCol);
    sc.vline(thighX + 3, 37 + by, 3, hiCol);
    // Lower shin/knee angled toward footX (y = 40..44)
    sc.rect(midX, 40 + by, 5, 3 + Math.min(0, liftY + 1), baseCol);
    sc.vline(midX + 3, 40 + by, 2, hiCol);
    // Rolled cuff at ankle
    sc.hline(footX, 43 + by + liftY, 5, hiCol);
    // Bare ankle + foot + sandal jepit
    sc.rect(footX + 1, 44 + by + liftY, 4, 2, skinCol);
    if (!isBack) sc.px(footX + 3, 44 + by + liftY, C.SKIN_HI);
    sc.rect(footX + 1, 46 + by + liftY, 6, 1, soleCol);
    sc.px(footX + 4, 45 + by + liftY, strapCol);
    sc.px(footX + 5, 45 + by + liftY, strapCol);
  };

  // --- 1. BACK ARM (Swinging freely on far side!) ---
  if (!pose.armsMode) {
    const bax = cx + 2 + lean + (pose.backArmX || 0);
    const bay = 28 + by + (pose.backArmY || 0);
    sc.rect(bax, bay, 4, 4, C.SHIRT_SHAD);
    sc.rect(bax + 1, bay + 4, 3, 4, C.SKIN_SHAD);
  }

  // --- 2. BACK & FRONT ANGLED LEGS ---
  drawAngledLeg(cx - 2 + Math.round((pose.backLegX || 0) * 0.45), cx - 2 + (pose.backLegX || 0), pose.backFootLift, true);
  drawAngledLeg(cx - 2 + Math.round((pose.frontLegX || 0) * 0.45), cx - 2 + (pose.frontLegX || 0), pose.frontFootLift, false);

  // --- 3. TORSO (Rounded 3/4 Profile Shirt, Red Cloth, Batik Sash + Tail) ---
  const tx = cx - 5 + lean;
  sc.hline(tx + 1, 26 + by, 9, C.SHIRT_BASE);
  sc.rect(tx, 27 + by, 11, 8, C.SHIRT_BASE);
  sc.rect(tx + 2, 27 + by, 8, 6, C.SHIRT_HI);
  sc.vline(tx, 27 + by, 7, C.SHIRT_SHAD);
  // Red shoulder cloth
  sc.rect(tx + 1, 26 + by, 4, 4, C.SCARF_MID);
  sc.px(tx + 2, 26 + by, C.SCARF_HI);
  sc.hline(tx + 1, 29 + by, 4, C.SCARF_DARK);

  // Green batik sash + dynamic trailing tail
  sc.rect(tx, 34 + by, 11, 4, C.SASH_BASE);
  sc.hline(tx + 1, 34 + by, 9, C.SASH_HI);
  sc.hline(tx, 37 + by, 11, C.SASH_SHAD);
  sc.px(tx + 4, 35 + by, C.SASH_GOLD);
  sc.px(tx + 8, 36 + by, C.SASH_GOLD);
  const sw = pose.sashSway || 0;
  sc.rect(tx - 1 + sw, 37 + by, 3, 5, C.SASH_SHAD);
  sc.px(tx + sw, 38 + by, C.SASH_BASE);
  sc.px(tx + sw, 40 + by, C.SASH_GOLD);

  // --- 4. HEAD (Clean Youthful Side Profile, No Neck-Gap Artifact!) ---
  const hx = cx - 5 + lean;
  sc.rect(cx - 2 + lean, 24 + hby, 5, 3, C.SKIN_SHAD); // solid continuous neck into collar
  sc.rect(hx, 15 + hby, 11, 8, C.SKIN_BASE);
  sc.rect(hx + 4, 17 + hby, 7, 6, C.SKIN_HI);
  sc.hline(hx + 2, 23 + hby, 8, C.SKIN_BASE);
  sc.hline(hx + 3, 24 + hby, 6, C.SEAM_SKIN);
  // Nose tip & cheerful cheek
  sc.px(hx + 11, 20 + hby, C.SKIN_HI);
  sc.px(hx + 10, 22 + hby, C.SKIN_BASE);

  // Tousled dark back hair + side bangs + ear
  sc.rect(hx - 1, 15 + hby, 6, 8, C.HAIR_DARK);
  sc.rect(hx, 15 + hby, 10, 2, C.HAIR_DARK);
  sc.rect(hx, 16 + hby, 4, 5, C.HAIR_BASE);
  sc.px(hx + 1, 17 + hby, C.HAIR_HIGH);
  sc.px(hx - 1, 23 + hby, C.HAIR_DARK);
  sc.px(hx + 8, 17 + hby, C.HAIR_DARK);
  sc.rect(hx + 3, 19 + hby, 2, 3, C.SKIN_BASE);
  sc.px(hx + 3, 20 + hby, C.SKIN_SHAD);

  if (pose.blink) {
    sc.hline(hx + 7, 20 + hby, 3, C.EYE_DARK);
  } else {
    sc.rect(hx + 8, 19 + hby, 2, 3, C.EYE_DARK);
    sc.px(hx + 9, 19 + hby, C.WHITE);
    sc.px(hx + 8, 21 + hby, C.EYE_IRIS);
    if (pose.determined) sc.px(hx + 8, 18 + hby, C.HAIR_DARK);
  }
  sc.px(hx + 7, 22 + hby, C.BLUSH);

  // --- 5. FRONT ARM (Crisp Fabric Seams on Both Sides for Organic Depth!) ---
  if (pose.armsMode === 'raise') {
    const ax = cx - 4 + lean;
    const ay = 16 + by;
    sc.rect(ax, ay + 4, 4, 5, C.SHIRT_HI);
    sc.vline(ax - 1, ay + 4, 5, C.SEAM_CLOTH);
    sc.vline(ax + 4, ay + 4, 5, C.SEAM_CLOTH);
    sc.rect(ax, ay, 4, 4, C.SKIN_BASE);
    sc.px(ax + 1, ay + 1, C.SKIN_HI);
  } else if (pose.armsMode === 'strike') {
    const ax = cx + 2 + lean;
    const ay = 27 + by;
    sc.rect(ax, ay, 6, 4, C.SHIRT_HI);
    sc.hline(ax, ay + 3, 6, C.SEAM_CLOTH);
    sc.rect(ax + 6, ay + 2, 4, 4, C.SKIN_BASE);
    sc.px(ax + 7, ay + 3, C.SKIN_HI);
  } else {
    const ax = cx - 1 + lean + (pose.frontArmX || 0);
    const ay = 27 + by + (pose.frontArmY || 0);
    // Gentle angled elbow shift for swinging arm
    const handShift = Math.round((pose.frontArmX || 0) * 0.4);
    sc.vline(ax - 1, ay + 1, 4, C.SEAM_CLOTH);
    sc.rect(ax, ay, 4, 4, C.SHIRT_HI);
    sc.vline(ax + 4, ay + 1, 3, C.SEAM_CLOTH);
    sc.hline(ax, ay + 4, 4, C.SHIRT_DEEP);
    sc.rect(ax + handShift, ay + 5, 4, 2, C.SKIN_BASE);
    sc.px(ax + handShift + 2, ay + 5, C.SKIN_HI);
    sc.rect(ax + handShift + 1, ay + 7, 3, 2, C.SKIN_BASE);
    sc.px(ax + handShift + 1, ay + 8, C.SKIN_SHAD);
  }

  // --- 6. WOVEN BAMBOO CAPING ---
  drawCaping(sc, cx + lean, 4 + hby, pose.hatTilt || 0);

  sc.outline(C.OUT);
  const finalC = new PixelCanvas(FW, FH);
  finalC.blit(sc, 0, 0, isLeft);
  return finalC.withGroundShadow(cx, 48, 8, 2.5);
}

// ============================================================================
// Generate All Animations: 4-Frame Idle, 6-Frame Walk, 3-Frame Hoe!
// ============================================================================
function generateAllPemudaSprites() {
  const dirs = ['down', 'left', 'right', 'up'];

  const idlePoses = [
    { bob: 0, headBob: 0, sashSway: 0, blink: false },
    { bob: 0, headBob: 1, lArmY: 1, rArmY: 1, frontArmY: 1, backArmY: 1, sashSway: 0, blink: false },
    { bob: 0, headBob: 0, sashSway: 0, blink: true },
    { bob: 0, headBob: 0, sashSway: 1, blink: false },
  ];

  const walkFrontBackPoses = [
    { bob: 0,  headBob: 0,  lLegY: 1,  rLegY: -1, lFootLift: false, rFootLift: false, lArmY: -1, rArmY: 1,  sashSway: -1 },
    { bob: -1, headBob: -1, lLegY: 1,  rLegY: -2, lFootLift: false, rFootLift: true,  lArmY: -2, rArmY: 1,  sashSway: -1 },
    { bob: -1, headBob: 0,  lLegY: 0,  rLegY: -1, lFootLift: false, rFootLift: true,  lArmY: -1, rArmY: 0,  sashSway: 0  },
    { bob: 0,  headBob: 0,  lLegY: -1, rLegY: 1,  lFootLift: false, rFootLift: false, lArmY: 1,  rArmY: -1, sashSway: 1  },
    { bob: -1, headBob: -1, lLegY: -2, rLegY: 1,  lFootLift: true,  rFootLift: false, lArmY: 1,  rArmY: -2, sashSway: 1  },
    { bob: -1, headBob: 0,  lLegY: -1, rLegY: 0,  lFootLift: true,  rFootLift: false, lArmY: 0,  rArmY: -1, sashSway: 0  },
  ];

  const walkSidePoses = [
    { bob: 0,  headBob: 0,  leanX: 1, backLegX: -4, frontLegX: 4,  backFootLift: false, frontFootLift: false, frontArmX: -3, backArmX: 3,  sashSway: -1 },
    { bob: -1, headBob: -1, leanX: 1, backLegX: -2, frontLegX: 2,  backFootLift: true,  frontFootLift: false, frontArmX: -2, backArmX: 2,  sashSway: -2 },
    { bob: -1, headBob: 0,  leanX: 0, backLegX: 0,  frontLegX: 0,  backFootLift: true,  frontFootLift: false, frontArmX: 0,  backArmX: 0,  sashSway: -1 },
    { bob: 0,  headBob: 0,  leanX: 1, backLegX: 4,  frontLegX: -4, backFootLift: false, frontFootLift: false, frontArmX: 3,  backArmX: -3, sashSway: -1 },
    { bob: -1, headBob: -1, leanX: 1, backLegX: 2,  frontLegX: -2, backFootLift: false, frontFootLift: true,  frontArmX: 2,  backArmX: -2, sashSway: -2 },
    { bob: -1, headBob: 0,  leanX: 0, backLegX: 0,  frontLegX: 0,  backFootLift: false, frontFootLift: true,  frontArmX: 0,  backArmX: 0,  sashSway: -1 },
  ];

  const hoeFrontBackPoses = [
    { bob: -1, headBob: -2, armsMode: 'raise',  stanceWide: 1, sashSway: 1,  determined: true },
    { bob: 1,  headBob: 2,  armsMode: 'strike', stanceWide: 1, sashSway: -2, determined: true },
    { bob: 0,  headBob: 0,  lArmY: 1, rArmY: 1, stanceWide: 0, sashSway: -1, determined: false },
  ];

  const hoeSidePoses = [
    { bob: -1, headBob: -2, leanX: -2, armsMode: 'raise',  backLegX: -3, frontLegX: 3, sashSway: 1,  hatTilt: -1, determined: true },
    { bob: 1,  headBob: 2,  leanX: 3,  armsMode: 'strike', backLegX: -4, frontLegX: 5, backFootLift: true, sashSway: -3, hatTilt: 1, determined: true },
    { bob: 0,  headBob: 1,  leanX: 1,  frontArmX: 2, backArmX: -1, backLegX: -1, frontLegX: 2, sashSway: -1, determined: false },
  ];

  const walkSheet = new PixelCanvas(FW * 6, FH * 4);

  dirs.forEach((dir, rowIdx) => {
    const isSide = (dir === 'left' || dir === 'right');
    const isUp = (dir === 'up');
    const isLeft = (dir === 'left');

    idlePoses.forEach((p, i) => {
      const frame = isSide ? renderSide(isLeft, p) : renderFrontBack(isUp, p);
      frame.savePNG(`sprites/petani/idle_${dir}_${i}.png`);
    });

    const wPoses = isSide ? walkSidePoses : walkFrontBackPoses;
    wPoses.forEach((p, i) => {
      const frame = isSide ? renderSide(isLeft, p) : renderFrontBack(isUp, p);
      frame.savePNG(`sprites/petani/walk_${dir}_${i}.png`);
      walkSheet.blit(frame, i * FW, rowIdx * FH);
    });

    const hPoses = isSide ? hoeSidePoses : hoeFrontBackPoses;
    hPoses.forEach((p, i) => {
      const frame = isSide ? renderSide(isLeft, p) : renderFrontBack(isUp, p);
      frame.savePNG(`sprites/petani/hoe_${dir}_${i}.png`);
    });
  });

  walkSheet.savePNG('sprites/petani/petani_sheet_clean.png');
}

console.log('Generating Polished Pemuda Desa Pixel Art Sprites (42x52 @ 3x = 126x156)...');
generateAllPemudaSprites();
console.log('Done! Polished Pemuda Desa sprites generated.');
