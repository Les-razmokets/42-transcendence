import { Inject, Injectable } from "@nestjs/common";
import { fortyTwoConfig } from "./forty-two.config";
import type { ConfigType } from "@nestjs/config";

@Injectable()
export class FortyTwoClientService {
  constructor(
    @Inject(fortyTwoConfig.KEY)
    private readonly config: ConfigType<typeof fortyTwoConfig>,
  ) {}

  
}