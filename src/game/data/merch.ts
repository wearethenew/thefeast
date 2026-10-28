// The Feast 2026 merch shown at the Merch booth (placeholder range and prices: swap for the real ones).
export type MerchColor = { name: string; hex: string };
export type MerchItem = { id: "tee" | "hoodie" | "cap" | "tote" | "band"; name: string; price: number; sizes: string[]; colors: MerchColor[]; blurb: string; designs?: string[] };

const ROYAL = { name: "Royal blue", hex: "#1b2f9e" };
const BONE = { name: "Bone", hex: "#efe9dc" };
const BLACK = { name: "Black", hex: "#17171a" };
const WINE = { name: "Wine", hex: "#7d1424" };
const GOLD = { name: "Gold", hex: "#f2b81f" };
const PINK = { name: "Pink", hex: "#e8336d" };

export const MERCH: MerchItem[] = [
  { id: "tee", name: "The Torch Tee", price: 15000, sizes: ["S", "M", "L", "XL", "XXL"], colors: [ROYAL, BONE, BLACK], blurb: "Heavy cotton, three prints to choose from", designs: ["The Torch", "Carry the Fire", "The Feast 2026"] },
  { id: "hoodie", name: "The Torch Hoodie", price: 30000, sizes: ["S", "M", "L", "XL", "XXL"], colors: [BLACK, WINE], blurb: "Brushed fleece, embroidered flame" },
  { id: "cap", name: "Feast Cap", price: 10000, sizes: ["One size"], colors: [ROYAL, GOLD, BLACK], blurb: "Six-panel, The New mark" },
  { id: "tote", name: "Carry the Fire Tote", price: 8000, sizes: ["One size"], colors: [BONE, BLACK], blurb: "Canvas tote for the weekend" },
  { id: "band", name: "Torch Wristband", price: 2000, sizes: ["One size"], colors: [GOLD, PINK], blurb: "Silicone, glows in the dark" },
];

export const naira = (n: number) => "₦" + n.toLocaleString("en-NG");
