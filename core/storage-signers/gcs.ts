import type { SignRequest } from './types.js'

// Extracted straight out of adapters/http.ts's own original
// handleGcsRedirect, unchanged apart from returning the signed URL
// instead of writing the HTTP response itself — see index.ts's own doc
// comment for why signing lives here, one file per provider, instead of
// inline in the route handler.
export async function signGcsUrl(req: SignRequest): Promise<string> {
  // Imported by a variable, not a string literal, so tsc treats this as
  // Promise<any> instead of trying to resolve @google-cloud/storage's
  // own types at compile time — installing it is only required at
  // runtime for a deployment that actually uses this provider, not
  // every loopengine install.
  const gcsModuleName = '@google-cloud/storage'
  let gcs: any
  try {
    gcs = await import(gcsModuleName)
  } catch {
    throw new Error('requires the @google-cloud/storage package — npm install @google-cloud/storage in your own project.')
  }

  let client: any
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (credentialsJson) {
    let credentials: { project_id?: string }
    try {
      credentials = JSON.parse(credentialsJson)
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON — paste the entire contents of the downloaded service-account key file, unedited.')
    }
    client = new gcs.Storage({ credentials, projectId: credentials.project_id })
  } else {
    client = new gcs.Storage()
  }

  const file = client.bucket(req.bucket).file(req.object)
  const expires = Date.now() + 5 * 60 * 1000
  const signOptions: Record<string, unknown> = { action: 'read', expires }
  if (req.disposition === 'attachment') {
    signOptions.responseDisposition = `attachment; filename="${req.filename || req.object.split('/').pop()}"`
  }
  const [signedUrl] = await file.getSignedUrl(signOptions)
  return signedUrl as string
}
