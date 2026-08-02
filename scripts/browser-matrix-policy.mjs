const WEBKIT_TRANSPORT_FAILURES = Object.freeze([
  /page\.goto: Connection terminated unexpectedly/u,
]);

export const MAX_WEBKIT_TRANSPORT_ATTEMPTS = 3;

export function isRetryableWebKitTransportFailure(engine, output) {
  if (engine !== "webkit" || typeof output !== "string") return false;
  return WEBKIT_TRANSPORT_FAILURES.some((pattern) => pattern.test(output));
}
