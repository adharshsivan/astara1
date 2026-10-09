# Daytime Visual Refinement

This pass changes render parameters and shader shading only. Building geometry,
object placement, facade layout, signage artwork, furniture, planting distribution,
parking and circulation are not edited. No new lights, surfaces, textures, or
screen-space postprocessing passes are added.

## Separate Profiles

`src/three/visualProfiles.ts` owns a shared, smoothly eased day/night blend. The
following night values are the settings that existed before this refinement:

| Parameter | Preserved Night | Refined Day |
| --- | --- | --- |
| Exposure | 1.0 | 0.86 |
| Directional position | -45, 60, -30 | 65, 58, 35 |
| Directional intensity | 0.9 | 2.65 |
| Hemisphere intensity | 0.55 | 0.38 |
| Bloom intensity | 0.95 | 0.06 |
| Shadow map | 2048 x 2048 | 2048 x 2048 |
| Shadow normal bias | 0.06 | 0.045 |
| Environment capture resolution | 128 | 128 |

The night environment Lightformer positions, intensities, colours and sizes are
unchanged. A single offline environment capture is refreshed once around the
middle of a transition, under a brief reflection-intensity fade. It is not
rendered continuously and two environment maps are not retained.

## Materials And Wood

`materials.ts` captures the original night endpoints and interpolates the existing
material instances toward a separate daytime finish. This gives painted ivory,
cool-gray concrete, graphite metal, neutral stone, glazing and plant materials
distinct colour values, roughness and environment response. Numeric and colour
values are copied exactly at the night endpoint instead of approximately lerped.

`MAT.wood` and `MAT.woodLight` are not registered for any change. Their colour,
roughness, metalness, maps and environment response remain unchanged. In
particular, the rooftop cafe wooden floor is not recoloured or modified.

Existing local point lights retain their original nighttime outputs and positions.
Their daytime contribution is lowered; the pink signage wash is off in daylight.
No decorative fixture is moved or added.

## Architectural Depth

`dayShading.ts` introduces subtle analytic contact occlusion on existing facade
materials and paving. It modulates only indirect light near the known column/slab
junctions, downward-facing soffits, and the podium footprint. Occlusion is capped
at 24 percent; direct sun and real shadow-map shading are retained. The shader
skips this modulation entirely at night.

This is not full scene-space ambient occlusion or real-time GI. It is a lightweight
fixed-landmark approximation that avoids additional geometry passes, AO texture
memory, and temporally noisy sampling.

## Windows, Pool And Signs

- The existing two-triangle parallax room geometry and room layout attributes are
  unchanged. A separate daylight solution uses soft natural ambient light, subtle
  furniture silhouettes, filtered curtain folds, charcoal frames and moderate
  blue-gray Fresnel reflections. The old night calculation is unchanged when
  `uNight == 1`. The special two-pane daylight correction is retained.
- Pool water retains the original texture, geometry and animation. Only daytime
  tint, opacity and surface response change. A tiny analytic normal ripple gives
  restrained sky highlights without displacement or another texture. Night uses
  the original white multiplier, 0.12 roughness, 0.26 metalness, 0.92 opacity,
  0.34 emission and 1.5 environment intensity, with ripple perturbation disabled.
- Neon letters and trim geometry are unchanged. Their day emission is zero and
  their physical finishes remain visible; their exact original night colour and
  emission endpoints are restored. No previously removed sign is reintroduced.
- Main column LEDs display a steady neutral diffuser during the day, independent
  of effect, speed or intensity settings. Their original night animation remains.

## Verification

The scene performs a cheap material day/night round-trip audit during setup.
`verifyNightMaterialValues()` checks every registered night colour and numeric
property, and checks that the protected wooden floor material has not changed.
Failures stop setup with the relevant material property names. The result is
available as `scene.userData.visualProfileAudit` when the viewer is running.

Production build verification is available through the project build tool.
Browser shader compilation, visual day/night comparison and device frame-time
measurement still require a running WebGL viewer. They are not implied by a
successful Vite build or by the numeric material audit.

Recommended visual check: use the same camera and layer settings, toggle Night
off, wait for the transition to settle, inspect the facade, entrance, sky terrace,
pool and landscaping, then toggle Night on and compare with the earlier night
render. Repeat with Bloom disabled and test on a mid-range mobile device.
