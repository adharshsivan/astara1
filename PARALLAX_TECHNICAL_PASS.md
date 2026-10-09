# Parallax Interior Technical Pass

## Diagnosis

The inspected implementation had the following concrete instability paths:

| Area | Finding | Correction |
| --- | --- | --- |
| Procedural randomness | Unit seeds up to 100,100 were passed through smooth varyings, multiplied and hashed in the fragment shader. Perspective interpolation rounding could change discrete room decisions across pixels and frames. | Resolve random values once with a 32-bit CPU seed; pass finished values with GLSL 3 `flat` interpolation. No fragment hashes. |
| Furniture edges | All furniture masks ended in hard `step` functions. Sub-pixel poles, table legs and furniture edges had no footprint filtering. | Pixel-integrated box/rounded/oval masks; fade fine details at distance. Derivatives are computed outside room-template branches. |
| Curtains | Nighttime curtain folds used an unfiltered sine pattern. | Broad folds, low contrast, footprint attenuation in both day and night. |
| Grazing angles | Rays divided by components approaching zero. The safety correction only ran during daytime. | Finite denominators in every mode, capped tangent slopes and a smooth grazing fade. |
| Room extent | Unit width was the sum of glazing widths, while offsets used physical centres including mullion gaps. Edge panes could start outside their own room box. | Measure the union of actual pane edges, including gaps. Map every pane to that shared coordinate system. |
| Uneven glazing | Grouping by pane-centre height split taller lobby sidelights away from their actual floor. | Explicit floor IDs, facade orientation and facade-plane grouping. Unequal panes use affine XY mappings into common bounds. |
| Glass depth | Shared transparent architectural glass wrote depth, allowing translucent faces to hide subsequently drawn panes. | Continuous alpha, depth test enabled, depth writes disabled. |
| Interior surfaces | One merged opaque facade mesh; no duplicate interior overlay was present. The tower panes are 0.30 m ahead of the core, podium panes 0.32 m ahead. | Keep those positions unchanged; remove the blanket polygon offset. Audit duplicate quads and room bounds. |

No interior atlas, interior normal map, physical transmission, alphaHash, alpha
dithering, frame-based randomness, or gl_FragCoord-based noise was present.
Increasing texture resolution or adding blur would not fix these causes.

## Rendering Contract

- Existing positions, dimensions, normals, UVs and triangle indices are retained.
- One opaque `Window_ParallaxInterior` ShaderMaterial and one merged facade draw.
- The mild architectural glass sheen remains fused into that shader. No extra
  transparent overlay is added to every window.
- Existing separate door/railing glass stays a shared MeshStandardMaterial with
  `transparent: true`, `depthTest: true`, `depthWrite: false`, `alphaHash: false`.
- Three virtual zones: rear architecture, middle furniture, near-window curtains.
  The foreground is 0.22 m behind the optical plane; furniture and the back wall
  are progressively deeper. These are analytical shader samples, not meshes.
- No ray-marching loop, POM, added textures, interior lights, or reflection pass.
- Room metadata uses 11 total vertex attribute locations (38 floats per vertex),
  below WebGL2's minimum guarantee of 16. Additional metadata does not add
  triangles, materials, uniforms or draw calls.

The current Three.js version already requires WebGL2. GLSL 3 is used explicitly
to support flat interpolation and one declared fragment output.

## Units And Composition

`src/units.ts` owns the deterministic room descriptions. The seed
is hashed from a building seed, explicit floor, facade plane/orientation and unit
start position. Grouping is independent of input array ordering. Only small
mullion gaps join a run; doors and substantial piers split it.

Seven shared templates cover bedroom, living, living/dining, suite, study,
minimal lounge and corridor. Spans are one to three adjacent bays. Every member
shares its wall palette, furnishings, depth, curtain scheme and lighting state.
There is no per-pane brightness jitter.

Main furniture and secondary fixtures use clear sub-bay centres calculated from
the actual pane and shader-mullion widths. Beds and seating have grounded bases;
TVs align with consoles, art aligns with main furniture, lamps align with a
bedside/sofa/dining anchor. Variation changes a constrained layout, not a set of
independent random rectangle positions.

Daylighting is a soft, neutral ambient solution even for unoccupied rooms. The
night occupancy distribution targets 57% lit residential units (65% for retail),
with separate dim and off states. Actual counts are shown in the QA audit. No
per-room light animates or updates randomly.

## Interior Art Direction

`src/interiorArt.ts` defines six coordinated palettes: teal/oak, dusty blue/walnut,
sage/oak, terracotta/walnut, olive/oak, and mustard/walnut. Authored sRGB colours
are converted to linear constants once when the shared shader is assembled.
Warm white walls, neutral fabrics, natural wood and charcoal media elements
dominate; upholstery, bed throws, ceramics and framed art carry the accents.
Neutral seating can be paired with a low painted wall band; accent seating keeps
white walls. These two treatments do not stack. The direction targets about
76% neutral and 24% accent, not an exact pixel ratio at every camera angle.

`src/interiorFurniture.ts` is a small GLSL silhouette library, not a collection of
3D furniture meshes. Furniture is measured in metres before the existing ray
samples are composed. A multi-bay room does not stretch its TV or enlarge its
lamp to fill the whole window group.

- Thin 16:9 displays are centred over low consoles; a nearer, rear-facing sofa
  shares the media axis and faces the display. Suites use the same media module.
- Beds have an attached headboard, mattress top/front shading, pillows, an accent
  throw and a bedside cabinet. The table lamp sits on that cabinet.
- Armchairs have one padded back, arms and feet; sofas have a larger back and
  cushions. Study chairs sit at desks, not at unrelated random offsets.
- Floor lamps have a weighted base, a continuous stem and a broad tapered or
  drum shade. Table lamps have a ceramic body and a shade seated above it.
- Four framed artwork compositions use a mat, narrow frame and large readable
  shapes. Their centres are linked to the furniture below them.
- Occasional rugs and soft floor-contact shading reuse the existing analytical
  box-floor intersection. They do not introduce another ray sample or pass.

Four layouts, two orientations, five curtain states, four artwork designs and
three furnishing-density levels are seeded per shared unit. Floor-level palette
families keep nearby rooms related; adjacent floors change families and the
rooms change their layout, occupancy and furnishing density. An independent
styling seed does not alter window grouping. Optional storage and reading seats
are omitted in minimal rooms. Narrow bays use a study instead of squeezing an
undersized lounge into the available width.

The CPU reserves furniture footprints, lamp/bedside clearances, circulation gaps
and headroom, then selects a clear glazing anchor inside those bounds. Secondary
zones cannot overlap the main zone. All parts of a furniture assembly use the
same scale, anchor and virtual floor, rather than independent position jitter.

The existing `aPalette` attribute carries finish/fabric variations, artwork plus
density, and layout plus mirroring. One further flat `vec4`, `aRoomFinish`, carries
the wall and curtain dressing described below. That is eleven attribute locations
and 38 floats per vertex; five material uniforms and two triangles per pane remain. No meshes, materials, textures or
real-time lights are added to the scene by the refinement. The shared furniture
functions reject pixels outside their bounds before evaluating their masks;
small seams/handles still fade with the existing fine-detail LOD.

## Wall And Curtain Variation

`src/interiorFinish.ts` is a closed catalogue, not a generator: seven wall styles,
three wall treatments, six curtain fabrics and seven curtain states. All colours
are baked into the shared shader as linear-sRGB constants, so no room allocates a
material, texture, uniform or light. Decisions belong to the shared unit, so a
three-bay room is dressed once and reads as one apartment.

Walls follow an authored 70 / 20 / 10 mix:

| Share | Treatment |
| --- | --- |
| 70% | Plain neutral — warm off-white, soft light gray or pale beige |
| 20% | Slight variation — the same neutrals with a picture rail or a two-tone dado |
| 10% | Accent or feature — muted sage, dusty blue, an oak panel, or plaster texture |

Accents are blended at about half strength over the palette's neutral and are
applied to the rear wall only, at roughly a third of that strength on the side
returns, so a room never reads as painted per window. The oak panel is a bounded
field centred on the main furniture anchor — behind a headboard or a media wall —
with slats attenuated by pixel footprint. The plaster feature is broad
low-frequency mottling inside one panel; it uses no hash, no `gl_FragCoord` and no
time uniform. Oak panelling is only offered to rooms that actually have a bed or
a media wall.

The neutral wall tone is chosen per storey, so neighbours on one floor tend to
share a wall colour while the treatment and the rare accent vary per room.

Curtains use one state per unit: no curtain, fully open, half open to the left or
right, mostly closed, full-height sheer, or blackout. Ten fabrics are available:
white sheer, cream, warm beige, light gray, soft taupe, muted blue-gray, muted
sage-gray, dusty sand / greige, muted olive-gray (rare), and soft charcoal-gray.
Every fabric is low-chroma by construction (the QA check rejects any swatch whose
RGB spread exceeds 30/255). Charcoal is only offered to rooms that are already
mostly closed, so a dark panel never reads as a loud accent on an open window.
The state owns coverage and privacy; the fabric owns colour and fold frequency.

Each storey leans warm, neutral or cool (one draw per floor shared by every
elevation). The lean selects the floor's neutral wall tone — soft gray for cool
floors, beige for warm, off-white for neutral — and biases fabric selection
toward matching tones at 1.6× weight and away from opposing tones at 0.55×.
Neighbours along the same run inherit the previous unit's fabric 38% of the
time, so curtain colour clusters the way states do.
The full-height sheer state overrides the fabric's drape opacity, which lets any
of the six colours hang translucently. A blackout room never draws the sheer
fabric, so the name always matches the render.

Privacy is derived from the state, never randomised separately. It attenuates the
visible wall and furniture layers, the daytime and nighttime interior levels, and
the lamp bleed. A sheer desaturates what stays visible instead of erasing it, so
a dressed room reads as inhabited rather than blank; a blackout panel hides
furniture detail almost completely.

Distribution is clustered, not alternating:

- one openness value per storey, shared by every elevation of that floor
- one privacy value per unit
- room-type weights — bedrooms and suites are usually dressed, corridors and
  retail glazing usually bare
- a 32% chance to inherit the previous unit's state along the same facade run
- an explicit A-B-A break that nudges a repeat toward the opposite register
- premium units (suites and the widest living rooms) draw from a separate weight
  set favouring full-height sheer with cream or white, and are the rooms most
  likely to carry a feature wall

`aRoomFinish` packs `wallStyle + wallTreatment * 8`, wall tone, curtain fabric and
curtain fullness. Fold amplitude follows fullness and gathers toward the drape
stack; a sheer or blackout panel hangs evenly. The QA audit reports realised
neutral/accent wall shares, open/private shares, average privacy and fabric count,
and a fifth debug view paints wall style, treatment and fabric per unit with
brightness driven by privacy.

## Podium Envelope

The entrance front keeps its canopy, ASTARA and SEAWAYS signage, and outer
portal profile. The bronze grill runs continuously across its graphite backing,
the four podium pillars are white, and the clear entrance glazing now opens to
a full double-height hall. The moving doors and flush black glazing head replace
the old bisecting rail.

**Podium corner pillars — white.** The four corner piers (`buildWhiteFrame`)
are `TONE.ivory` instead of graphite, on every elevation including the front.
The graphite plinth keeps its exterior silhouette but is hollowed to make room
for the hall floor inside.

**Rear + sides — integrated LED walls.** `buildPodiumLedFrames()` builds each of
the three non-entrance elevations (rear, west, east) as a thin picture frame
rather than a solid field, so every display sits in a real 0.12 m recess inside
the existing wall boundary. Frame faces are flush with the podium wall plane and
share its depth, so nothing floats and no corner gap opens. The perimeter is
0.26 m on three sides, with a 0.42 m bottom rail reading as a plinth.

Each screen runs the full podium height in one piece, from 0.02 m inside the
plinth to 0.02 m inside the parapet ring. The sides are 26.28 m wide and the
rear 30.28 m; all three are 7.06 m high. The three horizontal members that
divide the front elevation — the first-floor slab edge, the spandrel and the
sill beam — are omitted on these elevations (the rear floor slab stops outside
the hall's white shell), so no middle beam ever crosses a display. The plinth rail and
head rail are the only horizontals, and both lie outside the screen.

Only the display is dark on these three elevations; the front spandrel keeps its
graphite behind the continuous bronze grill.

**Front bronze grill — continuous.** The podium slats in `buildWoodSlats()`
stay on the original 0.34 m module but now fill the full spandrel strip,
pier to pier, so no black gap remains behind the entrance beam. The run
continues behind the portal piers (where the piers hide it); slats under the
lintel (|u| < 9.8 m) stop 0.02 m below it instead of embedding. The opaque
backing is graphite outdoors and lined plain white inside the hall.

Those three faces emit no window panes at all, so they generate no interior
units and cost nothing in the parallax shader.

## LED Walls

`src/LedWall.tsx` holds one shared `ShaderMaterial` for all three screens, and
the three quads are merged into a single geometry: **three quads, six
triangles, one draw call, one material.** There are no physical LED pixels.

- Pixel pitch is simulated analytically at 28 mm and fades out once a cell drops
  below the pixel footprint, the same footprint attenuation the facade shading
  uses, so the grid never aliases at distance. The grid count and the panel's
  aspect ratio are per-vertex attributes (`aGrid`, `aPanelAspect`), so the
  wider rear panel keeps the same 28 mm pitch and its own cover-crop as the
  two side panels.
- Content defaults to a procedural brand graphic — three slow waves plus a
  travelling highlight — driven by one `uTime` uniform. Nothing is downloaded,
  and no texture is uploaded per frame.
- The idle shader remains on the LED quads while YouTube playback uses a
  separate HTML embed on each panel. Stopping removes those embeds and exposes
  the existing procedural display, without changing the architecture.
- Day is a premium dark display surface (`offState + content * 0.12`) that never
  glows; night is the graphic at full strength. The blend reuses the shared
  `envNight` uniform, so the screens follow the existing staged dusk sequence.
- `toneMapped: false` keeps the night graphic in bloom's range, matching the
  neon and column-strip treatment.

## LED Wall Video Playback

YouTube playback uses standard embeds in drei `Html transform`, with one player
per wall. They are centered and cover-cropped inside containers sized from the
actual LED panel metres. The embeds are independent playback sources; only the
first provides audio when unmuted. The inspector accepts a YouTube URL or ID,
and Stop restores the cyan/violet idle shader. No streams are scraped or proxied.

Unlike mesh surfaces, HTML overlays have no automatic depth test or back-face
culling. Without explicit visibility checks the far wall's video was mirrored
through the building and appeared to float above the podium. The corrected
rendering path is:

- Compute the camera in each panel's local coordinates. Show an embed only on
  its outward-facing side; a negative local Z is hidden immediately. There is
  no arbitrary orbit-angle fade that exposes the idle graphic prematurely.
- Intersect the view of the recessed panel with the white frame opening using
  `calculateLedPanelClip()` in `src/ledPanelVisibility.ts`. Apply those local
  CSS insets so video cannot paint over the frame, even at oblique angles.
  `overflow: hidden` plus paint containment also crops the oversized iframe.
- Raycast a small list of opaque building meshes through drei's occlusion
  support. Exclude the LED quads and their backing to avoid self-occlusion,
  exclude hidden layers, and avoid testing the instanced greenery. An
  obstructed panel is hidden, not drawn over the tower or entrance.
- Honor the visibility of every ancestor THREE.Group, which HTML portals do not
  normally inherit. Keep video overlays in z-index range 0..4, below the UI.
- Change only opacity and the local clip when the camera moves. Do not unmount
  or replace an iframe while orbiting, so visibility changes do not reload it.

These changes add no materials, physical meshes, or render passes. They retain
the working YouTube embed path; browser visual inspection is still required.

Three night-only point lights (`PL_LedWall_West` / `PL_LedWall_East` /
`PL_LedWall_Rear`) give the pavement a subtle spill. They are registered in `LOCAL_LIGHT_PROFILES` on the
`late` stage, so they come up with the rest of the night scheme and are off in
daylight. This is the one deliberate exception to the earlier "no extra
real-time lights" rule, because the brief explicitly asks for spill; at 26
intensity over a 17 m radius they stay well below the entrance lighting so the
screens never overpower the building.

The **Side LED wall** and **Podium rear wall** camera presets frame the east
screen and the rear screen with their pavement spill.

## Empty Double-Height Hall

The entire podium ground and first storeys are a single **empty** hall. There
is no reception, furniture, partition, mezzanine floor, or miniature parallax
room behind the doors. The actual interior is a thin white back wall, two white
side walls, white floor and white roof, occupying the whole podium footprint.

- The graphite plinth is a perimeter, not a solid box beneath the hall. Its
  center is replaced by a white floor at the same y=0.22 walking level as the
  stone landing. White floor sections behind the two outer glazed bays join
  that landing without overlapping its surface.
- The mid-height floor slab is perimeter-only. On the entrance elevation its
  exterior front fascia is shallow (z=15.08..15.2), entirely outside the glass.
  The rear/side strips stop outside the white shell; none protrudes into the
  hall. The ASTARA portal retains its **front** at z=16.25 but its back now
  stops outside the glass rather than projecting nearly a metre into the room.
  The front parapet and sill are similarly trimmed on the hall side.
- The opaque bronze-grill backing remains graphite on its **exterior** face;
  one plain white flush panel lines the **interior** from y=4.15..6.95. There
  are no beams or slats to read from inside. The shell uses a shared flat white
  finish with subtle emissive fill and three simple white placeholder lights.
- Ground and upper podium windows use neutral clear glass (not the residential
  tint), no parallax, and no per-window rooms. They are aligned to the actual
  facade openings: ground panes end under the fascia at y=4.15; upper panes
  start at the sill at y=6.95 and stop before the parapet at y=8.2. Both look
  directly into the **same** white double-height space.
- Fixed lower glass is split around a real 4.10 m entrance opening. The thick
  2.1 m glass block which used to span the doorway is removed. Two glazed
  leaves meet at x=0 when closed and swing **into** the empty hall when the
  inspector's **Doors open** toggle is on. They have narrow black meeting
  stiles and only small bronze pulls; the fixed windows, door hinges and top
  head share the same slim black frame. The former y=3.42 horizontal transom
  is removed — the doorway has no beam bisecting its glass.

The unused experimental `LOBBY_TYPE` shader recipe and its synthetic QA fixture
remain in the source for historical compatibility, but the real podium panes
never receive unit metadata and never call the parallax material. Only tower
panes are assigned interior units.

## Failure Handling

The lobby's palette lives in a reserved slot after the six residential palettes.
The unit audit originally resolved names only from those six, so every lobby
unit failed it. `buildPaneGeometry` then threw while rendering, React Three
Fiber re-threw that error out of the canvas, and with no error boundary React
unmounted the whole app: a black page. The audit now resolves the lobby slot and
also checks that the lobby palette and lobby room type always go together.

Interior problems are also no longer fatal:

- `buildPaneGeometry` reports audit and geometry-budget issues with
  `console.error` (they also appear in Interior motion QA) and keeps rendering.
  Facade artwork can no longer take the viewer down.
- `SceneBoundary` wraps the canvas. Any scene exception now shows its message
  with a Retry button, and the inspector stays usable.
- `installInteriorShaderDiagnostics`, installed in Canvas `onCreated`, records a
  compile or link failure of the interior shader from the very first frame. The
  failure persists across QA runs, a dismissible banner appears, and the full log
  is shown in Interior motion QA. If it fails, the rest of the building still
  renders.

Two shader identifiers were renamed defensively: `packed` → `code` and
`throw` → `throwMask`. Both are legal in GLSL ES 3.00, but they are keywords or
reserved words in neighbouring languages that some drivers have mishandled.

## Distance Policy

At up to 25 m the full three-zone illusion is available. Through 25-65 m, small
details and parallax strength reduce smoothly. Through 65-115 m, the furniture
contribution blends into a simple room representation. Beyond 115 m the template
function and analytical side-wall intersection are skipped. LOD is measured from
the unit centre so adjacent panes never pick incompatible LODs.

The grazing fade runs between a normalized normal-view component of 0.08 and
0.40. No ray division uses a normal component below 0.22, and lateral slope is
bounded. A camera crossing a tangent direction cannot produce infinite UVs.

## Motion QA

Open **Interior motion QA** in the existing inspector and select **Run 48-second
motion test**. It performs four repeatable 12-second camera paths:

1. Parallel movement along the front facade.
2. One complete building orbit.
3. Approach and retreat across the near, medium and far LOD ranges.
4. Left-to-right grazing-angle inspection.

The test restores the original camera/controls afterward; clicking the viewport
or selecting a camera preset cancels it. Optional WebM recording captures the
actual moving canvas, not screenshots. Recording overhead should be excluded
from performance comparisons.

Debug views show shared unit IDs, the three depth zones, and occupancy. Matching
unit colours should continue through adjacent panes. The tool also runs numeric
checks for deterministic grouping, unchanged geometry, structural boundaries,
mullion-gap-inclusive bounds, unequal-pane mappings, and 5,628 finite-ray samples.
The art-direction checks add 1,280 mirrored layout/width/height cases (eight
room recipes including the lobby), palette
families and deterministic style checks, 16:9 aspect checks, vertex-buffer and
material-uniform budgets, and shared style-attribute packing. The fixture floors
have distinct heights so they do not incorrectly trigger duplicate-pane checks.
It invokes the real renderer's shader compilation and records shader/WebGL errors
and frame intervals. These checks do not replace visual review.

Repeat in Day and Night with Bloom enabled and disabled, at DPR 1 and on a
mid-range mobile device. Watch for grain, furniture-edge sparkle, curtain moire,
room swimming, mullion discontinuities, glass sorting and LOD popping. Compare
frame times with recording disabled and the same camera/settings.

For the art pass, inspect bedrooms, media rooms, lounges and studies at the start
of the facade walk. Look for grounded feet/bases, TV-console alignment, curtains
that span a whole unit, natural colour contrast, and coherent art across mullions.
Check both oak and walnut palettes in daylight and occupied/dim/off rooms at night.

## Verification Limits

The production Vite build is checked in the coding environment. The environment
does not provide a browser/WebGL execution tool, so the motion test, GPU shader
compilation, video review and device performance numbers are not reported as
passed here. The QA controls report measurements only when actually run in the
viewer. A successful build is not a temporal-stability or equal-FPS certificate.
Unchanged geometry, draw and material budgets do not by themselves prove equal
fragment-shader cost; compare the moving view on the target device.
