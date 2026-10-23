/** Minimal WhatsApp Cloud API client (official Graph API, ESCOPO §2). */

export type GraphErrorKind =
  | 'outside_window'
  | 'invalid_token'
  | 'rate_limited'
  | 'recipient'
  | 'template'
  | 'server'
  | 'network'
  | 'other';

/** A Graph API failure, classified so queues know whether retrying can help. */
export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly kind: GraphErrorKind,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

export function classifyGraphError(
  status: number,
  code?: number,
): { kind: GraphErrorKind; retryable: boolean } {
  if (code === 131047) return { kind: 'outside_window', retryable: false };
  if (code === 190 || status === 401) return { kind: 'invalid_token', retryable: false };
  if (code === 130429 || code === 131056 || code === 80007 || code === 4 || status === 429) {
    return { kind: 'rate_limited', retryable: true };
  }
  if (code === 131026 || code === 131021 || code === 131030)
    return { kind: 'recipient', retryable: false };
  if (code !== undefined && code >= 132000 && code < 133000)
    return { kind: 'template', retryable: false };
  if (status >= 500) return { kind: 'server', retryable: true };
  return { kind: 'other', retryable: false };
}

export type WhatsAppClientOptions = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type TemplateMessage = {
  name: string;
  language: string;
  /** Values for {{1}}, {{2}}... in the template body. */
  bodyParams?: string[];
  /** Full components, when the template needs header/buttons parameters. */
  components?: unknown[];
};

export type Button = { id: string; title: string };
export type ListSection = {
  title?: string;
  rows: { id: string; title: string; description?: string }[];
};

export class WhatsAppClient {
  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(private readonly options: WhatsAppClientOptions) {
    this.base = `${options.baseUrl ?? 'https://graph.facebook.com'}/${options.graphVersion ?? 'v23.0'}`;
    this.http = options.fetch ?? fetch;
  }

  sendText(to: string, body: string, opts: { previewUrl?: boolean; replyTo?: string } = {}) {
    return this.send(to, {
      type: 'text',
      text: { body, preview_url: opts.previewUrl ?? false },
      ...(opts.replyTo ? { context: { message_id: opts.replyTo } } : {}),
    });
  }

  sendTemplate(to: string, template: TemplateMessage) {
    const components =
      template.components ??
      (template.bodyParams?.length
        ? [
            {
              type: 'body',
              parameters: template.bodyParams.map((text) => ({ type: 'text', text })),
            },
          ]
        : []);
    return this.send(to, {
      type: 'template',
      template: { name: template.name, language: { code: template.language }, components },
    });
  }

  /** Up to 3 reply buttons (titles up to 20 characters). */
  sendButtons(to: string, body: string, buttons: Button[], opts: { footer?: string } = {}) {
    if (buttons.length < 1 || buttons.length > 3)
      throw new Error('WhatsApp allows 1 to 3 reply buttons');
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        ...(opts.footer ? { footer: { text: opts.footer } } : {}),
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  /** List message (up to 10 rows in total). */
  sendList(to: string, body: string, buttonLabel: string, sections: ListSection[]) {
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: sections.map((s) => ({
            ...(s.title ? { title: s.title.slice(0, 24) } : {}),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    });
  }

  /** Asks the contact to share their location (Log: temperature and delivery events). */
  sendLocationRequest(to: string, body: string) {
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: body },
        action: { name: 'send_location' },
      },
    });
  }

  async markRead(wamid: string): Promise<void> {
    await this.request('POST', `/${this.options.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: wamid,
    });
  }

  /** Short-lived download URL and metadata of an inbound media item. */
  async getMedia(
    mediaId: string,
  ): Promise<{ url: string; mimeType: string; sha256?: string; fileSize?: number }> {
    const json = (await this.request('GET', `/${mediaId}`)) as {
      url: string;
      mime_type: string;
      sha256?: string;
      file_size?: number;
    };
    return {
      url: json.url,
      mimeType: json.mime_type,
      sha256: json.sha256,
      fileSize: json.file_size,
    };
  }

  async downloadMedia(url: string, maxBytes = 100 * 1024 * 1024): Promise<Buffer> {
    const res = await this.fetchWithTimeout(url, {
      headers: { authorization: `Bearer ${this.options.accessToken}` },
    });
    if (!res.ok) {
      const { kind, retryable } = classifyGraphError(res.status);
      throw new GraphApiError(`media download failed (${res.status})`, kind, retryable, res.status);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes)
      throw new GraphApiError('media too large', 'other', false, res.status);
    return buffer;
  }

  /** Checks the token and returns the number's public data (panel "Testar"). */
  async getPhoneNumber(): Promise<{ displayPhoneNumber: string; verifiedName?: string }> {
    const json = (await this.request(
      'GET',
      `/${this.options.phoneNumberId}?fields=display_phone_number,verified_name`,
    )) as { display_phone_number: string; verified_name?: string };
    return { displayPhoneNumber: json.display_phone_number, verifiedName: json.verified_name };
  }

  async listTemplates(wabaId: string): Promise<
    {
      id: string;
      name: string;
      language: string;
      category: string;
      status: string;
      components: unknown[];
    }[]
  > {
    const out: {
      id: string;
      name: string;
      language: string;
      category: string;
      status: string;
      components: unknown[];
    }[] = [];
    let path: string | null =
      `/${wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components`;
    while (path) {
      const json = (await this.request('GET', path)) as {
        data: {
          id: string;
          name: string;
          language: string;
          category: string;
          status: string;
          components?: unknown[];
        }[];
        paging?: { next?: string };
      };
      out.push(...json.data.map((t) => ({ ...t, components: t.components ?? [] })));
      path = json.paging?.next ? json.paging.next.replace(this.base, '') : null;
    }
    return out;
  }

  private async send(to: string, message: Record<string, unknown>): Promise<{ wamid: string }> {
    const json = (await this.request('POST', `/${this.options.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...message,
    })) as { messages?: { id: string }[] };
    const wamid = json.messages?.[0]?.id;
    if (!wamid) throw new GraphApiError('send returned no message id', 'other', false);
    return { wamid };
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.options.accessToken}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new GraphApiError(`network error: ${(error as Error).message}`, 'network', true);
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_data?: { details?: string } };
    };
    if (!res.ok || json.error) {
      const code = json.error?.code;
      const { kind, retryable } = classifyGraphError(res.status, code);
      const detail = json.error?.error_data?.details ?? json.error?.message ?? `HTTP ${res.status}`;
      throw new GraphApiError(detail, kind, retryable, res.status, code);
    }
    return json;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    try {
      return await this.http(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
