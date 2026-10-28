/** Live city-traffic positions (written by Traffic each frame): the player's autopilot weaves through them, the street columns give way to them. */
export const trafficNow: { x: number; z: number; h: number; speed: number; len: number }[] = [];
/** City cars standing in the way of a street column (it can't move on): they back out (see Traffic). */
export const inTheWay: { x: number; z: number }[] = [];
