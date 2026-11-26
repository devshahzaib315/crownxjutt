# SIGMA — Premium Portfolio

A cinematic, responsive creative-developer portfolio for Shahzaib.

## Visual direction
- SIGMA blue/chrome identity
- Midnight-navy surfaces and electric-blue accents
- User-provided shattered-glass background and SIGMA MD logo
- Three.js custom-shader hero object with metallic-blue lighting
- Responsive project studies, expertise, process, toolkit, FAQ and contact
- Contact email: dev.shahzaib.92@gmail.com

## Run locally (Windows)
1. Extract the ZIP.
2. Open Command Prompt in this folder.
3. Run: `python -m http.server 5500`
4. Open: `http://localhost:5500`

Three.js and Google Fonts load from their CDNs, so an internet connection is required for the full WebGL and typography experience. The page includes a CSS fallback if WebGL cannot initialise.

The SIGMA logo is shown in the header, preloader, footer, and as a final centered brand signature at the very bottom of the page.

The SIGMA logo asset uses a transparent background, so it blends into the page instead of appearing as a rectangular picture tile.

Latest visual update: removed the duplicate small logo from the footer, kept the centered SIGMA signature at the very bottom, and replaced the page background with the user's new blue shattered-glass image.

## Branding and SEO update
- The supplied red crown artwork is extracted from its checkerboard preview and used alone for browser favicons and Apple touch icon.
- A custom 1200×630 Open Graph social preview image is included at `assets/og-image.png`.
- Added Open Graph and Twitter large-image metadata, author, robots, keywords, theme colour, and Person JSON-LD.
- SEO username: `devshahzaib315` (also exposed as `@devshahzaib315`).
- Before launch, replace relative social preview image URLs with absolute URLs on the final deployed domain if your hosting platform requires them for link previews.
