// Eighteen hues, 20° apart, picked by a stable hash of the feed id, so a feed keeps its colour.
// Twelve had two feeds in forty sharing a colour twice as often, and a mixed hash barely moved
// that: the step count is the only lever. Past eighteen the steps stop reading as different hues.
const HUE_STEPS = 18;

const hashOf = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
};

export const feedHue = (feedId: string): number => (hashOf(feedId) % HUE_STEPS) * (360 / HUE_STEPS);
