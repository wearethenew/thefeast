// Builds the packed city frontage off the main thread (see frontage.ts).
import { buildFrontage } from "./frontage";
import { loadLagos } from "./lagosData";

self.onmessage = async () => {
  const world = await loadLagos();
  const data = buildFrontage(world);
  (self as unknown as Worker).postMessage(data, [data.buffer]);
};
