# Examples

`hello-world/` is the static starter used by `npm run new`. It is not published in
the community catalog. Copy it using the scaffold command, then customize the
result under `blocks/`.

The generated `runtime.js` contains the released SDK 0.6.0 ESM bundle. Regenerate
it with `npm run sync:runtime` after deliberately updating the SDK pin. Existing
community packages are never updated automatically.
