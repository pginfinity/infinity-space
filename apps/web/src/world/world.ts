import { buildCirculoMap, NavGrid, ZoneIndex, type MapDef } from "@infinity/world";

export interface World {
  map: MapDef;
  nav: NavGrid;
  zones: ZoneIndex;
}

let cache: World | undefined;

/** O mundo é gerado uma vez no cliente, com o mesmo código do servidor. */
export function world(): World {
  if (!cache) {
    const map = buildCirculoMap();
    cache = { map, nav: NavGrid.fromMap(map), zones: new ZoneIndex(map.zones) };
  }
  return cache;
}
