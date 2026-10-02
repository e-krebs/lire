// What another locale must provide for a source catalog: every key, a string for each string,
// and the same arguments for each function.
export type Messages<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends string
      ? string
      : Messages<T[K]>;
};
