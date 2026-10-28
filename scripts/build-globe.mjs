// Renders the globe's map textures (equirectangular PNGs) into public/globe:
//  - world.png: land, country borders and coastlines (Natural Earth 1:50m via world-atlas)
//  - swng.png:  south-west Nigeria close-up (1:10m borders/coast + OSM motorways/trunk roads
//               from assets-src/osm/swng_roads.json), where the Nigerian campuses are.
//  - uk.png:    Great Britain close-up (1:10m), for the London and Birmingham campuses.
// Region maps are opaque (sea painted in) so the coarser world map never shows through.
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { feature, mesh } from "topojson-client";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = ROOT + "public/globe/";
mkdirSync(OUT, { recursive: true });

export const REGION = { lon0: 2.6, lon1: 6.2, lat0: 6.2, lat1: 8.4 };
export const UK = { lon0: -8.5, lon1: 2.2, lat0: 49.8, lat1: 58.8 };

function project(box, W, H) {
  return ([lon, lat]) => [((lon - box.lon0) / (box.lon1 - box.lon0)) * W, ((box.lat1 - lat) / (box.lat1 - box.lat0)) * H];
}

function pathOf(coords, P) {
  // split rings that wrap the antimeridian so they do not streak across the map
  let d = "";
  let prev = null;
  for (const c of coords) {
    const [x, y] = P(c);
    if (prev && Math.abs(c[0] - prev[0]) > 180) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    else d += (d && prev ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    prev = c;
  }
  return d;
}

function polys(geom, P) {
  const list = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  return list.map((rings) => rings.map((r) => pathOf(r, P) + "Z").join("")).join("");
}

function lines(geom, P) {
  const list = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  return list.map((l) => pathOf(l, P)).join("");
}

async function render(name, topoFile, box, W, H, extra = "", strokeScale = 1, sea = null) {
  const topo = JSON.parse(readFileSync(ROOT + "node_modules/world-atlas/" + topoFile, "utf8"));
  const P = project(box, W, H);
  const land = feature(topo, topo.objects.land ?? topo.objects.countries);
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const coast = mesh(topo, topo.objects.countries, (a, b) => a === b);
  const landD = land.features.map((f) => polys(f.geometry, P)).join("");
  // region maps fade out at their edges so they blend into the world map around them
  const pad = Math.round(Math.min(W, H) * 0.06);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${pad / 2}"/></filter>
      <mask id="m"><rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" fill="#fff" filter="url(#f)"/></mask>
    </defs>
    <g ${sea ? 'mask="url(#m)"' : ""}>
      ${sea ? `<rect width="${W}" height="${H}" fill="${sea}"/>` : ""}
      <path d="${landD}" fill="#16309c" fill-rule="evenodd"/>
      <path d="${lines(coast, P)}" fill="none" stroke="#a9bcff" stroke-opacity="0.85" stroke-width="${1.6 * strokeScale}"/>
      <path d="${lines(borders, P)}" fill="none" stroke="#f2b544" stroke-opacity="0.7" stroke-width="${1.2 * strokeScale}" stroke-dasharray="${6 * strokeScale},${4 * strokeScale}"/>
      ${extra}
    </g>
  </svg>`;
  await sharp(Buffer.from(svg), { limitInputPixels: false }).png({ compressionLevel: 9, palette: true }).toFile(OUT + name);
  console.log("wrote", name, W + "x" + H);
}

await render("world.png", "countries-50m.json", { lon0: -180, lon1: 180, lat0: -90, lat1: 90 }, 4096, 2048);

// south-west Nigeria: highways on top of the 1:10m map
const W = 4096;
const H = Math.round((W * (REGION.lat1 - REGION.lat0)) / (REGION.lon1 - REGION.lon0));
const P = project(REGION, W, H);
const roads = JSON.parse(readFileSync(ROOT + "assets-src/osm/swng_roads.json", "utf8")).elements;
const motor = roads.filter((r) => r.tags.highway === "motorway").map((r) => pathOf(r.geometry.map((g) => [g.lon, g.lat]), P)).join("");
const trunk = roads.filter((r) => r.tags.highway === "trunk").map((r) => pathOf(r.geometry.map((g) => [g.lon, g.lat]), P)).join("");
const extra = `
  <path d="${trunk}" fill="none" stroke="#ffd27a" stroke-opacity="0.75" stroke-width="2.2" stroke-linecap="round"/>
  <path d="${motor}" fill="none" stroke="#ffb347" stroke-opacity="0.95" stroke-width="3.6" stroke-linecap="round"/>`;
await render("swng.png", "countries-10m.json", REGION, W, H, extra, 2, "#0a1a6e");

// Great Britain: equirectangular stretch is fine at this size; correct the aspect for latitude
// (portrait, so cap the height at 4096 for mobile GPUs)
const ukW = Math.round((4096 * (UK.lon1 - UK.lon0) * Math.cos((54 * Math.PI) / 180)) / (UK.lat1 - UK.lat0));
await render("uk.png", "countries-10m.json", UK, ukW, 4096, "", 1.5, "#0a1a6e");
