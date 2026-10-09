import { forwardRef } from 'react';
import * as THREE from 'three';
import { ROOF_ORIGIN } from './dims';
import { MainBuilding } from './MainBuilding';
import { Entrance } from './Entrance';
import { EntranceScreens } from './EntranceScreens';
import { RooftopCafe } from './RooftopCafe';
import { InfinityPool } from './InfinityPool';
import { RooftopBar } from './RooftopBar';
import { SeatingArea } from './SeatingArea';
import { TerraceStage } from './TerraceStage';
import { PodiumTerrace, PodiumTerraceRailing } from './PodiumTerrace';
import { EntranceSignage, RooftopSignage } from './Signage';
import { RooftopLights, SiteLights } from './Lights';
import { RooftopDecor, SiteDecor } from './Decor';
import { Ground, Parking, PerimeterWall, StreetLights } from './Site';

export const LAYERS = [
  { id: 'main', label: 'Main building' },
  { id: 'glass', label: 'Facade glass' },
  { id: 'windows', label: 'Lit windows' },
  { id: 'entrance', label: 'Entrance & doors' },
  { id: 'cafe', label: 'Rooftop cafe' },
  { id: 'pool', label: 'Infinity pool' },
  { id: 'bar', label: 'Rooftop bar' },
  { id: 'seating', label: 'Seating, stage & terraces' },
  { id: 'signage', label: 'Signage' },
  { id: 'lights', label: 'Lighting' },
  { id: 'decor', label: 'Decorative' },
  { id: 'site', label: 'Forecourt, parking & gate' },
] as const;

export type LayerId = (typeof LAYERS)[number]['id'];
export type LayerState = Record<LayerId, boolean>;

interface Props {
  night: boolean;
  doorOpen: boolean;
  layers: LayerState;
}

/**
 * Aazhi Seaways tower with the Megham Sky Lounge — complete landmark asset.
 * Group hierarchy is flat and named so it can be traversed, toggled
 * and culled from your game code after glTF import.
 */
export const Building = forwardRef<THREE.Group, Props>(function Building({ night, doorOpen, layers }, ref) {
  return (
    <group ref={ref} name="AazhiSeaways_MeghamSkyLounge">
      <group name="Shell" visible={layers.main || layers.glass || layers.windows}>
        <MainBuildingLayers layers={layers} night={night} />
      </group>

      <group visible={layers.entrance}>
        <Entrance doorOpen={doorOpen} />
        <EntranceScreens night={night} />
      </group>

      <group name="Rooftop" position={ROOF_ORIGIN}>
        <group visible={layers.cafe}>
          <RooftopCafe />
        </group>
        <group visible={layers.pool}>
          <InfinityPool night={night} />
        </group>
        <group visible={layers.bar}>
          <RooftopBar />
        </group>
        <group visible={layers.seating}>
          <SeatingArea />
          <TerraceStage />
        </group>
        <group visible={layers.signage}>
          <RooftopSignage night={night} />
        </group>
        <group visible={layers.lights}>
          <RooftopLights night={night} />
        </group>
        <group visible={layers.decor}>
          <RooftopDecor />
        </group>
      </group>

      <group name="PodiumTerraceGroup" visible={layers.seating}>
        <PodiumTerrace />
      </group>
      <group name="PodiumTerraceGlass" visible={layers.glass}>
        <PodiumTerraceRailing />
      </group>

      <group name="Site">
        <group visible={layers.site}>
          <Ground night={night} lighting={layers.lights} />
          <Parking />
          <PerimeterWall />
        </group>
        <group visible={layers.signage}>
          <EntranceSignage night={night} />
        </group>
        <group visible={layers.lights}>
          <SiteLights night={night} />
          <StreetLights night={night} />
        </group>
        <group visible={layers.decor}>
          <SiteDecor />
        </group>
      </group>
    </group>
  );
});

/** MainBuilding renders three sibling groups; wrap them so each can be toggled. */
function MainBuildingLayers({ layers, night }: { layers: LayerState; night: boolean }) {
  return (
    <group
      ref={(g) => {
        if (!g) return;
        const map: Record<string, boolean> = {
          MainBuilding: layers.main,
          FacadeGlass: layers.glass,
          FacadeWindows: layers.windows,
        };
        g.children.forEach((c) => {
          if (c.name in map) c.visible = map[c.name];
        });
      }}
    >
      <MainBuilding night={night} />
    </group>
  );
}
