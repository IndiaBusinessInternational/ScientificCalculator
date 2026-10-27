# IBI Scientific Calculator v1.2

A free scientific calculator web app by India Business International, for school students, college students and professionals. It runs entirely in the browser, installs as an app (PWA) and works offline.

## What it does

| Tab | Features |
|---|---|
| Calculate | Basic (school) and Scientific keypads, 2nd and hyp keys, live preview, textbook display (KaTeX), operator precedence and brackets, %, memory (MC, MR, M+, M−), Ans and PreAns, variables A–F, x, y, z, user functions `f(x) = …`, history (200 lines), DEG / RAD / GRAD, Norm / Fix / Sci / Eng, Indian digit grouping, S⇔D (fraction, mixed number, π and √ forms), complex numbers (a+bi, r∠θ), DMS, nPr / nCr, HCF / LCM, prime factors, ∫, d/dx, Σ, Π, limits, solve, units (`10 inch to cm`) |
| Equations | Simultaneous linear (2–4 unknowns, with no-solution / infinite-solution detection), polynomials of degree 2–4 with complex roots, vertex, discriminant and turning points, polynomial inequalities, and any equation f(x) = g(x) over a range |
| Graph | Up to 6 functions, pan, pinch / scroll zoom, tap to trace, roots, minima, maxima, intercepts and crossings, table of values, save as PNG |
| Statistics | 1- and 2-variable data with frequencies, quartiles, mode, SDs, regressions (linear, quadratic, log, exponential ×2, power, inverse) with r and r², estimates, histogram and scatter chart |
| Matrix / Vector | Matrices A–D up to 6×6 and vectors A–C in 2D / 3D: +, −, ×, inverse, transpose, determinant, rank, RREF, trace, eigenvalues, dot, cross, angle, projection, typed expressions |
| Calculus | Symbolic derivatives (1st–3rd) with value and tangent line, definite integrals including ±∞, Σ and Π, two-sided limits |
| Base-N | HEX / DEC / OCT / BIN, 8–64-bit signed or unsigned, AND, OR, XOR, NOT, NAND, NOR, shifts, MOD, bit grid |
| Units | 15 categories, including Indian land units (cent, ground, guntha) and tola |
| Constants | 36 CODATA 2018 / IAU constants with search, insert and copy |

**Help assistant (v1.1):** a chat-style “how do I…” helper behind the ? button in the header. 57 topics with key steps, an example and a **Try it** button that loads the example; quick questions for School, College and Work; search with typo tolerance; works offline with no AI or network. ⌄ / Esc / Back minimise and keep the chat, ⟲ starts again, ✕ ends it.

Also: light / dark switch, install banner and Install button, Share button (`ibi-share.js`), backup and restore of all data (JSON), offline service worker, edge-to-edge layout with two columns from 1000 px.

## Files

- `index.html`, `app.css`, `app.js` (engine, Calculate tab, overlays, settings), `tools.js` (the other tabs), `help.js` (help assistant and its knowledge base)
- `lib/math-15.2.0.min.js`: math.js 15.2.0 (Apache-2.0, licence in `lib/MATHJS-LICENSE.txt`)
- KaTeX 0.19.0 (MIT) is loaded from jsDelivr for the textbook display; the app works without it.
- `sw.js` (cache `ibi-scicalc-v1-2`), `manifest.json` (id `/scientific-calculator/`), `icons/`, `og-banner.jpg`, `ibi-share.js`

## Versions

- **v1.2** (27 Oct 2026): Install button always in the header (Installed ✓ once installed, hidden inside the installed app); with no native prompt it opens step-by-step install instructions for the user's browser (Android Chrome, Samsung, Firefox, iPhone Safari/Chrome, Chrome/Edge desktop, Mac Safari, in-app browsers); a dismissible install banner after the first calculation.
- **v1.1** (27 Oct 2026): Help assistant; brackets in the textbook preview line are brighter.
- **v1.0** (27 Oct 2026): first release.

## Release

Bump the version in the badge and footer (`index.html`), `VERSION` in `app.js`, the header comments of `app.js`, `tools.js`, `app.css`, `sw.js`, the `?v=` query strings, `CACHE` in `sw.js`, this heading and the git tag.
