// Disable SSR for the entire app.
// This is a client-rendered SPA behind authentication - no SSR benefit.
// Also avoids Cloudflare Workers incompatibility with jsdom-dependent packages.
export const ssr = false;
