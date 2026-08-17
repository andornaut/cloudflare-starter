import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // SvelteKit emits the header itself for pages it renders, adding a nonce
    // to script-src for its own hydration script. The hook in
    // src/hooks.server.ts sets the same policy on every other response
    // (redirects, errors), which SvelteKit does not render.
    //
    // SvelteKit also adds 'unsafe-inline' to style-src, which it needs for the
    // critical CSS it inlines during SSR. Scripts stay nonce-restricted, which
    // is the half that matters for XSS.
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        // frame-ancestors does not fall back to default-src, so it is named
        // here and repeated in the hook's fallback policy.
        "frame-ancestors": ["none"],
      },
    },
  },
};
