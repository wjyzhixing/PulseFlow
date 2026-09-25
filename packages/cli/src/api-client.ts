import { normalizePublishedBundle, type PublishedBundle } from './manifest.js';

export interface ApiClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async fetchLatest(pageId: string, token: string): Promise<PublishedBundle> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/api/cli/pages/${encodeURIComponent(pageId)}/latest`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } }
    );
    if (!response.ok) throw new Error(`Publication download failed with HTTP ${response.status}`);
    const envelope = await response.json() as { ok?: unknown; data?: unknown };
    if (envelope.ok !== true) throw new Error('Publication download returned an invalid response');
    return normalizePublishedBundle(envelope.data, pageId);
  }
}

export function createApiClient(baseUrl: string): Pick<ApiClient, 'fetchLatest'> {
  const client = new ApiClient({ baseUrl });
  return { fetchLatest: client.fetchLatest.bind(client) };
}
