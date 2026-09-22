/** Frame bounds relative to the circular avatar, measured from the podium artwork. */
const frames = {
  1: { src: '/recruiters-view/podium/gold.png', x: -.0217, y: -.2016, w: 1.0975, h: 1.2411 },
  2: { src: '/recruiters-view/podium/silver.png', x: -.0266, y: -.1991, w: 1.1257, h: 1.2346 },
  3: { src: '/recruiters-view/podium/bronze.png', x: -.0590, y: -.2240, w: 1.1180, h: 1.2831 },
} as const;

export function podiumFrame(rank?: number) {
  return rank === 1 || rank === 2 || rank === 3 ? frames[rank] : undefined;
}
