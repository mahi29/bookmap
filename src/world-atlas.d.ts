// world-atlas ships raw TopoJSON with no types. Declare it as `unknown` so TypeScript
// doesn't try to infer a giant literal type; geo.ts casts it to a Topology.
declare module "world-atlas/countries-110m.json" {
  const topology: unknown;
  export default topology;
}
