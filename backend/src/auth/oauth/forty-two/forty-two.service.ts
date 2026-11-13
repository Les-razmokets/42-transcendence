import { Inject, Injectable } from "@nestjs/common";
import { fortyTwoConfig } from "./forty-two.config";
import type { ConfigType } from "@nestjs/config";
import { fortyTwoProfileSchema, tokenResponseSchema, type FortyTwoProfile } from "./utils/forty-two-response.schema";
import { FortyTwoAuthException } from "./utils/forty-two-auth.exception";

@Injectable()
export class FortyTwoClientService {
  constructor(
    @Inject(fortyTwoConfig.KEY)
    private readonly config: ConfigType<typeof fortyTwoConfig>,
  ) {}

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