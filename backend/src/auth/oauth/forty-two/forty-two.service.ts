import { Inject, Injectable } from "@nestjs/common";
import { fortyTwoConfig } from "./forty-two.config";
import type { ConfigType } from "@nestjs/config";

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
    return `${this.config.baseUrl}?${params.toString()}`;
  }
}