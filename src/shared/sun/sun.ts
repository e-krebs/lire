const RAD = Math.PI / 180;
const HORIZON_DEG = -0.833;
const MINUTE_MS = 60_000;
const SCAN_STEP_MS = 10 * MINUTE_MS;
const SCAN_SPAN_MS = 2 * 24 * 60 * MINUTE_MS;
const POLAR_RECHECK_MS = 6 * 60 * MINUTE_MS;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;

const elevation = ({ ms, lat, lon }: { ms: number; lat: number; lon: number }) => {
  const centuries = (ms - J2000_MS) / (DAY_MS * 36525);
  const meanLon = (280.46646 + centuries * (36000.76983 + centuries * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + centuries * (35999.05029 - 0.0001537 * centuries);
  const eccentricity = 0.016708634 - centuries * (0.000042037 + 0.0000001267 * centuries);
  const m = meanAnomaly * RAD;
  const center =
    Math.sin(m) * (1.914602 - centuries * (0.004817 + 0.000014 * centuries)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * centuries) +
    Math.sin(3 * m) * 0.000289;
  const apparentLon =
    meanLon + center - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * centuries) * RAD);
  const obliquity =
    23 +
    (26 + (21.448 - centuries * (46.815 + centuries * (0.00059 - centuries * 0.001813))) / 60) /
      60 +
    0.00256 * Math.cos((125.04 - 1934.136 * centuries) * RAD);
  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLon * RAD));
  const y = Math.tan((obliquity * RAD) / 2) ** 2;
  const l0 = meanLon * RAD;
  const equationOfTime =
    (4 *
      (y * Math.sin(2 * l0) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
        0.5 * y * y * Math.sin(4 * l0) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m))) /
    RAD;
  const minutesUtc =
    new Date(ms).getUTCHours() * 60 +
    new Date(ms).getUTCMinutes() +
    new Date(ms).getUTCSeconds() / 60 +
    new Date(ms).getUTCMilliseconds() / MINUTE_MS;
  const solarTime = (minutesUtc + equationOfTime + 4 * lon) % 1440;
  const hourAngle = (solarTime / 4 - 180) * RAD;
  const latRad = lat * RAD;
  const cosZenith =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD;
};

export const sunPhase = ({
  at,
  lat,
  lon,
}: {
  at: Date;
  lat: number;
  lon: number;
}): { phase: "day" | "dusk"; nextChangeAt: Date } => {
  const isUp = (ms: number) => elevation({ ms, lat, lon }) > HORIZON_DEG;
  const start = at.getTime();
  const startsUp = isUp(start);
  const phase = startsUp ? "day" : "dusk";

  for (let from = start; from < start + SCAN_SPAN_MS; from += SCAN_STEP_MS) {
    const to = from + SCAN_STEP_MS;
    if (isUp(to) === startsUp) continue;
    let low = from;
    let high = to;
    while (high - low > 1000) {
      const mid = (low + high) / 2;
      if (isUp(mid) === startsUp) low = mid;
      else high = mid;
    }
    return { phase, nextChangeAt: new Date(Math.ceil(high / 1000) * 1000) };
  }
  return { phase, nextChangeAt: new Date(start + POLAR_RECHECK_MS) };
};
