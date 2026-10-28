// Placeholder characters (Microsoft Rocketbox, MIT). To be replaced by MetaHuman exports.

export type Sex = "m" | "f";
export type AvatarDef = { id: string; label: string; file: string; sex: Sex };

export const AVATARS: AvatarDef[] = [
  { id: "m04", label: "Daniel", file: "/avatars/Male_Adult_04.glb", sex: "m" },
  { id: "m12", label: "Michael", file: "/avatars/Male_Adult_12.glb", sex: "m" },
  { id: "m18", label: "David", file: "/avatars/Male_Adult_18.glb", sex: "m" },
  { id: "f11", label: "Grace", file: "/avatars/Female_Adult_11.glb", sex: "f" },
  { id: "f07", label: "Sarah", file: "/avatars/Female_Adult_07.glb", sex: "f" },
  { id: "f15", label: "Esther", file: "/avatars/Female_Adult_15.glb", sex: "f" },
  // corporate
  { id: "bf01", label: "Rachel", file: "/avatars/Business_Female_01.glb", sex: "f" },
  { id: "bf04", label: "Victoria", file: "/avatars/Business_Female_04.glb", sex: "f" },
  { id: "bm02", label: "James", file: "/avatars/Business_Male_02.glb", sex: "m" },
  { id: "bm05", label: "Emeka", file: "/avatars/Business_Male_05.glb", sex: "m" },
  // creative / casual
  { id: "fp01", label: "Amaka", file: "/avatars/Female_Party_01.glb", sex: "f" },
  { id: "f05", label: "Hannah", file: "/avatars/Female_Adult_05.glb", sex: "f" },
  { id: "m08", label: "Joshua", file: "/avatars/Male_Adult_08.glb", sex: "m" },
  { id: "m14", label: "Tunde", file: "/avatars/Male_Adult_14.glb", sex: "m" },
];

export const SKIN_TONES = ["#ffffff", "#c99a78", "#9c6b4e", "#74472f", "#55301e"];

export type RobeDef = { id: string; label: string; velvet: string; sheen: string; trim: string };

export const ROBES: RobeDef[] = [
  { id: "royal", label: "Royal Blue", velvet: "#0f2fb0", sheen: "#3d63ff", trim: "#e8b44a" },
  { id: "midnight", label: "Midnight", velvet: "#09124a", sheen: "#2a3ea8", trim: "#e8b44a" },
  { id: "ivory", label: "Ivory", velvet: "#d9d0bc", sheen: "#fff6e0", trim: "#c9932e" },
  { id: "crimson", label: "Crimson", velvet: "#6e0c1e", sheen: "#d8324e", trim: "#e8b44a" },
];

export type AnimName = "idle" | "walk" | "run" | "sit" | "cheer" | "wave" | "clap";

export function animFile(sex: Sex, name: AnimName) {
  const clip = {
    idle: "idle_neutral_01",
    walk: "walk_neutral_01",
    run: "run_neutral_01",
    sit: "sit_chair_idle_neutral_01",
    cheer: "cheer_01",
    wave: "wave_01",
    clap: "claphands_01",
  }[name];
  return `/avatars/anims/${sex}_${clip}.glb`;
}
