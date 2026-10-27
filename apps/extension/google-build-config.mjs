import { createHash, createPublicKey } from 'node:crypto';
/** Public release artifacts never borrow an OAuth project or quota. */
export function googleBuildSettings(config, environment = {}, personal = false) {
  if (
    !config ||
    typeof config !== 'object' ||
    Object.keys(config).some(
      (key) => !['clientId', 'extensionPublicKey', 'extensionId'].includes(key),
    ) ||
    typeof config.extensionPublicKey !== 'string' ||
    config.clientId !== ''
  )
    throw new Error(
      'google-public.json must contain a blank clientId and only public extension identity fields.',
    );
  const publicDer = createPublicKey({
    key: Buffer.from(config.extensionPublicKey, 'base64'),
    type: 'spki',
    format: 'der',
  }).export({ type: 'spki', format: 'der' });
  const derivedId = createHash('sha256')
    .update(publicDer)
    .digest()
    .subarray(0, 16)
    .toString('hex')
    .replace(/[0-9a-f]/g, (value) => String.fromCharCode(97 + parseInt(value, 16)));
  if (config.extensionId !== derivedId)
    throw new Error('The public extension key and extension ID do not match.');
  const requested =
    typeof environment.MOCHI_GOOGLE_CLIENT_ID === 'string'
      ? environment.MOCHI_GOOGLE_CLIENT_ID.trim()
      : '';
  if (requested && !personal)
    throw new Error(
      'A Google client ID cannot enter a public build. Use --personal-google only for your own private build.',
    );
  if (personal && !requested)
    throw new Error('A personal Google build requires your own MOCHI_GOOGLE_CLIENT_ID.');
  if (requested && !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/u.test(requested))
    throw new Error('Use a valid public OAuth client ID from your own Google project.');
  return {
    key: config.extensionPublicKey,
    ...(personal ? { oauth2: { client_id: requested, scopes: [] } } : {}),
  };
}
