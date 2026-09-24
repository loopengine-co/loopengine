// adapters/http.ts's own /storage-redirect route (handleStorageRedirect)
// dispatches on ?provider=... into whichever of these a deployment
// actually needs — one small, independent module per cloud storage
// backend, none of them known to the route itself beyond this registry.
// Adding a new provider (S3, Azure Blob, ...) later is a new file here
// plus one new entry, not a rewrite of the route or a new ability
// capability — see gcs.ts for the shape a new one follows. Named
// generically (/storage-redirect, not /gcs-redirect) from the start for
// exactly this reason, even though gcs is the only one that exists
// today: an ability's own code/docs bake in a literal URL, and renaming
// that later, once more than one ability depends on it, is real churn a
// provider-agnostic name up front avoids entirely.
import type { StorageSigner } from './types.js'
import { signGcsUrl } from './gcs.js'

export const storageSigners: Record<string, StorageSigner> = {
  gcs: signGcsUrl,
}
