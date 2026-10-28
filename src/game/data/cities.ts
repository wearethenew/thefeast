// Cities shown on the globe as you zoom in. tier 1: visible from space, 2: regional, 3: close-up.

export type City = { name: string; lat: number; lon: number; tier: 1 | 2 | 3 };

export const CITIES: City[] = [
  // Lagos area
  { name: "Lagos", lat: 6.5244, lon: 3.3792, tier: 1 },
  { name: "Ikeja", lat: 6.6018, lon: 3.3515, tier: 3 },
  { name: "Lekki", lat: 6.4698, lon: 3.5852, tier: 3 },
  { name: "Ikorodu", lat: 6.6194, lon: 3.5105, tier: 3 },
  { name: "Ota", lat: 6.6804, lon: 3.2356, tier: 3 },
  { name: "Epe", lat: 6.5841, lon: 3.9834, tier: 3 },
  // south-west Nigeria
  { name: "Abeokuta", lat: 7.1475, lon: 3.3619, tier: 3 },
  { name: "Sagamu", lat: 6.8322, lon: 3.6319, tier: 3 },
  { name: "Ijebu-Ode", lat: 6.8194, lon: 3.9173, tier: 3 },
  { name: "Ibadan", lat: 7.3775, lon: 3.947, tier: 2 },
  { name: "Oyo", lat: 7.8526, lon: 3.9312, tier: 3 },
  { name: "Ogbomosho", lat: 8.1335, lon: 4.2401, tier: 3 },
  { name: "Osogbo", lat: 7.7827, lon: 4.5418, tier: 3 },
  { name: "Ile-Ife", lat: 7.4824, lon: 4.5603, tier: 3 },
  { name: "Ilesha", lat: 7.6177, lon: 4.7416, tier: 3 },
  { name: "Ondo", lat: 7.0932, lon: 4.8353, tier: 3 },
  { name: "Akure", lat: 7.2571, lon: 5.2058, tier: 2 },
  { name: "Ilorin", lat: 8.4966, lon: 4.5421, tier: 2 },
  { name: "Benin City", lat: 6.335, lon: 5.6037, tier: 2 },
  // rest of Nigeria + neighbours
  { name: "Abuja", lat: 9.0765, lon: 7.3986, tier: 1 },
  { name: "Port Harcourt", lat: 4.8156, lon: 7.0498, tier: 2 },
  { name: "Kano", lat: 12.0022, lon: 8.592, tier: 2 },
  { name: "Enugu", lat: 6.4584, lon: 7.5464, tier: 2 },
  { name: "Cotonou", lat: 6.3703, lon: 2.3912, tier: 2 },
  { name: "Porto-Novo", lat: 6.4969, lon: 2.6283, tier: 3 },
  { name: "Accra", lat: 5.6037, lon: -0.187, tier: 1 },
  // UK
  { name: "London", lat: 51.5074, lon: -0.1278, tier: 1 },
  { name: "Birmingham", lat: 52.4862, lon: -1.8904, tier: 2 },
  { name: "Manchester", lat: 53.4808, lon: -2.2426, tier: 2 },
  { name: "Leeds", lat: 53.8008, lon: -1.5491, tier: 3 },
  { name: "Liverpool", lat: 53.4084, lon: -2.9916, tier: 3 },
  { name: "Bristol", lat: 51.4545, lon: -2.5879, tier: 3 },
  { name: "Glasgow", lat: 55.8642, lon: -4.2518, tier: 2 },
  // diaspora hubs
  { name: "Paris", lat: 48.8566, lon: 2.3522, tier: 1 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708, tier: 1 },
  { name: "Johannesburg", lat: -26.2041, lon: 28.0473, tier: 1 },
  { name: "New York", lat: 40.7128, lon: -74.006, tier: 1 },
  { name: "Toronto", lat: 43.6532, lon: -79.3832, tier: 1 },
  { name: "Houston", lat: 29.7604, lon: -95.3698, tier: 1 },
  { name: "Atlanta", lat: 33.749, lon: -84.388, tier: 2 },
];

/** Region covered by the high-detail south-west Nigeria map (public/globe/swng.png). */
export const SWNG = { lon0: 2.6, lon1: 6.2, lat0: 6.2, lat1: 8.4 };
/** Great Britain close-up map (public/globe/uk.png). */
export const UK_MAP = { lon0: -8.5, lon1: 2.2, lat0: 49.8, lat1: 58.8 };
