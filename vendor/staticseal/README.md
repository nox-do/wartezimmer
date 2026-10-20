# StaticSeal runtime

Source: https://github.com/nox-do/staticseal

Version 1.2.0, commit `61fb2ee23b821d46fd416168cf2ef4b09d1950ce`.
The four files in `src/` are unchanged upstream runtime files. MIT license in
`LICENSE`. Only this runtime subset is needed; no installation or network access
is required when building the website.

`scripts/seal-pages.mjs` creates uncompressed no-password v4 page packages using
the upstream renderer and validates the payload roundtrip with its decoder.
It adds German opening text, a JavaScript notice and a CSP with
hashes for the generated inline code. The original page is restored on click.
This obstructs simple text crawlers; it provides no confidentiality or protection
against crawlers that decode the payload or open the page.
