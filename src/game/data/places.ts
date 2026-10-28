// Venue and installation coordinates. Street-level where OpenStreetMap had the venue,
// otherwise the venue's street/neighbourhood (marked approx). Addresses from wearethenew.org.

export type LatLon = { lat: number; lon: number };

export type Place = LatLon & {
  id: string;
  name: string;
  venue: string;
  address: string;
  country: "NG" | "UK" | "other";
  approx?: boolean;
};

export const FUSION_CENTRE: Place = {
  id: "fusion",
  name: "The Fusion Centre",
  venue: "The New Fusion Centre",
  address: "60A Surulere Industrial Avenue, Ogba, Ikeja, Lagos",
  country: "NG",
  lat: 6.6247679,
  lon: 3.3440103,
};

export const LAGOS_AIRPORT: LatLon & { name: string } = {
  name: "Murtala Muhammed International Airport",
  lat: 6.5774,
  lon: 3.3212,
};

export const INSTALLATIONS: Place[] = [
  { id: "ikeja", name: "Ikeja", venue: "The New Fusion Centre", address: "60 Industrial Avenue, Ogba", country: "NG", lat: 6.6247679, lon: 3.3440103 },
  { id: "island", name: "Island", venue: "Red Carpet Event Centre", address: "9 Chief Yesufu Abiodun Road, Oniru, Victoria Island", country: "NG", lat: 6.4355, lon: 3.4436, approx: true },
  { id: "yaba", name: "Yaba", venue: "Molebi Event Centre", address: "6 Jibowu Street, Yaba, Lagos", country: "NG", lat: 6.5193821, lon: 3.3696305 },
  { id: "ibadan", name: "Ibadan", venue: "Mainstay Events Centre", address: "Opposite Club 360, Akala, Ibadan", country: "NG", lat: 7.3660854, lon: 3.8148896, approx: true },
  { id: "ife", name: "Ife", venue: "Iyeru Events Centre", address: "Parakin, Ile-Ife", country: "NG", lat: 7.505, lon: 4.547, approx: true },
  { id: "akure", name: "Akure", venue: "Exclusive Event Hall", address: "FUTA South Junction, Ilesha Road, Akure", country: "NG", lat: 7.293, lon: 5.144, approx: true },
  { id: "london", name: "London", venue: "Novotel London Tower Bridge", address: "10 Pepys Street, EC3N 2NR", country: "UK", lat: 51.5105749, lon: -0.0775135 },
  { id: "birmingham", name: "Birmingham", venue: "Hotel IBIS", address: "21 Ladywell Walk, Arcadian Centre, B5 4ST", country: "UK", lat: 52.475231, lon: -1.8966285 },
];

/** Great-circle distance in km. */
export function distanceKm(a: LatLon, b: LatLon) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Anyone further than this flies into Lagos; closer origins start the drive directly. */
export const FLY_THRESHOLD_KM = 60;
