import { createCatalogWorker } from './catalog.mjs'

// The runtime entrypoint exports only the handler, not test helpers or constants.
export default createCatalogWorker()
