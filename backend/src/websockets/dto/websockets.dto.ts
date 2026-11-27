import { TableJoinPayload } from "@transcendence/shared";
import { IsUUID } from "class-validator";

export class TableJoinDto implements TableJoinPayload {
  @IsUUID()
  tableId: string;

  @IsUUID()
  casinoId: string;
}