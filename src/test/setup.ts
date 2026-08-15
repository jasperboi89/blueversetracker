/**
 * Deterministic jsdom shims for the component tests.
 *
 * jsdom implements neither `Element.prototype.scrollIntoView` nor the
 * ResizeObserver/pointer-capture APIs that Radix poppers call from layout
 * effects. Without them Radix throws *asynchronously*, which surfaced as the
 * long-standing "dialog flake": the failure landed in whichever test happened
 * to be running when the effect flushed. Shimming them here makes the suite
 * deterministic instead of order-dependent.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverShim;
}
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}
