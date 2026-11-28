// Saturday's breakout sessions (12 Dec, onsite only). Each has its own capacity; 750 places in all.
// Registration happens in the Main Hall: the attendant at the round table just inside the doors
// stops onsite Saturday registrants as they walk in (see Venue's Attendant and /api/breakout).

export type Breakout = { id: string; name: string; tag: string; about: string; cap: number; /** Who it's for, shown in brackets after the name. */ ages?: string };

export const BREAKOUTS: Breakout[] = [
  {
    id: "serene",
    name: "Serene",
    tag: "Soul Wellness",
    ages: "Ages 18–26",
    about:
      "A safe and confidential space for those navigating anxiety, grief, or other mental health challenges. You are seen, you are heard, and you don't have to navigate it alone. Strictly onsite.",
    cap: 100,
  },
  {
    id: "bezalel",
    name: "Bezalel",
    tag: "Creatives",
    about:
      "Here, you will explore how your God-given gifts, skills, and imagination can shape culture and influence the world. You will be immersed into supernatural creativity.",
    cap: 150,
  },
  {
    id: "women",
    name: "Women in Ministry",
    tag: "Women in Ministry",
    about:
      "Women have a distinct place in ministry. In this session, women will have the space to learn how to own their God-given message, share experiences, and spread like a wildfire. It is a space for encouragement, empowerment, and conversations around leading and serving effectively.",
    cap: 200,
  },
  {
    id: "arimathea",
    name: "Arimathea",
    tag: "Business & Career",
    about:
      "This is for professionals, entrepreneurs, and career builders seeking to align their work with purpose and impact. Here, you will gain real insights on how to make money, and achieve growth and excellence.",
    cap: 200,
  },
  {
    id: "seers",
    name: "The Seers",
    tag: "Company of Prophets",
    about:
      "For those called to the prophetic, you will deepen your understanding, sharpen your spiritual sensitivity, and grow in discernment. A space for learning, and fellowship with others in the prophetic.",
    cap: 100,
  },
];

/** "Serene (Ages 18–26)", "Bezalel". */
export const breakoutName = (b: Breakout) => (b.ages ? `${b.name} (${b.ages})` : b.name);
/** "Serene (Ages 18–26) · Soul Wellness", "Bezalel (Creatives)", "Women in Ministry". */
export const breakoutTitle = (b: Breakout) =>
  b.tag === b.name ? breakoutName(b) : b.ages ? `${breakoutName(b)} · ${b.tag}` : `${b.name} (${b.tag})`;

