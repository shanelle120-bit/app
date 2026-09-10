// v1 scope toggles. Chat/Mingle/Accountability/Trading Only are already fully built
// (backend + screens) but deferred from the UI for the initial web launch. Flip a flag
// to `true` (and re-add the relevant nav entry point) to bring a phase back online —
// no rewrite needed.
export const FEATURES_V1 = {
  chat: false,
  mingle: false,
  accountability: false,
  tradingOnly: false,
} as const;
