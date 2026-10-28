// Ministers announced on The Feast 2026 posters, with YouTube videos to play on the hall screens.
// Video IDs found via YouTube search on 26 Oct 2026; swap for official Feast promos when available.

export type MinisterVideo = { id: string; title: string };
export type Minister = { id: string; title: string; name: string; role: string; videos: MinisterVideo[] };

export const MINISTERS: Minister[] = [
  {
    id: "shola",
    title: "Pastor",
    name: "Shola Okodugha",
    role: "Global Lead Pastor, The New Church",
    videos: [
      { id: "n8N0XyQeajk", title: "The Shofar [Finale] · The Feast 2025" },
      { id: "SlV8gUuYcwU", title: "Redefining Christianity: Living Generously" },
      { id: "7TbBHlbqvcY", title: "Redefining Christianity: What Is True Christianity?" },
    ],
  },
  {
    id: "sunmisola",
    title: "Minister",
    name: "Sunmisola Agbebi-Okeleye",
    role: "Worship",
    videos: [
      { id: "-6EkDpKNjKs", title: "The Feast Worship · Day 3, Feast 2025" },
      { id: "z_gtrZ63sIw", title: "The Feast: Worship Medley Vol. 3" },
      { id: "6p4-3bfB8Cc", title: "Wonder (with Kaestrings)" },
    ],
  },
  {
    id: "kaestrings",
    title: "Minister",
    name: "Kaestrings",
    role: "Worship",
    videos: [
      { id: "AyvNaEQDn1M", title: "Fear of God · Live" },
      { id: "mvd8GpkyW2o", title: "More · Live" },
      { id: "MsdCUqObd78", title: "Nasara · Live" },
    ],
  },
];
