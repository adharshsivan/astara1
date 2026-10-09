import { INTERIOR_COLOR_BALANCE, INTERIOR_PALETTE_GLSL } from './interiorArt';
import { INTERIOR_FINISH_GLSL } from './interiorFinish';
import { INTERIOR_FURNITURE_GLSL } from './interiorFurniture';

// V3 parallax transport is retained; only the shared room artwork changes.
export const interiorVertexShader = /* glsl */ `
  uniform mat4 uWorldToLocal;
  in vec3 aTangent;
  in vec4 aRoomMap;
  in vec4 aUnitInfo;
  in vec4 aRoomConfig;
  in vec4 aRoomStyle;
  in vec4 aPalette;
  in vec4 aRoomFinish;
  in vec3 aUnitOrigin;

  out vec2 vPaneUV;
  out vec2 vRoomUV;
  out vec3 vViewTS;
  flat out vec4 vInfo;
  flat out vec4 vConfig;
  flat out vec4 vStyle;
  flat out vec4 vPalette;
  flat out vec4 vRoomFinish;
  flat out vec2 vDistanceFacing;
  flat out float vPaneAspect;

  void main() {
    vec3 localCamera = (uWorldToLocal * vec4(cameraPosition, 1.0)).xyz;
    vec3 tangent = normalize(aTangent);
    vec3 outward = normalize(normal);
    vec3 bitangent = normalize(cross(outward, tangent));
    vec3 toCamera = localCamera - position;
    vViewTS = vec3(dot(toCamera, tangent), dot(toCamera, bitangent), dot(toCamera, outward));
    vPaneUV = uv;
    vRoomUV = uv * aRoomMap.xz + aRoomMap.yw;
    vInfo = aUnitInfo;
    vConfig = aRoomConfig;
    vStyle = aRoomStyle;
    vPalette = aPalette;
    vRoomFinish = aRoomFinish;
    vPaneAspect = aRoomConfig.x * aRoomMap.x / max(aRoomMap.z, 0.001);
    vec3 unitWorld = (modelMatrix * vec4(aUnitOrigin, 1.0)).xyz;
    vec3 unitView = localCamera - aUnitOrigin;
    vDistanceFacing = vec2(length(cameraPosition - unitWorld), abs(dot(normalize(unitView), outward)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const interiorFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;
  // LOKAM_INTERIOR_V3
  uniform float uNight;
  uniform float uDepth;
  uniform float uDebugMode;
  uniform vec3 uSkyColor;
  in vec2 vPaneUV;
  in vec2 vRoomUV;
  in vec3 vViewTS;
  flat in vec4 vInfo;
  flat in vec4 vConfig;
  flat in vec4 vStyle;
  flat in vec4 vPalette;
  flat in vec4 vRoomFinish;
  flat in vec2 vDistanceFacing;
  flat in float vPaneAspect;
  out vec4 interiorFragment;
  #define gl_FragColor interiorFragment

  // Explicit footprints are computed before template branches. Thin details are
  // integrated across a pixel, not toggled by an unfiltered step or noisy alpha.
  float boxMask(vec2 p, vec2 c, vec2 h, vec2 pixel) {
    vec2 aa = max(pixel * 0.7, vec2(0.0006));
    vec2 edge = abs(p - c) - h;
    vec2 cover = 1.0 - smoothstep(-aa, aa, edge);
    return cover.x * cover.y;
  }

  float roundMask(vec2 p, vec2 c, vec2 h, float r, vec2 pixel) {
    vec2 q = abs(p - c) - h + r;
    float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
    float aa = max(max(pixel.x, pixel.y) * 0.7, 0.0006);
    return 1.0 - smoothstep(-aa, aa, d);
  }

  float ovalMask(vec2 p, vec2 c, vec2 h, vec2 pixel) {
    float d = length((p - c) / h) - 1.0;
    float aa = max(length(pixel / h) * 0.65, 0.001);
    return 1.0 - smoothstep(-aa, aa, d);
  }

  ${INTERIOR_PALETTE_GLSL}
  ${INTERIOR_FINISH_GLSL}
  ${INTERIOR_FURNITURE_GLSL}

  float frameMask(vec2 uv, float aspect, vec2 pixel) {
    vec2 distanceToEdge = min(uv, 1.0 - uv);
    vec2 thickness = vec2(0.0288 / max(aspect, 0.4), 0.0288);
    vec2 edge = 1.0 - smoothstep(thickness - pixel, thickness + pixel, distanceToEdge);
    float frame = max(edge.x, edge.y);
    float divisions = aspect > 1.4 ? 3.0 : aspect > 0.8 ? 2.0 : 1.0;
    float grid = fract(uv.x * divisions);
    float gridAA = pixel.x * divisions;
    float halfWidth = 0.0162 * divisions / max(aspect, 0.4);
    float mullion = 1.0 - smoothstep(halfWidth - gridAA, halfWidth + gridAA, min(grid, 1.0 - grid));
    frame = max(frame, mullion * step(1.5, divisions));
    return max(frame, 1.0 - smoothstep(0.0162 - pixel.y, 0.0162 + pixel.y, abs(uv.y - 0.78)));
  }

  vec2 boundedSlope(vec3 view, float strength) {
    vec3 v = view / max(length(view), 0.0001);
    return clamp(-v.xy / max(abs(v.z), 0.22), vec2(-3.25), vec2(3.25)) * strength;
  }

  void main() {
    float halfW = max(vConfig.x, 0.25);
    float depth = max(vConfig.y, 0.3) * clamp(uDepth / 1.7, 0.6, 1.4);
    float roomHalfHeight = max(vConfig.z, 0.25);
    float dayLift = vConfig.w;
    float kind = vInfo.x;
    float bright = vInfo.z;
    float night = clamp(uNight, 0.0, 1.0);
    float detail = 1.0 - smoothstep(65.0, 115.0, vDistanceFacing.x);
    float fine = 1.0 - smoothstep(25.0, 65.0, vDistanceFacing.x);
    float angleFade = smoothstep(0.08, 0.40, vDistanceFacing.y);
    float strength = (0.32 + 0.68 * fine) * detail * angleFade;
    vec3 view = vViewTS / max(length(vViewTS), 0.0001);
    vec2 slope = boundedSlope(vViewTS, strength);
    vec2 origin = vec2((vRoomUV.x * 2.0 - 1.0) * halfW, vRoomUV.y * 2.0 - 1.0);

    // The three virtual layers are separated behind the existing facade quad.
    // Glass sheen is fused into this opaque draw, avoiding any coplanar overlay.
    float frontDepth = 0.22 / roomHalfHeight;
    float middleDepth = frontDepth + depth * 0.58;
    float rearDepth = frontDepth + depth;
    vec2 wallTime = vec2(10000.0);
    if (strength > 0.0001) {
      vec2 safeSlope = mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), slope)) * max(abs(slope), vec2(0.0001));
      vec2 roomEdge = mix(-vec2(halfW, 1.0), vec2(halfW, 1.0), step(vec2(0.0), slope));
      wallTime = (roomEdge - origin) / safeSlope;
      wallTime = mix(vec2(10000.0), wallTime, step(vec2(0.0001), abs(slope)));
    }
    float exitTime = max(0.0, min(rearDepth, min(wallTime.x, wallTime.y)));
    vec2 rearHit = origin + slope * exitTime;
    float backFace = step(rearDepth - 0.0001, exitTime);
    float horizontalFace = (1.0 - backFace) * step(wallTime.y, wallTime.x);
    float floorFace = horizontalFace * (1.0 - step(0.0, rearHit.y));
    float ceilingFace = horizontalFace * step(0.0, rearHit.y);
    float sideFace = 1.0 - max(backFace, horizontalFace);

    float roomHalfWidth = halfW * roomHalfHeight;
    vec2 middleUnit = (origin + slope * middleDepth) / vec2(halfW, 1.0);
    vec2 rear = rearHit * roomHalfHeight + vec2(0.0, roomHalfHeight);
    vec2 middle = middleUnit * vec2(roomHalfWidth, roomHalfHeight) + vec2(0.0, roomHalfHeight);
    vec2 foreground = (origin + slope * frontDepth) / vec2(halfW, 1.0);
    vec2 floorPoint = vec2(rearHit.x, exitTime) * roomHalfHeight;
    vec2 rearPixel = max(fwidth(rear), vec2(0.0005));
    vec2 middlePixel = max(fwidth(middle), vec2(0.0005));
    vec2 frontPixel = max(fwidth(foreground), vec2(0.0005));
    vec2 floorPixel = max(fwidth(floorPoint), vec2(0.001));
    vec2 panePixel = max(fwidth(vPaneUV), vec2(0.00001));

    RoomPalette pal = roomPalette(vInfo.y);
    pal.wood *= 0.94 + 0.12 * vPalette.x;

    /* ---- Wall finish: one decision per shared room unit ----
     * Neutral plaster carries most rooms. A muted accent only tints the rear
     * wall, so the returns stay quiet and the building never reads as painted
     * per window. Feature treatments stay inside a bounded area. */
    WallFinish finish = wallFinish(vRoomFinish.x, vRoomFinish.y, pal);
    vec3 rearWall = mix(pal.wall, finish.colour, finish.strength);
    vec3 sideWall = mix(pal.wall, finish.colour, finish.strength * 0.32);
    float depthShade = 1.0 - 0.13 * clamp(exitTime / rearDepth, 0.0, 1.0);
    vec3 floorCol = pal.wood * 0.74;
    vec3 shell = mix(sideWall, rearWall, backFace);
    shell = mix(shell, floorCol, floorFace);
    shell = mix(shell, mix(PAPER, rearWall, 0.35), ceilingFace);

    // Slight variation: a picture rail with a marginally deeper lower wall.
    if (finish.treatment > 0.5 && finish.treatment < 1.5) {
      float railY = roomHalfHeight * 2.0 - 0.36;
      float below = (1.0 - smoothstep(railY - rearPixel.y, railY + rearPixel.y, rear.y)) * backFace;
      shell = mix(shell, rearWall * 0.935, below * 0.85);
      float railLine = 1.0 - smoothstep(0.011 - rearPixel.y, 0.011 + rearPixel.y, abs(rear.y - railY));
      shell = mix(shell, rearWall * 0.70, railLine * backFace);
    }
    // Two-tone dado: the accent family at low chroma, never a saturated band.
    if (finish.treatment > 1.5) {
      float dadoTop = min(1.12, roomHalfHeight * 2.0 * ${(INTERIOR_COLOR_BALANCE.accent + 0.14).toFixed(2)});
      float dado = (1.0 - smoothstep(dadoTop - rearPixel.y, dadoTop + rearPixel.y, rear.y)) * backFace;
      shell = mix(shell, mix(rearWall * 0.86, pal.accent * 0.9, 0.34), dado);
    }

    // Occasional oak panel behind the bed or the media wall — a bounded field
    // centred on the main furniture anchor, with footprint-attenuated slats.
    // The lobby draws its own reception backdrop, so it skips this generic panel.
    if (finish.panelled > 0.5 && detail > 0.001 && kind < 6.5) {
      float panelHalf = clamp(vStyle.w * roomHalfWidth + 0.34, 0.42, roomHalfWidth - 0.10);
      float panelX = clamp(vStyle.y * roomHalfWidth,
        -roomHalfWidth + panelHalf + 0.05, roomHalfWidth - panelHalf - 0.05);
      float panelTop = min(2.34, roomHalfHeight * 2.0 - 0.10);
      float inside = boxMask(rear, vec2(panelX, panelTop * 0.5), vec2(panelHalf, panelTop * 0.5), rearPixel) * backFace;
      vec3 oak = mix(pal.wood, vec3(0.74, 0.60, 0.43), 0.44) * 1.10;
      shell = mix(shell, oak * (0.88 + 0.12 * smoothstep(0.0, panelTop, rear.y)), inside);
      float slatFreq = 6.2831853 / 0.155;
      float slat = 0.5 + 0.5 * cos((rear.x - panelX) * slatFreq);
      float slatWeight = (1.0 - smoothstep(0.35, 1.15, rearPixel.x * slatFreq)) * detail;
      shell = mix(shell, oak * 0.78, slat * inside * slatWeight * 0.30);
      float capLine = 1.0 - smoothstep(0.012 - rearPixel.y, 0.012 + rearPixel.y, abs(rear.y - panelTop));
      shell = mix(shell, oak * 1.24, capLine * inside);
    }

    // Occasional plaster feature: broad low-frequency mottling in one panel.
    if (finish.textured > 0.5 && detail > 0.001) {
      float mottle = sin(rear.x * 2.6 + 1.1) * sin(rear.y * 3.3 - 0.6)
        + 0.5 * sin(rear.x * 4.9 - rear.y * 3.8 + 2.0);
      float mottleWeight = (1.0 - smoothstep(0.02, 0.16, rearPixel.x * 4.9)) * backFace;
      shell *= 1.0 + 0.030 * mottle * mottleWeight;
      float panelHalf = min(roomHalfWidth * 0.60, vStyle.w * roomHalfWidth + 0.58);
      float band = boxMask(rear, vec2(vStyle.y * roomHalfWidth, roomHalfHeight),
        vec2(panelHalf, roomHalfHeight * 0.84), rearPixel);
      shell = mix(shell * 1.028, shell * 0.968, band * backFace * 0.7);
    }

    shell *= (1.0 - 0.16 * sideFace) * depthShade;
    float corner = min(roomHalfWidth - abs(rear.x), roomHalfHeight * 2.0 - rear.y);
    shell *= 0.84 + 0.16 * smoothstep(0.0, 0.36, max(corner, 0.0));
    shell *= 1.0 - backFace * 0.12 * (1.0 - smoothstep(0.0, 0.25, rear.y));
    float skirting = boxMask(rear, vec2(0.0, 0.044), vec2(roomHalfWidth, 0.044), rearPixel) * backFace;
    shell = mix(shell, rearWall * 0.75, skirting);

    vec4 backLayer = vec4(0.0);
    vec4 furniture = vec4(0.0);
    vec3 lampAnchor = vec3(0.0);
    float backGlow = 0.0;
    float middleGlow = 0.0;
    bool isLobby = kind > 6.5;
    if (detail > 0.001) {
      if (backFace > 0.5 || exitTime > middleDepth - 0.03) {
        if (isLobby) {
          lobbyTemplate(rear, middle, rearPixel, middlePixel, roomHalfWidth, roomHalfHeight * 2.0,
            fine, pal, backLayer, furniture, lampAnchor, backGlow, middleGlow);
        } else {
          roomTemplate(kind, rear, middle, rearPixel, middlePixel, roomHalfWidth,
            fine, pal, backLayer, furniture, lampAnchor, backGlow, middleGlow);
        }
      }

      // The existing box-ray floor hit supplies rugs and contact shadows.
      // No fourth depth sample, texture, light, or geometry is introduced.
      vec4 recipe = roomRecipe(kind);
      float scale = max(0.1, vStyle.w * roomHalfWidth * 2.0 / recipe.x);
      float style = mod(floor(vPalette.w + 0.01), 4.0);
      float richness = floor(vPalette.z / 4.0);
      float a = vStyle.y * roomHalfWidth;
      float b = vStyle.z * roomHalfWidth;
      bool bedroom = kind < 0.5 || (kind > 2.5 && kind < 3.5);
      float mainZ = (bedroom ? rearDepth : middleDepth) * roomHalfHeight;
      if (floorFace > 0.01 && isLobby) {
        // Lobby floor: large-format honed stone with a darker inlay border and a
        // centred runner. Grout lines follow the pixel footprint, no texture.
        float tileFreq = 6.2831853 / 1.2;
        float gx = 0.5 + 0.5 * cos(floorPoint.x * tileFreq);
        float gz = 0.5 + 0.5 * cos(floorPoint.y * tileFreq);
        float groutWeight = (1.0 - smoothstep(0.3, 1.1, max(floorPixel.x, floorPixel.y) * tileFreq)) * detail;
        float grout = max(smoothstep(0.985, 1.0, gx), smoothstep(0.985, 1.0, gz)) * groutWeight;
        vec3 stone = mix(pal.wall, PAPER, 0.35) * 1.02;
        shell = mix(shell, stone, floorFace);
        shell = mix(shell, stone * 0.86, grout * floorFace);
        float border = 1.0 - boxMask(floorPoint, vec2(0.0, (frontDepth + rearDepth) * 0.5 * roomHalfHeight),
          vec2(roomHalfWidth - 0.55, (rearDepth - frontDepth) * 0.5 * roomHalfHeight - 0.5), floorPixel);
        shell = mix(shell, pal.accent * 0.9, border * floorFace * 0.55);
        float runner = roundMask(floorPoint, vec2(a, mainZ * 0.72), vec2(min(1.3, roomHalfWidth * 0.3), mainZ * 0.42), 0.04, floorPixel);
        shell = mix(shell, mix(pal.soft, pal.fabric, 0.5) * 0.7, runner * floorFace * detail);
      } else if (floorFace > 0.01) {
        if (richness > 0.5 && (style < 0.5 || (style > 1.5 && style < 2.5)) && kind < 5.5) {
          float rugHalf = min(vStyle.w * roomHalfWidth + 0.22 * scale, roomHalfWidth - abs(a) - 0.10);
          float rugZ = clamp(mainZ - (bedroom ? 0.70 * scale : 0.22 * scale),
            frontDepth * roomHalfHeight + 0.62 * scale, rearDepth * roomHalfHeight - 0.62 * scale);
          vec2 rugCenter = vec2(a, rugZ);
          vec2 rugSize = vec2(max(0.1, rugHalf), 0.60 * scale);
          float rug = roundMask(floorPoint, rugCenter, rugSize, 0.05, floorPixel);
          float innerRug = roundMask(floorPoint, rugCenter, max(rugSize - 0.065 * scale, vec2(0.02)), 0.025, floorPixel);
          shell = mix(shell, pal.accent * 0.48, rug * floorFace * detail);
          shell = mix(shell, mix(pal.fabric, pal.soft, 0.24) * 0.62, innerRug * floorFace * detail);
        }
        float contact = ovalMask(floorPoint, vec2(a, mainZ - 0.025),
          vec2(vStyle.w * roomHalfWidth + 0.03, 0.16 * scale), floorPixel + 0.07);
        bool secondaryVisible = (kind > 1.5 && kind < 3.5) || kind > 5.5
          || (kind > 4.5 ? richness > 1.5 : richness > 0.5);
        if (abs(a - b) > 0.01 && secondaryVisible) {
          float secondZ = (kind > 3.5 ? rearDepth : middleDepth) * roomHalfHeight;
          contact = max(contact, ovalMask(floorPoint, vec2(b, secondZ - 0.025),
            vec2(recipe.w * scale * 0.45, 0.13 * scale), floorPixel + 0.055));
        }
        shell *= 1.0 - 0.22 * contact * floorFace * detail;
      }
    }
    /* ---- Curtain dressing: one state for the whole shared room unit ----
     * Seven states (none, fully open, half open either side, mostly closed,
     * sheer, blackout) over six soft fabrics. Coverage, not per-pane flags, is
     * what makes one apartment read as open and the next as private. */
    float curtainMode = vInfo.w;
    float opening = vStyle.x;
    CurtainFabric fabric = curtainFabric(vRoomFinish.z);
    float fullness = vRoomFinish.w;
    float unitU = foreground.x * 0.5 + 0.5;
    float curtainAA = max(frontPixel.x, 0.003);
    float leftDrape = 1.0 - smoothstep(opening - curtainAA, opening + curtainAA, unitU);
    float rightDrape = smoothstep(1.0 - opening - curtainAA, 1.0 - opening + curtainAA, unitU);
    float inWindow = boxMask(foreground, vec2(0.0, -0.012), vec2(1.0, 0.978), frontPixel);

    float coverage = 0.0;
    float blackout = 0.0;
    if (curtainMode > 0.5 && curtainMode < 1.5) coverage = max(leftDrape, rightDrape);
    else if (curtainMode > 1.5 && curtainMode < 2.5) coverage = leftDrape;
    else if (curtainMode > 2.5 && curtainMode < 3.5) coverage = rightDrape;
    else if (curtainMode > 3.5 && curtainMode < 4.5) coverage = max(leftDrape, rightDrape);
    else if (curtainMode > 4.5) {
      coverage = 1.0;
      blackout = curtainMode > 5.5 ? 1.0 : 0.0;
    }
    coverage *= inWindow;

    // An opaque drape removes the room; a sheer only scatters it, so privacy
    // never collapses into a flat white pane or hides an open room by accident.
    // The full-height sheer state overrides the fabric's drape opacity, which is
    // what lets any of the six colours hang as a translucent panel.
    float sheerState = curtainMode > 4.5 && curtainMode < 5.5 ? 1.0 : 0.0;
    float translucent = max(fabric.sheer, sheerState) * (1.0 - blackout);
    float fabricOpacity = mix(mix(fabric.opacity, 0.985, blackout), 0.36, sheerState);
    float veil = coverage * fabricOpacity;
    float scatter = coverage * translucent;
    float privacy = curtainPrivacy(curtainMode, opening);

    float backVisible = backFace * detail * (1.0 - veil * 0.92);
    float furnitureVisible = 1.0 - smoothstep(exitTime - 0.03, exitTime + 0.03, middleDepth);
    furnitureVisible *= boxMask(middleUnit, vec2(0.0), vec2(0.995), middlePixel / vec2(roomHalfWidth, roomHalfHeight)) * detail;
    furnitureVisible *= 1.0 - veil * 0.94;
    vec3 surface = shell * (1.0 - backLayer.a * backVisible) + backLayer.rgb * backVisible * 0.93;
    surface = surface * (1.0 - furniture.a * furnitureVisible) + furniture.rgb * furnitureVisible;
    // Diffusion through a sheer: the room behind keeps its shapes, loses contrast.
    surface = mix(surface, vec3(dot(surface, vec3(0.34, 0.5, 0.16))), scatter * 0.34);
    surface *= 1.0 - scatter * 0.07;

    // Unlit rooms at night: collapse furniture toward faint silhouettes.
    // darkRoom is 1 for lights-off (bright ~0.035-0.065), 0 for dim/lit.
    // Gated by night so daytime views keep full interior legibility.
    // darkVary gives deterministic per-room variation from the shared palette
    // attribute - some off rooms read as faint shapes, others almost vanish.
    float darkRoom = 1.0 - smoothstep(0.07, 0.18, bright);
    float darkVary = 0.82 + 0.36 * vPalette.x;
    float flatAmount = darkRoom * night * 0.82;
    if (flatAmount > 0.001) {
      vec3 flatLum = vec3(dot(surface, vec3(0.34, 0.5, 0.16)));
      vec3 flatTarget = mix(shell, flatLum, 0.38);
      surface = mix(surface, flatTarget, flatAmount);
    }

    /* ---- Curtain composite: folds, header, hem ----
     * Fold frequency follows the fabric and its fullness, and is attenuated by
     * the pixel footprint exactly like the other thin detail in this shader. */
    float foldFreq = mix(fabric.folds, 7.0, sheerState) * (0.78 + 0.44 * fullness);
    float foldPhase = foreground.x * roomHalfWidth * foldFreq;
    float foldWeight = (1.0 - smoothstep(0.45, 1.35, frontPixel.x * roomHalfWidth * foldFreq)) * detail;
    float fold = 0.5 + 0.5 * cos(foldPhase);
    // A gathered drape pleats deepest where the fabric stacks; a full-height
    // sheer or blackout panel hangs evenly across the whole opening.
    float stackBias = 0.62 + 0.38 * smoothstep(opening, opening + 0.30, abs(unitU - 0.5) * 2.0);
    float gather = mix(stackBias, 1.0, max(translucent, blackout));
    vec3 curtainCol = fabric.colour
      * (1.0 - 0.14 * (1.0 - fold) * foldWeight * (0.45 + 0.55 * fullness) * gather);
    curtainCol *= mix(1.0, 0.72, blackout);
    float header = boxMask(foreground, vec2(0.0, 0.925), vec2(1.0, 0.030), frontPixel);
    float hem = boxMask(foreground, vec2(0.0, -0.93), vec2(1.0, 0.045), frontPixel);
    curtainCol *= 1.0 - 0.13 * header - 0.09 * hem;
    float curtainOpacity = veil;
    surface = mix(surface, curtainCol, curtainOpacity);

    float lit = smoothstep(0.1, 0.7, bright);
    float dayLevel = mix(0.48, 0.38, exitTime / rearDepth);
    dayLevel = mix(dayLevel, max(dayLevel, 0.46), dayLift);
    // Dressed rooms sit calmer; open rooms stay bright. Privacy, not occupancy.
    dayLevel *= 1.0 - 0.10 * privacy;
    // The lobby is lit as a public hall: brighter in the day, a warm premium
    // mood at night, and a soft ceiling wash so the hall reads taller.
    if (isLobby) {
      dayLevel *= 1.16;
      float ceilingWash = smoothstep(roomHalfHeight * 1.1, roomHalfHeight * 2.0, rear.y) * backFace;
      dayLevel *= 1.0 + 0.08 * ceilingWash;
    }
    vec3 daylight = surface * vec3(0.96, 0.985, 1.0) * dayLevel;
    // Unlit base is about 5x darker than before, with per-room variation.
    // Lit and dim paths are numerically unchanged.
    float baseNightLevel = 0.052 + bright * 0.84;
    float darkNightLevel = (0.007 + bright * 0.22) * darkVary;
    float nightLevel = mix(baseNightLevel, darkNightLevel, darkRoom) * (1.0 - 0.20 * privacy) * (isLobby ? 1.12 : 1.0);
    vec3 warmLit = isLobby ? vec3(1.0, 0.91, 0.78)
      : kind > 3.5 && kind < 4.5 ? vec3(0.96, 0.98, 1.0)
      : mix(vec3(1.0, 0.96, 0.89), vec3(1.0, 0.92, 0.83), vPalette.x);
    // Unlit rooms shift toward cool moon and street spill instead of warm lamplight.
    vec3 warmth = mix(warmLit, vec3(0.82, 0.88, 1.0), darkRoom * 0.65);
    vec3 nightRoom = surface * warmth * nightLevel;
    // Preserve a whisper of depth: deepen with distance, then add a faint cool
    // spill that fades quadratically away from the window. Both are smooth
    // analytic terms with no noise, no extra lights and negligible cost.
    float depthT = clamp(exitTime / max(rearDepth, 0.001), 0.0, 1.0);
    nightRoom *= 1.0 - darkRoom * 0.30 * depthT;
    float spillFade = 1.0 - depthT;
    spillFade *= spillFade;
    nightRoom += surface * vec3(0.55, 0.68, 0.85) * (darkRoom * 0.022 * spillFade * darkVary);
    vec2 lampDelta = (mix(rear, middle, lampAnchor.z) - lampAnchor.xy) * vec2(1.3, 0.95);
    float lampPool = 1.0 / (1.0 + 9.0 * dot(lampDelta, lampDelta));
    float rearLightVisible = backVisible * (1.0 - furniture.a * furnitureVisible);
    float lampVisibility = mix(rearLightVisible, furnitureVisible, lampAnchor.z);
    float shadeGlow = backGlow * rearLightVisible + middleGlow * furnitureVisible;
    // A lit room bleeds through a sheer; an opaque drape only glows at its folds.
    // The lobby's pendant row and picture lights are a stronger, wider wash.
    float glowGain = isLobby ? 1.9 : 1.0;
    nightRoom += vec3(1.0, 0.83, 0.61) * lit * (lampPool * 0.035 * glowGain * lampVisibility + shadeGlow * 0.32 * glowGain)
      * (1.0 - curtainOpacity + scatter * 0.55);
    vec3 color = mix(daylight, nightRoom, night);

    float fresnel = pow(1.0 - clamp(abs(view.z), 0.0, 1.0), 3.0);
    vec3 sky = mix(vec3(0.19, 0.26, 0.32), uSkyColor, night);
    float reflection = mix(0.075 + fresnel * 0.40, 0.018 + fresnel * mix(0.76, 0.35, lit), night);
    color = mix(color, sky, reflection);
    float frame = frameMask(vPaneUV, vPaneAspect, panePixel);
    color = mix(color, mix(vec3(0.028, 0.034, 0.042), vec3(0.07, 0.075, 0.085), night), frame);

    if (uDebugMode > 0.5 && uDebugMode < 1.5) {
      color = vec3(0.18) + 0.65 * vec3(vPalette.xy, mod(vPalette.z, 4.0) / 4.0);
      color = mix(color, vec3(0.03), frame);
    } else if (uDebugMode > 3.5 && uDebugMode < 4.5) {
      // Wall finish / curtain dressing: colour by style, brightness by privacy.
      color = vec3(0.16) + 0.62 * vec3(mod(vRoomFinish.x, 8.0) / 7.0,
        floor(vRoomFinish.x / 8.0) / 2.0, vRoomFinish.z / 5.0);
      color *= 0.45 + 0.75 * privacy;
      color = mix(color, vec3(0.03), frame);
    } else if (uDebugMode > 1.5 && uDebugMode < 2.5) {
      color = vec3(0.1, 0.25, 0.75) * backFace;
      color = mix(color, vec3(0.9, 0.58, 0.1), furniture.a * furnitureVisible);
      color = mix(color, vec3(0.18, 0.75, 0.42), curtainOpacity);
      color = mix(color, vec3(0.55, 0.35, 0.85), scatter * 0.6);
    } else if (uDebugMode > 2.5) {
      color = mix(vec3(0.23, 0.31, 0.43), vec3(0.95, 0.68, 0.28), lit);
    }
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
