# Lexicon website

**[Open the live preview →](https://baraajam.github.io/tailwind-css-workshop/)**

A frontend design project built in three days, with responsive layouts, scroll
animations, and interactive ASCII artwork. Built with Tailwind CSS, GSAP, and local fonts.

The text about Lexicon is placeholder copy for the design and may not accurately
describe the company's services.

## Build

Use Node.js 22 or 24.

```sh
npm ci
npm run build:deploy
```

Upload the contents of `dist/` to a static host. It contains the page, runtime scripts,
styles, images, and required licenses. It excludes tests, build tools, source fonts,
and unused artwork. Asset paths also work under a GitHub project repository URL.

After changing fonts or matrix SVGs, rebuild to update their embedded bundles.

## GitHub Pages

Push this repository to GitHub. In **Settings → Pages → Build and deployment**,
select **GitHub Actions** as the source. The workflow deploys `dist/` when you push
to `main`, or when you run it from the Actions tab.

Keep `scripts/`, `styles/`, source artwork, font licenses, and the npm lockfile in Git
so another checkout can rebuild the site. Local `tests/` remain on disk but Git ignores
them; run `npm test` on the development checkout to use them.

Login, signup, and social links still use placeholder destinations. Set their real
URLs before using this site for live customer signups.
