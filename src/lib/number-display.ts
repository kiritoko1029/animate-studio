/** Keep the upstream range finite even when a document combines a huge number and a tiny step. */
export function scrollingNumberOptions(value: number, fontSize = 44, requestedStep?: number) {
  const defaultStep = Math.max(1, Math.ceil(Math.abs(value) / 10));
  const requested = requestedStep && requestedStep > 0 ? requestedStep : defaultStep;
  const step = Math.max(requested, Math.abs(value) / 1000);
  return { step, itemsSize: Math.ceil(fontSize * 1.3), adjusted: step !== requested };
}
