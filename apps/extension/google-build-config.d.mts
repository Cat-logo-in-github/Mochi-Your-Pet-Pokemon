export function googleBuildSettings(
  config: unknown,
  environment?: Record<string, string | undefined>,
  personal?: boolean,
): { key: string; oauth2?: { client_id: string; scopes: string[] } };
