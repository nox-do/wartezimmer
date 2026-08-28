# Pebble test CA (lab only)

`pebble.minica.pem` is the public root from Let's Encrypt Pebble `v2.10.1`
(`test/certs/pebble.minica.pem`). The matching private key is public upstream —
**do not** add this CA to any system-wide or production trust store.

Lab use: mount into the proxy only while the TLS lab overlay is active so Caddy
can speak HTTPS to `https://pebble:14000/dir`. Leaf-certificate trust for
browsers/Setup checks is Arbeitspaket 3.
