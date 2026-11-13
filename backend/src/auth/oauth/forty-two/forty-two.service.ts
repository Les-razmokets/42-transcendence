import { Inject, Injectable } from "@nestjs/common";
import { fortyTwoConfig } from "./forty-two.config";
import type { ConfigType } from "@nestjs/config";
import { fortyTwoProfileSchema, tokenResponseSchema, type FortyTwoProfile } from "./utils/forty-two-response.schema";
import { FortyTwoAuthException } from "./utils/forty-two-auth.exception";

// HTTP client for the 42 API. The only place that talks to 42.
// Every failure (HTTP error, timeout, bad JSON, unexpected shape) becomes the same
// FortyTwoAuthException, so callers never have to tell the cases apart.
@Injectable()
export class FortyTwoClientService {
  constructor(
    @Inject(fortyTwoConfig.KEY)
    private readonly config: ConfigType<typeof fortyTwoConfig>,
  ) {}

  // builds the 42 authorization URL the browser is sent to (the client secret is never in it)
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      response_type: "code",
      scope: "public",
      state: state,
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  // trades the one-time code from the callback for a 42 access token (server to server, with the client secret)
  async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const res = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          redirect_uri: this.config.callbackUrl,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!res.ok)
        throw new FortyTwoAuthException();
      const rawData: unknown = await res.json();
      const parsedData = tokenResponseSchema.safeParse(rawData);
      if (!parsedData.success)
        throw new FortyTwoAuthException();
      return parsedData.data.access_token;
    } catch {
      throw new FortyTwoAuthException();
    }
  }

  // reads the user's profile (GET /v2/me) and returns it already validated and mapped to our shape.
  // The 42 token is only used here: it is never stored or logged.
  async readProfile(token: string): Promise<FortyTwoProfile> {
    try {
      const res = await fetch(this.config.profileUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!res.ok)
        throw new FortyTwoAuthException();
      const rawData: unknown = await res.json();
      const parsedData = fortyTwoProfileSchema.safeParse(rawData);
      if (!parsedData.success)
        throw new FortyTwoAuthException();
      return parsedData.data;
    } catch {
      throw new FortyTwoAuthException();
    }
  }
}