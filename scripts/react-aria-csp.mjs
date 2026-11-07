import { createHash } from 'node:crypto';

// Exact usePress stylesheet from react-aria 3.52.1 (Apache-2.0).
// admin-csp-runtime.test.mjs compares these bytes with the installed dependency.
// Allow the stylesheet, not arbitrary style elements or a reusable static nonce.
export const reactAriaPressableCss = `@layer {
  [data-react-aria-pressable] {
    touch-action: pan-x pan-y pinch-zoom;
  }
}`;
export const reactAriaPressableHash = `sha256-${createHash('sha256').update(reactAriaPressableCss).digest('base64')}`;
