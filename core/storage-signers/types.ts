// One shape every storage backend's own signer implements — see
// index.ts's own doc comment for why this exists as a small registry of
// independent modules instead of one big provider-specific route.
export interface SignRequest {
  bucket: string
  object: string
  disposition?: 'inline' | 'attachment'
  filename?: string
}

export type StorageSigner = (req: SignRequest) => Promise<string>
