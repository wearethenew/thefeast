# The Feast 2026: THE TORCH (3D experience plan)

Status: planning. Nothing built yet. Target domain: `thefeast.wearethenew.org` (no DNS record yet as of 26 Oct 2026).

## The event

- **What:** The Feast 2026, theme **THE TORCH**. Hosted by The New Church ("The New").
- **When:** 11–13 December 2026. The church's events page lists 10AM daily and an online option.
- **Where:** The Fusion Centre, 60A Surulere Industrial Avenue, Ogba, Ikeja, Lagos.
  - Corner of Acme Rd and Surulere Industrial Rd.
  - Coordinates: 6.62477, 3.34401.
  - About 6 km (straight line) north of Murtala Muhammed International Airport.
- **Ministers so far (from the posters):**
  - Pastor Shola Okodugha (host)
  - Minister Kaestrings
  - Minister Sunmisola Agbebi-Okeleye
- **Stream:** YouTube, The New Church.

## Brand, taken from the posters

- **Colours:** a royal-blue gradient background, a gold metallic "TORCH" wordmark, real flame orange and amber light flares, and The New's yellow circular heart logo.
- **The torch:** Olympic style, a silver and gold flared cup on a black grip with gold bands. This should be the in-game torch model.
- **Wardrobe:** the ministers wear royal-blue velvet robes with gold embroidery. This becomes the signature avatar outfit you can unlock.
- **Typography:** "THE FEAST" is set in a wide, letterspaced sans; "Minister" is in a script; names are in caps.

## The Fusion Centre, from the 21 architectural renders in the Drive folder

**Outside (compound):**
- A large rectangular steel-frame hall. Its **blue roof carries a huge yellow The New logo** that is visible from the air.
- The front façade is a wall of **multicolour glass panels** (pink, purple, green and teal).
- A side elevation is a white ribbed-metal wall with the round yellow "THE NEW Fusion Center" sign.
- A row of small container-style units runs along one long side. What they are for is unknown.
- A walkway under a covered coloured-glass canopy, with a light stone path.
- A front car park and a red-paver forecourt.
- A **basketball half-court** painted with the yellow logo.
- A **two-storey container kiosk with an orange frame** by the entrance, among palms.
- A black steel gate, a perimeter wall, and a rainbow-striped feature wall.
- Neighbours: Bolamark Engineering, the SON office (Ogba), Vital Products, Zenith Bank.

**Inside (main hall):**
- An exposed truss roof.
- A wide stage with a central LED wall, side screens and magenta/pink lighting.
- Three blocks of seating with a red-carpet centre aisle.
- A raised rear gallery or tech booth.

## The concept: "Carry the fire home"

Every attendee is a torch-bearer. They light their torch in their home city, travel to the Fusion Centre, and on Feast night every torch joins one flame. A live counter shows the total: torches lit, cities, countries.

### The journey

1. **Light your torch.** Pick your city on a globe, build your avatar and light your torch. This step is registration.
2. **Travel:**
   - **By air:** a flight arc lands at Murtala Muhammed. The signature shot is the plane passing over the Fusion Centre's blue roof and logo.
   - **By road:** a bus from Ibadan, Ife or Akure.
   - **Within Lagos:** taxi, danfo or keke to Ogba, with a light traffic-dodge mini-game.
   - **Each leg also gives real help:** an airport pickup or shuttle sign-up, a route to Acme Rd, and parking information.
3. **Arrive at the gate.** The orange container kiosk is the Welcome Desk: wristband, QR pass, check-in.
4. **Explore the compound.** Every spot is a working service (see the table below).
5. **The Feast live.** The hall's LED wall plays the YouTube stream. Online attendees take a virtual seat, and their torch joins the crowd.
6. **Carry the fire home.** Testimonies, next steps (Tribes, Service Teams, a campus), and the torch goes back to your city on the globe.

### What each spot in the compound does

| Spot (real or pop-up) | What it does |
|---|---|
| Main Hall | Book a seat per session, overflow assignment, livestream, session schedule |
| Orange container kiosk | Welcome Desk: registration, QR pass, FAQs |
| Glass-canopy walkway | "Hall of Torches": testimonies and photo frames shown on the coloured panels |
| Basketball court | Outdoor games: shootout, Tribe vs Tribe |
| Car-park pop-up tents (Feast weekend) | Travel Desk, Lodging Desk, Feast Market (vendors, food, TORCH merch), Give kiosk, Media booth |
| Container units along the side | Treasureville (kids), Teens zone, Prayer Room (Gethsemane), Volunteer HQ. Need to confirm what these rooms really are |

### Services

- **Lodging:** a list of partner hotels around Ikeja and Ogba, booked by deep link or WhatsApp. Plus an optional "Open Home" scheme where members host guests from out of town. No booking engine of our own.
- **Volunteering:** sign up for a Service Team (ushering, protocol, media, The New Music, Treasureville, prayer, medical, sanitation, parking, hospitality).
- **Giving and merch:** Paystack or Flutterwave.

### Games and social features

- **Torch Relay:** carry your flame through Lagos without it going out.
- **Tribe vs Tribe** leaderboard.
- **Pass the Fire:** invite links that light a friend's torch.
- **Fire in Scripture** trivia: the burning bush, Elijah, Pentecost.
- **Compound scavenger hunt** for badges.
- **Daily streaks** across the three days.
- **City leaderboard.**
- **Live presence:** other torch-bearers' avatars walking around the compound.

## Tech

- **Framework:** Next.js with React Three Fiber (three.js), the same base as Reboot Camp.
- **Art style:** stylized low-poly that follows the renders. First load under about 15MB, built for mid-range Android phones, with a "simple view" fallback.
- **Crowds:** thousands of torch-bearers drawn efficiently as one instanced batch.
- **Realtime presence:** Supabase or Firebase.
- **Globe:** three-globe.

## Timeline

| Date | Milestone |
|---|---|
| By 20 Nov | MVP for promotion: torch lighting and registration, globe and travel journey, compound, Welcome, Travel, Lodging and Volunteer desks |
| By 5 Dec | Seat booking, games, live presence, leaderboards |
| 11–13 Dec | Livestream in the hall, live torch counter, testimonies |

## Still needed

1. High-resolution originals of the renders. These are Drive files, so I need the user's OK to download them.
2. Hall capacity and seat count, and whether seat booking is real or symbolic.
3. What the container units are, and whether the renders match the finished building.
4. Session schedule per day, and the full list of ministers.
5. Logo SVG, fonts, and the poster PSD/AI files.
6. Partner hotels, and approval for "Open Home".
7. Volunteer departments, where registration data should go, and the payment provider.
8. Access to DNS for `wearethenew.org` and the hosting choice.
