"use client";

import { useId } from "react";
import type { MerchItem } from "../data/merch";

// Product shots for the merch panel, drawn as SVG: real garment cuts with fabric shading, seams,
// stitching and the gold torch print, in whichever colour is picked.

/** Is this colour light (so prints and stitching go dark on it)? */
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
};

/** The torch print: a gold flame over a short handle. */
function Torch({ x, y, s, id }: { x: number; y: number; s: number; id: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -22 C9 -12 11 -4 7 4 C5 9 -5 9 -7 4 C-11 -4 -6 -10 -3 -15 C-2 -9 1 -8 2 -11 C3 -15 1 -19 0 -22 Z" fill={`url(#${id}-gold)`} />
      <path d="M0 -6 C4 -2 4 3 1 6 C-1 7 -3 5 -3 2 C-3 -1 -1 -3 0 -6 Z" fill="#fff3c4" opacity="0.85" />
      <path d="M-6 9 L6 9 L3 30 L-3 30 Z" fill={`url(#${id}-gold)`} />
      <rect x="-7" y="8" width="14" height="3" rx="1" fill="#b07a12" />
    </g>
  );
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffe08a" />
        <stop offset="0.5" stopColor="#f2b81f" />
        <stop offset="1" stopColor="#b9780e" />
      </linearGradient>
      {/* soft light from the top left, falling off to the sides */}
      <radialGradient id={`${id}-light`} cx="0.38" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.32" />
      </radialGradient>
      <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.28" />
        <stop offset="0.18" stopColor="#000" stopOpacity="0" />
        <stop offset="0.82" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.3" />
      </linearGradient>
      {/* woven fabric grain */}
      <filter id={`${id}-weave`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.18" />
        </feComponentTransfer>
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={`${id}-soft`}>
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id={`${id}-drop`} x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

/** Fill, light, side shade and grain for one garment outline. */
function Cloth({ d, id, color }: { d: string; id: string; color: string }) {
  return (
    <>
      <path d={d} fill={color} />
      <path d={d} fill={`url(#${id}-light)`} />
      <path d={d} fill={`url(#${id}-side)`} />
      <path d={d} fill="#808080" filter={`url(#${id}-weave)`} style={{ mixBlendMode: "overlay" }} />
    </>
  );
}

/** The tee's chest prints: 0 The Torch, 1 Carry the Fire, 2 The Feast 2026. */
function TeePrint({ id, color, design }: { id: string; color: string; design: number }) {
  const second = light(color) ? "#1b2f9e" : "#ffffff";
  const font = "system-ui, sans-serif";
  if (design === 1)
    return (
      <g>
        <text x="100" y="86" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="17" letterSpacing="1" fill={second}>
          CARRY
        </text>
        <text x="100" y="104" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="17" letterSpacing="1" fill={second}>
          THE
        </text>
        <text x="100" y="128" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="26" letterSpacing="1" fill={`url(#${id}-gold)`}>
          FIRE
        </text>
        <Torch x={138} y={86} s={0.45} id={id} />
        <text x="100" y="142" textAnchor="middle" fontFamily={font} fontWeight="700" fontSize="5.5" letterSpacing="2.5" fill={second} opacity="0.8">
          THE FEAST · LAGOS 2026
        </text>
      </g>
    );
  if (design === 2)
    return (
      <g>
        {/* a ring of rays round the flame, the year under it */}
        <circle cx="100" cy="98" r="24" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2.5" />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return <line key={i} x1={100 + Math.cos(a) * 28} y1={98 + Math.sin(a) * 28} x2={100 + Math.cos(a) * 33} y2={98 + Math.sin(a) * 33} stroke={`url(#${id}-gold)`} strokeWidth="2" strokeLinecap="round" />;
        })}
        <Torch x={100} y={96} s={0.62} id={id} />
        <text x="100" y="146" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="13" letterSpacing="3" fill={second}>
          THE FEAST 2026
        </text>
        <text x="100" y="160" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="11" letterSpacing="6" fill={`url(#${id}-gold)`}>
          2026
        </text>
      </g>
    );
  return (
    <g>
      <Torch x={100} y={88} s={0.95} id={id} />
      <text x="100" y="134" textAnchor="middle" fontFamily={font} fontWeight="900" fontSize="14" letterSpacing="2" fill={`url(#${id}-gold)`}>
        THE TORCH
      </text>
      <text x="100" y="146" textAnchor="middle" fontFamily={font} fontWeight="700" fontSize="6" letterSpacing="2.5" fill={second} opacity="0.85">
        THE FEAST 2026
      </text>
    </g>
  );
}

const TEE = "M70 34 C78 40 92 44 100 44 C108 44 122 40 130 34 L166 52 C170 54 172 58 171 62 L162 86 C161 89 157 90 154 88 L144 82 L145 170 C145 175 141 178 136 178 L64 178 C59 178 55 175 55 170 L56 82 L46 88 C43 90 39 89 38 86 L29 62 C28 58 30 54 34 52 Z";

function Tee({ id, color, design = 0 }: { id: string; color: string; design?: number }) {
  const ink = light(color) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.28)";
  return (
    <g filter={`url(#${id}-drop)`}>
      <Cloth d={TEE} id={id} color={color} />
      {/* rib collar, inside of the back neck */}
      <path d="M78 37 C86 46 114 46 122 37 C116 44 108 47 100 47 C92 47 84 44 78 37 Z" fill="#000" opacity="0.35" />
      <path d="M72 35 C80 47 120 47 128 35" fill="none" stroke={color} strokeWidth="5" />
      <path d="M72 35 C80 47 120 47 128 35" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="5" />
      <path d="M74 38 C82 49 118 49 126 38" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      {/* sleeve seams and hems */}
      <path d="M56 82 C58 70 62 58 68 46" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="1.2" />
      <path d="M144 82 C142 70 138 58 132 46" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="1.2" />
      <path d="M40 82 L57 75" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      <path d="M160 82 L143 75" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      <path d="M57 171 L143 171" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      {/* folds */}
      <g filter={`url(#${id}-soft)`} fill="none" strokeLinecap="round">
        <path d="M70 120 C80 140 76 158 82 174" stroke="#000" strokeOpacity="0.18" strokeWidth="4" />
        <path d="M132 110 C126 130 130 150 124 172" stroke="#000" strokeOpacity="0.14" strokeWidth="4" />
        <path d="M84 60 C96 70 106 66 118 58" stroke="#fff" strokeOpacity="0.1" strokeWidth="5" />
      </g>
      <TeePrint id={id} color={color} design={design} />
    </g>
  );
}

const HOODIE_BODY = "M66 46 C76 50 90 52 100 52 C110 52 124 50 134 46 L164 64 C168 66 170 70 170 74 L170 160 C170 164 167 166 163 166 L152 166 L150 98 L147 176 C147 180 144 182 140 182 L60 182 C56 182 53 180 53 176 L50 98 L48 166 L37 166 C33 166 30 164 30 160 L30 74 C30 70 32 66 36 64 Z";

function Hoodie({ id, color }: { id: string; color: string }) {
  const ink = light(color) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)";
  return (
    <g filter={`url(#${id}-drop)`}>
      {/* the hood, lying behind the neck */}
      <path d="M66 46 C62 26 78 14 100 14 C122 14 138 26 134 46 C124 56 76 56 66 46 Z" fill={color} />
      <path d="M66 46 C62 26 78 14 100 14 C122 14 138 26 134 46 C124 56 76 56 66 46 Z" fill="#000" opacity="0.25" />
      <path d="M76 44 C76 30 86 24 100 24 C114 24 124 30 124 44 C114 50 86 50 76 44 Z" fill="#000" opacity="0.45" />
      <Cloth d={HOODIE_BODY} id={id} color={color} />
      {/* hood front edge, drawstrings with gold tips */}
      <path d="M70 44 C82 56 118 56 130 44" fill="none" stroke={color} strokeWidth="7" />
      <path d="M70 44 C82 56 118 56 130 44" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="7" />
      <path d="M92 54 C91 66 93 76 91 86" stroke="#eee" strokeWidth="1.6" fill="none" />
      <path d="M108 54 C109 66 107 76 109 88" stroke="#eee" strokeWidth="1.6" fill="none" />
      <rect x="89.6" y="85" width="3" height="6" rx="1" fill={`url(#${id}-gold)`} />
      <rect x="107.6" y="87" width="3" height="6" rx="1" fill={`url(#${id}-gold)`} />
      {/* kangaroo pocket */}
      <path d="M70 140 L78 118 L122 118 L130 140 L130 160 L70 160 Z" fill="#000" opacity="0.14" />
      <path d="M70 140 L78 118 L122 118 L130 140" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      <path d="M70 140 L70 160 M130 140 L130 160" stroke="#000" strokeOpacity="0.3" strokeWidth="1.4" />
      {/* rib cuffs and waistband */}
      <rect x="54" y="168" width="92" height="12" rx="3" fill="#000" opacity="0.18" />
      <rect x="30" y="152" width="18" height="12" rx="3" fill="#000" opacity="0.18" />
      <rect x="152" y="152" width="18" height="12" rx="3" fill="#000" opacity="0.18" />
      <g stroke="#000" strokeOpacity="0.15" strokeWidth="0.7">
        {Array.from({ length: 22 }, (_, i) => <line key={i} x1={57 + i * 4} y1="169" x2={57 + i * 4} y2="179" />)}
      </g>
      <g filter={`url(#${id}-soft)`} fill="none" strokeLinecap="round">
        <path d="M56 100 C62 120 58 140 62 166" stroke="#000" strokeOpacity="0.2" strokeWidth="4" />
        <path d="M146 96 C140 116 144 140 138 164" stroke="#000" strokeOpacity="0.18" strokeWidth="4" />
      </g>
      {/* embroidered flame */}
      <Torch x={124} y={82} s={0.55} id={id} />
    </g>
  );
}

function Cap({ id, color }: { id: string; color: string }) {
  const ink = light(color) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.3)";
  const crown = "M38 118 C36 78 62 48 100 48 C138 48 164 78 162 118 C140 124 60 124 38 118 Z";
  return (
    <g filter={`url(#${id}-drop)`}>
      {/* the brim, curved, its underside in shade */}
      <path d="M44 116 C70 112 130 112 160 116 C170 130 168 146 150 152 C120 160 80 160 54 152 C36 146 34 130 44 116 Z" fill={color} />
      <path d="M44 116 C70 112 130 112 160 116 C170 130 168 146 150 152 C120 160 80 160 54 152 C36 146 34 130 44 116 Z" fill="#000" opacity="0.28" />
      <path d="M50 124 C80 120 124 120 154 124" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      <path d="M48 132 C80 128 124 128 156 132" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="2 1.6" />
      <path d="M58 150 C86 156 118 156 146 150" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="3" filter={`url(#${id}-soft)`} />
      <Cloth d={crown} id={id} color={color} />
      {/* panel seams, eyelets and the button */}
      <g fill="none" stroke="#000" strokeOpacity="0.28" strokeWidth="1.3">
        <path d="M100 48 C100 70 100 96 100 121" />
        <path d="M100 48 C80 62 68 90 66 121" />
        <path d="M100 48 C120 62 132 90 134 121" />
      </g>
      <circle cx="78" cy="72" r="2.2" fill="#000" opacity="0.4" />
      <circle cx="122" cy="72" r="2.2" fill="#000" opacity="0.4" />
      <ellipse cx="100" cy="49" rx="6" ry="3" fill={color} />
      <ellipse cx="100" cy="49" rx="6" ry="3" fill="#000" opacity="0.2" />
      {/* the front mark */}
      <text x="100" y="94" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="13" letterSpacing="2" fill={`url(#${id}-gold)`}>
        THE NEW
      </text>
      <Torch x={100} y={104} s={0.32} id={id} />
    </g>
  );
}

function Tote({ id, color }: { id: string; color: string }) {
  const bag = "M46 72 L154 72 L160 182 C160 185 158 187 155 187 L45 187 C42 187 40 185 40 182 Z";
  return (
    <g filter={`url(#${id}-drop)`}>
      {/* handles */}
      {[70, 130].map((x) => (
        <path key={x} d={`M${x - 14} 74 C${x - 14} 24 ${x + 14} 24 ${x + 14} 74`} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />
      ))}
      {[70, 130].map((x) => (
        <path key={"s" + x} d={`M${x - 14} 74 C${x - 14} 24 ${x + 14} 24 ${x + 14} 74`} fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="7" strokeLinecap="round" />
      ))}
      <Cloth d={bag} id={id} color={color} />
      <path d="M48 80 L152 80" stroke="#000" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="2 1.6" />
      <g filter={`url(#${id}-soft)`} fill="none">
        <path d="M60 100 C66 130 62 160 68 184" stroke="#000" strokeOpacity="0.15" strokeWidth="5" />
      </g>
      <Torch x={100} y={118} s={0.9} id={id} />
      <text x="100" y="164" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="12" letterSpacing="1.5" fill={light(color) ? "#7d1424" : `url(#${id}-gold)`}>
        CARRY THE FIRE
      </text>
    </g>
  );
}

function Band({ id, color }: { id: string; color: string }) {
  return (
    <g filter={`url(#${id}-drop)`}>
      {/* a silicone band lying on its side: the far half, then the near half over it */}
      <path d="M30 100 C30 66 170 66 170 100 L170 116 C170 84 30 84 30 116 Z" fill={color} />
      <path d="M30 100 C30 66 170 66 170 100 L170 116 C170 84 30 84 30 116 Z" fill="#000" opacity="0.35" />
      <path d="M30 100 C30 140 170 140 170 100 L170 116 C170 156 30 156 30 116 Z" fill={color} />
      <path d="M30 100 C30 140 170 140 170 100 L170 116 C170 156 30 156 30 116 Z" fill={`url(#${id}-light)`} />
      <path d="M36 112 C50 136 150 136 164 112" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" filter={`url(#${id}-soft)`} />
      <text fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="9.5" letterSpacing="1.2" fill="#000" opacity="0.4">
        <textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">
          THE FEAST · THE TORCH · 2026
        </textPath>
      </text>
      <path id={`${id}-arc`} d="M44 122 C64 146 136 146 156 122" fill="none" />
    </g>
  );
}

export function MerchArt({ item, color, design, className }: { item: MerchItem; color?: string; design?: number; className?: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = color ?? item.colors[0].hex;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={item.name}>
      <Defs id={id} />
      {item.id === "tee" ? <Tee id={id} color={c} design={design} /> : item.id === "hoodie" ? <Hoodie id={id} color={c} /> : item.id === "cap" ? <Cap id={id} color={c} /> : item.id === "tote" ? <Tote id={id} color={c} /> : <Band id={id} color={c} />}
    </svg>
  );
}
