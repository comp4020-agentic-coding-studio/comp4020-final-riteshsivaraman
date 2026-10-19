import { BENCHES, TABLES, TABLE_STOOLS } from "../../shared/world.ts";
import { BackRoom, ShopShell } from "./gfx/shell.tsx";
import { ServiceBar, Table, TableStool, WallBench } from "./gfx/furniture.tsx";

// The store's scenery, composed from the graphics modules in gfx/:
//   shell.tsx       walls, glass front, ceiling and lights, floor, posters,
//                   lightboxes, the staff door and the back room's shell
//   furniture.tsx   tables, stools, benches, the bar, shelves and racks
//   phones.tsx      phones, watches, earbuds, headphones, speakers; bay stock
//   computers.tsx   laptops, tablets, monitors and desktops
//   common.tsx      colours, canvas textures, instanced boxes, signs
// Nothing here is solid except what world.ts lists, so what you bump into and
// what is drawn cannot drift apart.
export function Room() {
  return (
    <group>
      <ShopShell />
      {TABLES.map((t) => (
        <Table key={t.id} box={t} />
      ))}
      {TABLE_STOOLS.map((st) => (
        <TableStool key={st.id} x={st.x} z={st.z} />
      ))}
      <WallBench box={BENCHES[0]} side={-1} />
      <WallBench box={BENCHES[1]} side={1} />
      <ServiceBar />
      <BackRoom />
    </group>
  );
}
