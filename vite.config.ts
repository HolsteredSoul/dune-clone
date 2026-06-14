import { defineConfig } from 'vite';

// `base` must match the GitHub repo name so that asset URLs resolve correctly when the
// production build is served from https://holsteredsoul.github.io/dune-clone/ (GitHub Pages).
// Local `npm run dev` then serves at http://localhost:5173/dune-clone/ — play.bat's --open
// handles that automatically.
export default defineConfig({
  base: '/dune-clone/',
});
