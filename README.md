# The Feast 2026 · The Torch

A 3D web experience for The New Church's Feast (11–13 Dec 2026, The Fusion Centre, Ogba). Players create a robed torch-bearer, pick where they're coming from, fly into Lagos, ride a yellow cab along real Ikeja roads to the Fusion Centre, then walk the compound and watch the ministers on the hall's LED wall.

Planning notes: [PLAN.md](PLAN.md). Venue references: [references/fusion-centre](references/fusion-centre).

## Run it

For the smooth version (dev mode is much heavier), build and serve production on its own port:

```bash
NEXT_DIST_DIR=.next-prod npx next build && NEXT_DIST_DIR=.next-prod npx next start -p 3001
```


```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Dev shortcuts

| URL | What it does |
|---|---|
| `?stage=create`, `origin`, `flight`, `drive`, `venue` | Jumps straight to a stage. Origin defaults to London. |
| `?stage=venue&spawn=hall` | Starts inside the main hall. |
| `?lab` | Shows every avatar, robe and torch side by side. |

## The journey

1. **Opening film (the title screen).** A drone film at Feast evening:
   - TORCH Air jets fly in from London, Birmingham and Toronto;
   - quick passes over The New Yaba, Ibadan and Ikeja walking up real Ikeja roads with their banners;
   - a low orbit of the Fusion Centre with both streets full of people turning in at the gates.
   Windows across the city light up as the torches pass. "I Accelerate" plays on an overhead billboard over the main road beside the compound from the moment the site opens; it starts muted and the first tap unmutes it.
2. **Join the crowd.** You start on the street among everyone walking in.
   - Walk through the pedestrian gate or the vehicle gate.
   - Use the main doors in the centre of the glass front (the screen is straight ahead), or the two side entrances through the annex corridors (the screen is on your left).
   - Cars park only in the back-left corner. The billboard gets quieter in the compound and low in the hall.
3. **Inside.**
   - A full house in padded dark-grey chairs.
   - The wide LED wall, a square screen at each end, and a playlist of every minister's videos along the bottom of the wall. Something is already playing when you walk in.
   - A concert rig: moving heads, flown line arrays, subwoofers and monitors.
   - Drag to look around (scroll to zoom) anywhere.
   - Desks around the yard: Welcome Desk (Feast pass), Travel, Lodging, Volunteer HQ, Feast Market, Give and the Hall of Torches (testimonies).

The character creator, globe, flight and the danfo/cab ride are still in the code but out of the main flow. `RIDE_ACROSS_LAGOS` in `src/game/config.ts` brings the ride back.

**Crowds:** every person is a real Rocketbox avatar in everyday clothes (casual, creative and corporate; 14 people) carrying a lit torch. A shader gives each person their own outfit colours and skin tone, so nobody looks alike.
- Each avatar's walk and sit are baked once at load into vertex-animation textures (`src/game/crowd/vat.ts`, `CrowdBaker.tsx`), simplified with meshoptimizer.
- They are drawn instanced with two levels of detail (`CrowdRenderer.tsx`).
- Walkers follow orderly flows along the streets and yard paths (`flows.ts`), so nobody walks through anybody.

## Sound

There are no audio files. Web Audio synthesises everything:
- the worship-pad music
- the engine, horns and city hum
- the conductor's voice, which comes from the browser's speech synthesis

Audio starts on the first tap; the ♪ and 🔊 buttons (bottom left) toggle it.

## How it's built

- **Stack:** Next.js 15, React Three Fiber, drei, postprocessing (bloom, SMAA, vignette) and zustand.
- **Characters** (`src/game/avatar`): the robe is generated per body and skinned to the avatar's skeleton. It uses velvet sheen with procedural gold embroidery, and the torch is held with IK.
- **Lagos world** (`src/game/world`): built from OpenStreetMap by `scripts/build-world.mjs`, which writes `public/world/lagos.json`.
- **Fusion Centre:** modelled from the architect's renders (`src/game/world/FusionCentre.tsx`, layout in `compound.ts`).

### Rebuilding data

The globe map textures come from `node scripts/build-globe.mjs`. It uses Natural Earth via world-atlas, plus OSM highways in `assets-src/osm/swng_roads.json`.


```bash
node scripts/build-world.mjs
```

```bash
FBX2GLTF=/path/to/FBX2glTF node scripts/build-avatars.mjs
```

`build-avatars.mjs` needs the Rocketbox sources, including their textures, re-downloaded first (see the script header).

## Placeholders to replace before launch

- **Characters:** Microsoft Rocketbox avatars (MIT) stand in until the MetaHuman characters arrive. Swap the GLBs in `public/avatars` and `src/game/data/avatars.ts`.
- **Logo:** the roof and court logo is drawn in code as an approximation. Use the official The New logo file.
- **Backend:** every booth form posts to the server and is stored in one Google Sheet, one tab per kind: Registrations, Merch, Games, Winners, Volunteers, Testimonies and Invites. Set these in `.env` / `.env.local` (or the host's env):
  - `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`: a Google Cloud service account, with the spreadsheet shared to its email as an editor. Tabs and header rows are created automatically. Without these, rows go to Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) or, locally, to `.data/*.jsonl`.
  - `EMAIL_USER`, `EMAIL_PASSWORD`: the Feast mailbox (thefeast@wearethenew.org) over Gmail SMTP. `EMAIL_PASSWORD` must be a Google **app password**, not the account password. `EMAIL_HOST` defaults to smtp.gmail.com. Registrations get the "The Torch Is Yours To Carry! 🔥" email with a referral code (FIRSTNAME + ME + 1123, the next number for a shared first name).
- **Merch:** the range and prices in `src/game/data/merch.ts` are placeholders.
- **Other placeholders:**
  - Lodging links go to a Booking.com search with the Feast dates; partner hotels aren't listed yet.
  - Vendor applications and the Give link need the church's real URLs.
  - The address search uses the public Nominatim service. Move to a hosted geocoder for launch traffic.
- **Minister videos:** taken from YouTube on 26 Oct 2026 (`src/game/data/ministers.ts`). Replace with official Feast promos when they're ready.
