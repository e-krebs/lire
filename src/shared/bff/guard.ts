// NewsBlur bans the Worker's shared IP for 24 hours on either sequence, so input holding one
// must not reach upstream.
const BAN_SEQUENCE = /<script|\.\.\/\.\.\/\.\.\//i;

export const hasBanPayload = (value: unknown): boolean => {
  if (typeof value === "string") return BAN_SEQUENCE.test(value);
  if (Array.isArray(value)) return value.some((item: unknown) => hasBanPayload(item));
  if (typeof value === "object" && value !== null)
    return Object.entries(value).some(
      ([key, item]: [string, unknown]) => BAN_SEQUENCE.test(key) || hasBanPayload(item),
    );
  return false;
};
