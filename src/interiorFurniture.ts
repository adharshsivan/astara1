import { FURNITURE } from './interiorArt';

// Shared 2D silhouettes evaluated at the existing virtual depths. All sizes
// below are metres, so a three-bay room never stretches a TV, lamp, or chair.
export const INTERIOR_FURNITURE_GLSL = /* glsl */ `
  const float TV_ASPECT = ${FURNITURE.tvAspect.toFixed(9)};
  const float CONSOLE_H = ${FURNITURE.consoleHeight.toFixed(3)};
  const float SOFA_H = ${FURNITURE.sofaHeight.toFixed(3)};
  const float BED_H = ${FURNITURE.bedHeight.toFixed(3)};
  const float DESK_H = ${FURNITURE.deskHeight.toFixed(3)};
  const float FLOOR_LAMP_H = ${FURNITURE.floorLampHeight.toFixed(3)};
  const float TABLE_LAMP_H = ${FURNITURE.tableLampHeight.toFixed(3)};
  const vec3 INK = vec3(0.014, 0.019, 0.026);
  const vec3 PAPER = vec3(0.91, 0.91, 0.87);

  void coat(inout vec4 layer, vec3 color, float mask) {
    float a = clamp(mask, 0.0, 1.0);
    layer.rgb = mix(layer.rgb, color, a);
    layer.a = a + layer.a * (1.0 - a);
  }

  bool outside(vec2 p, vec2 center, vec2 halfSize, vec2 pixel) {
    return any(greaterThan(abs(p - center), halfSize + pixel * 2.0 + 0.065));
  }

  float taperMask(vec2 p, vec2 center, vec2 halfSize, float topRatio, vec2 pixel) {
    vec2 q = p - center;
    float t = clamp((q.y / halfSize.y + 1.0) * 0.5, 0.0, 1.0);
    float w = halfSize.x * mix(1.0, topRatio, t);
    vec2 aa = max(pixel * 0.7, vec2(0.0006));
    vec2 cover = 1.0 - smoothstep(-aa, aa, abs(q) - vec2(w, halfSize.y));
    return cover.x * cover.y;
  }

  float lineMask(vec2 p, vec2 a, vec2 b, float radius, vec2 pixel) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.00001), 0.0, 1.0);
    float d = length(p - a - t * ab) - radius;
    float aa = max(max(pixel.x, pixel.y) * 0.7, 0.0006);
    return 1.0 - smoothstep(-aa, aa, d);
  }

  void cabinet(inout vec4 layer, vec2 p, vec2 px, float width, float height,
               RoomPalette pal, float fine, bool shelves) {
    float w = width * 0.5;
    if (outside(p, vec2(0.0, height * 0.5), vec2(w, height * 0.5), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.02), vec2(w + 0.035, 0.035), px + 0.018) * 0.24);
    float feet = boxMask(vec2(abs(p.x), p.y), vec2(w - 0.07, 0.065), vec2(0.025, 0.055), px);
    coat(layer, INK, feet);
    float body = roundMask(p, vec2(0.0, (height + 0.105) * 0.5), vec2(w, (height - 0.105) * 0.5), 0.016, px);
    coat(layer, pal.wood * mix(0.78, 1.02, smoothstep(0.1, height, p.y)), body);
    coat(layer, pal.wood * 1.2, boxMask(p, vec2(0.0, height - 0.008), vec2(w, 0.016), px));
    if (fine > 0.01) {
      coat(layer, INK, boxMask(p, vec2(0.0, height * 0.54), vec2(0.005, height * 0.38), px) * fine * 0.5);
      coat(layer, INK, boxMask(vec2(abs(p.x), p.y), vec2(0.045, height * 0.65), vec2(0.008, 0.036), px) * fine);
    }
    if (shelves) {
      float recess = boxMask(p, vec2(0.0, height * 0.72), vec2(w - 0.055, height * 0.19), px);
      coat(layer, pal.wood * 0.34, recess);
      coat(layer, pal.wood * 1.1, boxMask(p, vec2(0.0, height * 0.72), vec2(w - 0.035, 0.02), px));
    }
  }

  void displayScreen(inout vec4 layer, vec2 p, vec2 px, float width) {
    vec2 halfSize = vec2(width, width / TV_ASPECT) * 0.5;
    if (outside(p, vec2(0.0), halfSize, px)) return;
    coat(layer, INK * 0.55, roundMask(p, vec2(0.0), halfSize, 0.018, px));
    float innerWidth = width - 0.028;
    vec2 screenSize = vec2(innerWidth, innerWidth / TV_ASPECT) * 0.5;
    float screen = roundMask(p, vec2(0.0, 0.003), screenSize, 0.009, px);
    float sheen = smoothstep(-0.8, 1.0, p.x / width + p.y / width);
    coat(layer, mix(vec3(0.009, 0.015, 0.023), vec3(0.038, 0.057, 0.072), sheen), screen);
    coat(layer, vec3(0.075, 0.088, 0.095), boxMask(p, vec2(0.0, -halfSize.y + 0.005), vec2(width * 0.11, 0.004), px));
  }

  void mediaWall(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal, float fine) {
    if (outside(p, vec2(0.0, 0.95), vec2(width * 0.5, 0.96), px)) return;
    cabinet(layer, p, px, width, CONSOLE_H, pal, fine, false);
    float tvWidth = min(1.48, width * 0.69);
    // The same centre owns the wall-mounted 16:9 display and low console.
    vec2 center = vec2(0.0, 0.96 + tvWidth / TV_ASPECT * 0.5);
    coat(layer, INK, roundMask(p, center + vec2(0.025, -0.025),
      vec2(tvWidth, tvWidth / TV_ASPECT) * 0.5, 0.028, px + 0.035) * 0.17);
    displayScreen(layer, p - center, px, tvWidth);
  }

  void sofa(inout vec4 layer, vec2 p, vec2 px, float width, vec3 cloth,
            RoomPalette pal, float fine, bool away, float style) {
    float w = width * 0.5;
    if (outside(p, vec2(0.0, SOFA_H * 0.5), vec2(w, SOFA_H * 0.5), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(w, 0.04), px + 0.022) * 0.3);
    coat(layer, pal.wood * 0.4, boxMask(vec2(abs(p.x), p.y), vec2(w - 0.14, 0.095), vec2(0.032, 0.075), px));
    coat(layer, cloth * 0.62, roundMask(p, vec2(0.0, 0.245), vec2(w - 0.025, 0.105), 0.035, px));
    float back = roundMask(p, vec2(0.0, 0.545), vec2(w - 0.018, SOFA_H - 0.545), 0.095, px);
    coat(layer, cloth * mix(0.76, 1.06, smoothstep(0.25, SOFA_H, p.y)), back);
    if (!away) {
      float cushions = width < 1.05
        ? roundMask(p, vec2(0.0, 0.625), vec2(w - 0.075, 0.175), 0.065, px)
        : roundMask(vec2(abs(p.x), p.y), vec2(w * 0.46, 0.625), vec2(w * 0.41, 0.175), 0.055, px);
      coat(layer, cloth * 1.07, cushions);
      coat(layer, cloth * 0.9, roundMask(p, vec2(0.0, 0.425), vec2(w - 0.09, 0.055), 0.035, px));
      coat(layer, cloth * 0.76, roundMask(vec2(abs(p.x), p.y), vec2(w - 0.085, 0.455), vec2(0.085, 0.19), 0.055, px));
    }
    float throwWidth = min(0.23, width * 0.12);
    float throwMask = roundMask(p, vec2(w * 0.47, away ? 0.59 : 0.555),
      vec2(throwWidth, away ? 0.245 : 0.15), 0.025, px) * back;
    coat(layer, mix(pal.accent, pal.soft, step(0.57, vPalette.y)), throwMask);
    if (fine > 0.01) {
      if (width > 1.05) coat(layer, cloth * 0.48, boxMask(p, vec2(0.0, 0.52), vec2(0.005, 0.20), px) * back * fine * 0.32);
      coat(layer, cloth * 1.18, boxMask(p, vec2(0.0, SOFA_H - 0.035), vec2(w - 0.09, 0.01), px) * fine);
    }
    if (style > 1.5 && style < 2.5 && !away) {
      coat(layer, cloth * 0.9, roundMask(p, vec2(w * 0.52, 0.275), vec2(w * 0.40, 0.11), 0.04, px));
    }
  }

  void bed(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal, float fine, float style) {
    float w = width * 0.5;
    if (outside(p, vec2(0.0, 0.58), vec2(w + 0.06, 0.58), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(w + 0.04, 0.04), px + 0.024) * 0.28);
    coat(layer, pal.wood * 0.42, boxMask(vec2(abs(p.x), p.y), vec2(w - 0.13, 0.065), vec2(0.035, 0.05), px));
    coat(layer, pal.wood * 0.82, roundMask(p, vec2(0.0, 0.605), vec2(w + 0.045, 0.505), 0.05, px));
    if (style < 0.5 || style > 1.5) {
      coat(layer, pal.fabric * mix(0.76, 1.0, smoothstep(0.3, 1.1, p.y)),
        roundMask(p, vec2(0.0, 0.715), vec2(w - 0.018, 0.355), 0.045, px));
    }
    coat(layer, pal.wood * 0.7, roundMask(p, vec2(0.0, 0.305), vec2(w, 0.19), 0.035, px));
    coat(layer, PAPER * 0.82, roundMask(p, vec2(0.0, BED_H - 0.11), vec2(w, 0.11), 0.045, px));
    coat(layer, PAPER, taperMask(p, vec2(0.0, BED_H + 0.135), vec2(w, 0.135), 0.87, px));
    float pillow = roundMask(vec2(abs(p.x), p.y), vec2(w * 0.43, BED_H + 0.237), vec2(w * 0.30, 0.064), 0.035, px);
    coat(layer, pal.fabric * 0.68, roundMask(vec2(abs(p.x), p.y), vec2(w * 0.43, BED_H + 0.218), vec2(w * 0.315, 0.07), 0.035, px));
    coat(layer, PAPER * 1.05, pillow);
    coat(layer, pal.accent * 0.88, roundMask(p, vec2(0.0, BED_H - 0.065), vec2(w - 0.014, 0.085), 0.018, px));
    coat(layer, pal.accent * 1.12, taperMask(p, vec2(0.0, BED_H + 0.035), vec2(w - 0.01, 0.035), 0.96, px));
    if (fine > 0.01) {
      coat(layer, pal.fabric * 0.65, boxMask(p, vec2(0.0, 0.96), vec2(0.005, 0.105), px) * fine * 0.45);
    }
  }

  void armchair(inout vec4 layer, vec2 p, vec2 px, float width, vec3 cloth, RoomPalette pal, float fine, float direction) {
    vec2 q = vec2(p.x + (p.y - 0.40) * 0.13 * direction, p.y);
    sofa(layer, q, px, width, cloth, pal, fine, false, 0.0);
  }

  void lowTable(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal) {
    if (outside(p, vec2(0.0, 0.23), vec2(width * 0.5, 0.23), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(width * 0.3, 0.035), px + 0.018) * 0.24);
    coat(layer, pal.wood * 0.64, taperMask(p, vec2(0.0, 0.215), vec2(width * 0.25, 0.19), 0.60, px));
    coat(layer, pal.wood * 0.82, ovalMask(p, vec2(0.0, 0.392), vec2(width * 0.5, 0.048), px));
    coat(layer, pal.wood * 1.24, ovalMask(p, vec2(0.0, 0.417), vec2(width * 0.5, 0.044), px));
  }

  void dining(inout vec4 layer, vec2 p, vec2 px, RoomPalette pal, float fine, float style) {
    if (outside(p, vec2(0.0, 0.47), vec2(1.04, 0.47), px)) return;
    vec2 paired = vec2(abs(p.x), p.y);
    coat(layer, INK, boxMask(vec2(abs(paired.x - 0.83), p.y), vec2(0.12, 0.23), vec2(0.024, 0.215), px));
    coat(layer, pal.accent * 0.86, roundMask(paired, vec2(0.83, 0.66), vec2(0.17, 0.215), 0.075, px));
    coat(layer, pal.accent * 1.08, roundMask(paired, vec2(0.83, 0.46), vec2(0.20, 0.04), 0.025, px));
    float legs = lineMask(paired, vec2(0.52, 0.03), vec2(0.40, DESK_H - 0.04), 0.027, px);
    coat(layer, pal.wood * 0.67, legs);
    if (style < 1.5) {
      coat(layer, pal.wood * 0.8, ovalMask(p, vec2(0.0, DESK_H), vec2(0.68, 0.08), px));
      coat(layer, pal.wood * 1.2, ovalMask(p, vec2(0.0, DESK_H + 0.025), vec2(0.68, 0.07), px));
    } else {
      coat(layer, pal.wood * 0.82, roundMask(p, vec2(0.0, DESK_H), vec2(0.67, 0.04), 0.018, px));
      coat(layer, pal.wood * 1.2, taperMask(p, vec2(0.0, DESK_H + 0.05), vec2(0.67, 0.03), 0.88, px));
    }
    if (fine > 0.1 && style > 2.5) {
      coat(layer, PAPER * 0.8, ovalMask(p, vec2(0.0, DESK_H + 0.12), vec2(0.105, 0.045), px));
    }
  }

  void desk(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal, float fine) {
    if (outside(p, vec2(0.0, 0.64), vec2(width * 0.5, 0.64), px)) return;
    coat(layer, pal.wood * 0.58, lineMask(vec2(abs(p.x), p.y), vec2(width * 0.42, 0.03), vec2(width * 0.37, DESK_H), 0.026, px));
    coat(layer, pal.wood * 0.85, boxMask(p, vec2(0.0, DESK_H - 0.04), vec2(width * 0.5, 0.038), px));
    coat(layer, pal.wood * 1.2, boxMask(p, vec2(0.0, DESK_H + 0.012), vec2(width * 0.5, 0.015), px));
    coat(layer, INK, boxMask(p, vec2(0.0, DESK_H + 0.096), vec2(0.018, 0.072), px));
    coat(layer, INK, ovalMask(p, vec2(0.0, DESK_H + 0.035), vec2(0.105, 0.014), px));
    displayScreen(layer, p - vec2(0.0, DESK_H + 0.15 + 0.64 / TV_ASPECT * 0.5), px, 0.64);
    if (fine > 0.01) {
      coat(layer, INK * 1.6, boxMask(p, vec2(0.0, DESK_H + 0.02), vec2(0.20, 0.012), px) * fine);
    }
  }

  void deskChair(inout vec4 layer, vec2 p, vec2 px, RoomPalette pal) {
    if (outside(p, vec2(0.0, 0.48), vec2(0.28, 0.48), px)) return;
    coat(layer, INK, boxMask(p, vec2(0.0, 0.25), vec2(0.025, 0.205), px));
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.05), vec2(0.265, 0.029), px));
    coat(layer, pal.accent * 0.64, roundMask(p, vec2(0.0, 0.48), vec2(0.24, 0.046), 0.025, px));
    coat(layer, pal.accent, roundMask(p, vec2(0.0, 0.74), vec2(0.205, 0.20), 0.075, px));
    coat(layer, pal.soft, roundMask(p, vec2(0.0, 0.865), vec2(0.15, 0.055), 0.034, px) * 0.38);
  }

  float lamp(inout vec4 layer, vec2 p, vec2 px, bool tableLamp, float style, RoomPalette pal) {
    float height = tableLamp ? TABLE_LAMP_H : FLOOR_LAMP_H;
    float w = tableLamp ? 0.18 : 0.28;
    float h = tableLamp ? 0.095 : 0.13;
    if (outside(p, vec2(0.0, height * 0.5), vec2(w, height * 0.5), px)) return 0.0;
    float baseWidth = tableLamp ? 0.095 : 0.175;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(baseWidth, 0.023), px));
    float stemTop = height - h * 2.0 + 0.02;
    float stemBottom = tableLamp ? 0.15 : 0.035;
    coat(layer, INK * 1.7, boxMask(p, vec2(0.0, (stemTop + stemBottom) * 0.5), vec2(0.013, (stemTop - stemBottom) * 0.5), px));
    if (tableLamp) {
      coat(layer, pal.accent * mix(0.65, 1.06, smoothstep(-0.09, 0.06, -p.x)),
        roundMask(p, vec2(0.0, 0.14), vec2(0.087, 0.105), 0.052, px));
    }
    vec2 center = vec2(0.0, height - h);
    float shade = style < 1.5 ? taperMask(p, center, vec2(w, h), 0.76, px)
      : roundMask(p, center, vec2(w * 0.89, h), 0.017, px);
    vec3 linen = PAPER * mix(0.72, 1.05, smoothstep(-w, w, -p.x));
    coat(layer, linen, shade);
    coat(layer, PAPER * 0.64, boxMask(p, vec2(0.0, height - h * 2.0 + 0.005), vec2(w * 0.86, 0.009), px) * shade);
    return shade;
  }

  void artwork(inout vec4 layer, vec2 p, vec2 px, float width, float design, RoomPalette pal, float fine) {
    float h = width * (design > 0.5 && design < 1.5 ? 0.43 : 0.29);
    vec2 q = p;
    float w = width * 0.5;
    if (outside(p, vec2(0.0), vec2(w, h), px)) return;
    if (design > 2.5) { q.x = abs(q.x) - width * 0.27; w = width * 0.23; h = width * 0.29; }
    coat(layer, INK, boxMask(q - vec2(0.017, -0.018), vec2(0.0), vec2(w, h), px + 0.015) * 0.18);
    coat(layer, pal.wood * 0.48, boxMask(q, vec2(0.0), vec2(w, h), px));
    float paper = boxMask(q, vec2(0.0), vec2(w - 0.024, h - 0.024), px);
    coat(layer, PAPER, paper);
    vec2 artSize = max(vec2(w - 0.065, h - 0.065), vec2(0.04));
    vec2 uv = q / artSize;
    vec2 apx = px / artSize;
    float inset = boxMask(uv, vec2(0.0), vec2(1.0), apx) * paper;
    coat(layer, pal.wall * 0.96, inset);
    if (design < 0.5) {
      float sun = ovalMask(uv, vec2(0.32, 0.34), vec2(0.24, 0.32), apx);
      coat(layer, pal.soft, sun * inset);
      float hill = taperMask(uv, vec2(-0.18, -0.50), vec2(1.40, 0.45), 0.20, apx);
      coat(layer, pal.accent, hill * inset);
      coat(layer, pal.wood * 0.75, boxMask(uv, vec2(0.0, -0.79), vec2(1.0, 0.16), apx) * inset);
    } else if (design < 1.5 || design > 2.5) {
      float arch = roundMask(uv, vec2(-0.18, -0.10), vec2(0.53, 0.96), 0.50, apx);
      coat(layer, pal.accent, arch * inset);
      coat(layer, pal.soft, ovalMask(uv, vec2(0.39, -0.40), vec2(0.50, 0.43), apx) * inset);
    } else {
      coat(layer, pal.accent, ovalMask(uv, vec2(-0.27, -0.09), vec2(0.43, 0.20), apx) * inset);
      coat(layer, pal.accent * 0.8, ovalMask(uv, vec2(0.25, 0.29), vec2(0.40, 0.22), apx) * inset);
      coat(layer, pal.soft, ovalMask(uv, vec2(-0.15, 0.67), vec2(0.29, 0.20), apx) * inset);
      if (fine > 0.01) coat(layer, pal.accent * 0.4, lineMask(uv, vec2(-0.09, -0.89), vec2(0.06, 0.73), 0.021, apx) * inset * fine);
    }
  }

  void doorway(inout vec4 layer, vec2 p, vec2 px, RoomPalette pal, float fine) {
    if (outside(p, vec2(0.0, 1.035), vec2(0.44, 1.035), px)) return;
    coat(layer, INK * 1.3, boxMask(p, vec2(0.0, 1.035), vec2(0.44, 1.035), px));
    coat(layer, pal.wall * 0.60, boxMask(p, vec2(0.0, 1.018), vec2(0.405, 1.006), px));
    coat(layer, pal.wall * 0.75, boxMask(p, vec2(-0.012, 1.075), vec2(0.35, 0.91), px) * 0.55);
    if (fine > 0.01) coat(layer, INK, boxMask(p, vec2(0.305, 0.96), vec2(0.055, 0.014), px) * fine);
  }

  /* ---------------- Lobby asset set (compact, reused per unit) ----------------
   * Reception desk, oak reception backdrop with a brand bar, a pair of lounge
   * sofas on a round table, a tall planter and a row of pendants. All metres,
   * all composed symmetrically about the unit's main anchor. */

  void receptionDesk(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal, float fine) {
    float w = width * 0.5;
    float h = 1.08;
    if (outside(p, vec2(0.0, h * 0.5), vec2(w, h * 0.5), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.03), vec2(w + 0.05, 0.045), px + 0.02) * 0.28);
    // Recessed charcoal plinth so the stone front appears to float.
    coat(layer, pal.accent * 0.8, boxMask(p, vec2(0.0, 0.07), vec2(w - 0.08, 0.07), px));
    // Fluted oak front — vertical ribs attenuated like every other thin detail.
    float front = roundMask(p, vec2(0.0, 0.14 + (h - 0.2) * 0.5), vec2(w, (h - 0.2) * 0.5), 0.012, px);
    float ribFreq = 6.2831853 / 0.085;
    float rib = 0.5 + 0.5 * cos(p.x * ribFreq);
    float ribWeight = (1.0 - smoothstep(0.35, 1.15, px.x * ribFreq)) * fine;
    coat(layer, pal.wood * mix(0.82, 1.06, smoothstep(0.1, h, p.y)) * (1.0 - 0.16 * rib * ribWeight), front);
    // Thin stone counter with a lighter nosing.
    coat(layer, pal.wall * 0.92, boxMask(p, vec2(0.0, h - 0.035), vec2(w + 0.05, 0.035), px));
    coat(layer, PAPER * 1.04, boxMask(p, vec2(0.0, h - 0.004), vec2(w + 0.05, 0.008), px));
    // Warm LED under the counter overhang reads as a soft line.
    coat(layer, vec3(1.0, 0.86, 0.62), boxMask(p, vec2(0.0, h - 0.08), vec2(w - 0.02, 0.006), px) * 0.75 * fine);
  }

  float receptionBackdrop(inout vec4 layer, vec2 p, vec2 px, float width, float height,
                          RoomPalette pal, float fine, float tone) {
    float w = width * 0.5;
    if (outside(p, vec2(0.0, height * 0.5), vec2(w + 0.06, height * 0.5), px)) return 0.0;
    // Oak slatted panel from skirting to a brass-leaning cap line.
    float panel = boxMask(p, vec2(0.0, height * 0.5), vec2(w, height * 0.5), px);
    vec3 oak = mix(pal.wood, vec3(0.74, 0.60, 0.43), 0.44) * (1.02 + 0.06 * tone);
    coat(layer, oak * (0.86 + 0.14 * smoothstep(0.0, height, p.y)), panel);
    float slatFreq = 6.2831853 / 0.12;
    float slat = 0.5 + 0.5 * cos(p.x * slatFreq);
    float slatWeight = (1.0 - smoothstep(0.35, 1.15, px.x * slatFreq)) * fine;
    coat(layer, oak * 0.74, slat * panel * slatWeight * 0.34);
    coat(layer, pal.soft * 1.18, boxMask(p, vec2(0.0, height - 0.012), vec2(w + 0.03, 0.014), px));
    // Branded zone: a charcoal plaque with a slim brass bar and a centred mark.
    float plaqueY = height * 0.64;
    float plaque = roundMask(p, vec2(0.0, plaqueY), vec2(min(0.92, w * 0.62), 0.24), 0.02, px);
    coat(layer, pal.accent * 0.85, plaque);
    float brass = boxMask(p, vec2(0.0, plaqueY), vec2(min(0.62, w * 0.42), 0.011), px) * fine;
    float mark = ovalMask(p, vec2(0.0, plaqueY), vec2(0.075, 0.075), px)
      - ovalMask(p, vec2(0.0, plaqueY), vec2(0.046, 0.046), px);
    vec3 brassCol = vec3(0.78, 0.60, 0.33);
    coat(layer, brassCol, max(brass, clamp(mark, 0.0, 1.0)) * plaque);
    // Two picture-light glows wash the panel from above.
    float wash = 0.0;
    for (int i = -1; i <= 1; i += 2) {
      vec2 d = (p - vec2(float(i) * min(1.1, w * 0.72), height - 0.02)) * vec2(1.0, 1.6);
      wash += 1.0 / (1.0 + 9.0 * dot(d, d));
    }
    return wash * panel;
  }

  void loungeSofa(inout vec4 layer, vec2 p, vec2 px, float width, RoomPalette pal, float fine) {
    float w = width * 0.5;
    if (outside(p, vec2(0.0, 0.42), vec2(w, 0.42), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(w, 0.04), px + 0.022) * 0.3);
    coat(layer, vec3(0.78, 0.60, 0.33) * 0.8, boxMask(vec2(abs(p.x), p.y), vec2(w - 0.1, 0.075), vec2(0.014, 0.06), px));
    vec3 cloth = pal.fabric * 0.94;
    coat(layer, cloth * 0.64, roundMask(p, vec2(0.0, 0.23), vec2(w - 0.02, 0.095), 0.03, px));
    coat(layer, cloth * mix(0.8, 1.04, smoothstep(0.3, 0.84, p.y)), roundMask(p, vec2(0.0, 0.53), vec2(w - 0.015, 0.31), 0.07, px));
    coat(layer, cloth * 1.07, roundMask(vec2(abs(p.x), p.y), vec2(w * 0.47, 0.60), vec2(w * 0.40, 0.165), 0.05, px));
    coat(layer, cloth * 0.78, roundMask(vec2(abs(p.x), p.y), vec2(w - 0.08, 0.46), vec2(0.08, 0.18), 0.05, px));
    // One charcoal cushion per sofa, centred: tidy, not a lived-in scatter.
    coat(layer, pal.accent, roundMask(p, vec2(0.0, 0.57), vec2(0.17, 0.15), 0.03, px) * 0.9);
    if (fine > 0.01) coat(layer, cloth * 1.18, boxMask(p, vec2(0.0, 0.84 - 0.03), vec2(w - 0.09, 0.009), px) * fine);
  }

  void roundTable(inout vec4 layer, vec2 p, vec2 px, RoomPalette pal) {
    if (outside(p, vec2(0.0, 0.23), vec2(0.42, 0.23), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.025), vec2(0.25, 0.035), px + 0.018) * 0.24);
    coat(layer, pal.accent * 0.9, taperMask(p, vec2(0.0, 0.2), vec2(0.17, 0.18), 0.5, px));
    coat(layer, pal.wall * 0.9, ovalMask(p, vec2(0.0, 0.40), vec2(0.42, 0.045), px));
    coat(layer, PAPER * 1.03, ovalMask(p, vec2(0.0, 0.42), vec2(0.42, 0.04), px));
  }

  void planter(inout vec4 layer, vec2 p, vec2 px, RoomPalette pal, float fine) {
    // Bounds cover the whole leaf spread so no blade is clipped at the edge.
    if (outside(p, vec2(0.0, 0.85), vec2(0.62, 0.85), px)) return;
    coat(layer, INK, ovalMask(p, vec2(0.0, 0.02), vec2(0.26, 0.03), px + 0.02) * 0.26);
    coat(layer, pal.accent * 0.92, taperMask(p, vec2(0.0, 0.3), vec2(0.22, 0.28), 0.86, px));
    coat(layer, pal.accent * 1.25, boxMask(p, vec2(0.0, 0.575), vec2(0.225, 0.012), px));
    vec3 leaf = vec3(0.19, 0.30, 0.19);
    // Five broad arching leaves, each a tapered blade from the pot's crown.
    for (int i = 0; i < 5; i++) {
      float a = (float(i) - 2.0) * 0.36;
      vec2 q = p - vec2(0.0, 0.6);
      vec2 dir = vec2(sin(a), cos(a));
      vec2 nrm = vec2(dir.y, -dir.x);
      float along = dot(q, dir);
      float across = dot(q, nrm);
      float len = 1.05 - 0.15 * abs(float(i) - 2.0);
      float t = clamp(along / len, 0.0, 1.0);
      float halfW = 0.11 * sin(3.14159 * (0.1 + 0.9 * t));
      float blade = (1.0 - smoothstep(halfW - px.x, halfW + px.x, abs(across)))
        * step(0.0, along) * (1.0 - smoothstep(len - px.y, len + px.y, along));
      coat(layer, leaf * (0.8 + 0.4 * t), blade * (0.75 + 0.25 * fine));
    }
  }

  float pendants(inout vec4 layer, vec2 p, vec2 px, float width, float height, RoomPalette pal, float fine) {
    float glow = 0.0;
    float spacing = 0.72;
    float n = floor(min(5.0, max(2.0, width / spacing)));
    for (int i = 0; i < 5; i++) {
      if (float(i) >= n) break;
      float x = (float(i) - (n - 1.0) * 0.5) * spacing;
      vec2 q = p - vec2(x, 0.0);
      float dropY = height - 0.55;
      coat(layer, INK * 1.4, boxMask(q, vec2(0.0, height - 0.26), vec2(0.004, 0.28), px) * fine);
      float shade = ovalMask(q, vec2(0.0, dropY), vec2(0.075, 0.075), px);
      coat(layer, vec3(0.78, 0.60, 0.33) * 0.9, shade);
      coat(layer, vec3(1.0, 0.92, 0.78), ovalMask(q, vec2(0.0, dropY - 0.02), vec2(0.045, 0.045), px));
      glow += shade;
    }
    return glow;
  }

  void lobbyTemplate(vec2 rear, vec2 mid, vec2 rpx, vec2 mpx, float halfWidth, float roomHeight,
                     float fine, RoomPalette pal, out vec4 backLayer, out vec4 furniture,
                     out vec3 lampAnchor, out float backGlow, out float middleGlow) {
    backLayer = vec4(0.0);
    furniture = vec4(0.0);
    float a = vStyle.y * halfWidth;
    float b = vStyle.z * halfWidth;
    float tone = vRoomFinish.y;
    // Reception centred on the main anchor. The two narrow sidelights that
    // flank the entrance doors keep a slimmer desk and backdrop, so a planter
    // fits on each side inside the room instead of falling off its edges.
    float deskMax = max(1.6, min(3.2, halfWidth * 2.0 - 1.6));
    float deskW = clamp(vStyle.w * halfWidth * 2.0, 1.6, deskMax);
    float backdropW = min(deskW + 1.2, halfWidth * 2.0 - 0.4);
    // A planter needs its own 1.24 m footprint clear of the desk, so the narrow
    // entrance sidelights stay uncluttered and only wide halls get planting.
    float planterReach = deskW * 0.5 + 0.70;
    bool plantersFit = halfWidth >= planterReach + 0.62;
    vec2 ar = vec2(rear.x - a, rear.y);
    vec2 am = vec2(mid.x - a, mid.y);
    float backdropH = min(roomHeight - 0.32, 3.1);
    float wash = receptionBackdrop(backLayer, ar, rpx, backdropW, backdropH, pal, fine, tone);
    // Lounge pair on the secondary anchor, when the hall is wide enough.
    bool lounge = abs(a - b) > 0.01;
    if (!lounge && plantersFit) {
      // Drawn before the desk so the desk sits in front of the planters.
      float planterX = min(planterReach, halfWidth - 0.67);
      planter(backLayer, ar - vec2(planterX, 0.0), rpx, pal, fine);
      planter(backLayer, ar + vec2(planterX, 0.0), rpx, pal, fine);
    }
    receptionDesk(backLayer, ar, rpx, deskW, pal, fine);
    // Pendant row hangs in the mid plane over the desk.
    float pendantGlow = pendants(furniture, am, mpx, deskW + 0.6, roomHeight, pal, fine);
    if (lounge) {
      vec2 bm = vec2(mid.x - b, mid.y);
      vec2 br = vec2(rear.x - b, rear.y);
      artwork(backLayer, br - vec2(0.0, 1.78), rpx, 1.34, 1.0, pal, fine);
      // A planter marks the step from reception into the lounge.
      planter(backLayer, br + vec2(sign(b - a) * 1.18, 0.0), rpx, pal, fine);
      loungeSofa(furniture, bm - vec2(0.74, 0.0), mpx, 1.24, pal, fine);
      loungeSofa(furniture, bm + vec2(0.74, 0.0), mpx, 1.24, pal, fine);
      roundTable(furniture, bm, mpx, pal);
    }
    backGlow = wash * 0.55;
    middleGlow = pendantGlow;
    lampAnchor = vec3(a, roomHeight - 0.55, 1.0);
  }

  void roomTemplate(float kind, vec2 rear, vec2 mid, vec2 rpx, vec2 mpx,
                    float halfWidth, float fine, RoomPalette pal,
                    out vec4 backLayer, out vec4 furniture, out vec3 lampAnchor,
                    out float backGlow, out float middleGlow) {
    backLayer = vec4(0.0);
    furniture = vec4(0.0);
    backGlow = 0.0;
    middleGlow = 0.0;
    vec4 recipe = roomRecipe(kind);
    float scale = max(0.1, vStyle.w * halfWidth * 2.0 / recipe.x);
    float a = vStyle.y * halfWidth;
    float b = vStyle.z * halfWidth;
    float side = vPalette.w < 4.0 ? 1.0 : -1.0;
    float style = mod(floor(vPalette.w + 0.01), 4.0);
    float design = mod(floor(vPalette.z + 0.01), 4.0);
    float richness = floor(vPalette.z / 4.0);
    bool extra = abs(a - b) > 0.01;
    vec2 ar = vec2((rear.x - a) * side, rear.y) / scale;
    vec2 am = vec2((mid.x - a) * side, mid.y) / scale;
    vec2 br = vec2((rear.x - b) * side, rear.y) / scale;
    vec2 bm = vec2((mid.x - b) * side, mid.y) / scale;
    vec2 rp = rpx / scale;
    vec2 mp = mpx / scale;
    vec3 cloth = mix(pal.fabric * 0.95, pal.accent, step(0.57, vPalette.y));
    vec2 lightPosition = vec2(recipe.x * 0.5 + 0.32, 0.0);
    float lightZone = 0.0;
    bool tableLight = false;

    if (kind < 0.5 || (kind > 2.5 && kind < 3.5)) {
      bed(backLayer, ar, rp, recipe.x, pal, fine, style);
      vec2 bedside = vec2(recipe.x * 0.5 + 0.29, 0.0);
      cabinet(backLayer, ar - bedside, rp, 0.42, 0.49, pal, fine, false);
      lightPosition = bedside + vec2(0.0, 0.496);
      tableLight = true;
      artwork(backLayer, ar - vec2(0.0, 1.64), rp, 1.12, design, pal, fine);
      if (extra && kind > 2.5) {
        mediaWall(backLayer, br, rp, 1.74, pal, fine);
        sofa(furniture, bm, mp, 1.38, cloth, pal, fine, true, style);
      } else if (extra && richness > 0.5) {
        cabinet(backLayer, br, rp, 0.66, 1.68, pal, fine, richness > 1.5);
      }
    } else if (kind < 2.5) {
      mediaWall(backLayer, ar, rp, recipe.x * 1.20, pal, fine);
      sofa(furniture, am, mp, recipe.x, cloth, pal, fine, true, style);
      lightZone = 1.0;
      if (extra && kind > 1.5) {
        if (richness > 1.5) cabinet(backLayer, br, rp, 1.60, 0.64, pal, fine, false);
        dining(furniture, bm, mp, pal, fine, style);
        artwork(backLayer, br - vec2(0.0, 1.66), rp, 1.03, design, pal, fine);
      } else if (extra && richness > 0.5) {
        armchair(furniture, bm, mp, 0.82, pal.soft * 0.78, pal, fine, -1.0);
        artwork(backLayer, br - vec2(0.0, 1.62), rp, 0.72, design, pal, fine);
      }
    } else if (kind < 4.5) {
      desk(backLayer, ar, rp, recipe.x, pal, fine);
      deskChair(furniture, am, mp, pal);
      lightPosition = vec2(recipe.x * 0.5 - 0.18, DESK_H + 0.025);
      tableLight = true;
      artwork(backLayer, ar - vec2(0.0, 1.70), rp, 0.78, design, pal, fine);
      if (extra && richness > 0.5) cabinet(backLayer, br, rp, 0.66, 1.68, pal, fine, richness > 1.5);
    } else if (kind < 5.5) {
      if (style > 0.5 && style < 1.5) {
        armchair(furniture, am + vec2(0.40, 0.0), mp, 0.85, cloth, pal, fine, 1.0);
        lowTable(furniture, am - vec2(0.43, 0.0), mp, 0.52, pal);
      } else {
        armchair(furniture, am + vec2(0.76, 0.0), mp, 0.77, cloth, pal, fine, 1.0);
        armchair(furniture, am - vec2(0.76, 0.0), mp, 0.77, cloth, pal, fine, -1.0);
        lowTable(furniture, am, mp, 0.55, pal);
      }
      lightZone = 1.0;
      artwork(backLayer, ar - vec2(0.0, 1.64), rp, 1.16, design, pal, fine);
      if (extra && richness > 1.5) cabinet(backLayer, br, rp, 0.64, 1.45, pal, fine, false);
    } else {
      if (extra) doorway(backLayer, br, rp, pal, fine);
      cabinet(backLayer, ar, rp, recipe.x, 0.70, pal, fine, false);
      artwork(backLayer, ar - vec2(0.0, 1.53), rp, 0.72, design, pal, fine);
      lightPosition = vec2(recipe.x * 0.29, 0.706);
      tableLight = true;
    }

    if (lightZone < 0.5) backGlow = lamp(backLayer, ar - lightPosition, rp, tableLight, style, pal);
    else middleGlow = lamp(furniture, am - lightPosition, mp, false, style, pal);
    float shadeY = lightPosition.y + (tableLight ? TABLE_LAMP_H - 0.095 : FLOOR_LAMP_H - 0.13);
    lampAnchor = vec3(a + side * lightPosition.x * scale, shadeY * scale, lightZone);
  }
`;