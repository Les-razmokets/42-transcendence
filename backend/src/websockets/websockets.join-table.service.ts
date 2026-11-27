import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebSocketsException } from './utils/websockets.exception';

/**
 * Who may join `table:<tableId>` (issue 3, step 4).
 *
 * Any authenticated user may watch a table, as long as the table exists, is not
 * deleted, its CASINO is not deleted either, and it belongs to the casino the client
 * named. TablesService.findById does not check the casino (the seeded Paris casino
 * is deleted but its table is not), hence this small dedicated query.
 *
 * Temporary: once Fred's tables refactor is merged, swap the query for his method
 * if he exposes one. The gateway only depends on assertCanJoin().
 *
 * Every refusal is the SAME NOT_FOUND for the client (D6); the reason says which
 * check failed, for the server log only. The ids in it are already validated UUIDs.
 */
@Injectable()
export class WsTableJoinService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves if the socket may join; throws WebSocketsException(NOT_FOUND) otherwise. */
  async assertCanJoin(casinoId: string, tableId: string): Promise<void> {
    // One round trip, only the fields the decision needs. The casino is fetched
    // through the table's relation: the client's casinoId is a claim to check,
    // never a fact to trust.
    const table = await this.prisma.pokerTable.findUnique({
      where: { id: tableId },
      select: {
        casinoId: true,
        deletedAt: true,
        casino: { select: { deletedAt: true } },
      },
    });

    if (!table) {
      throw new WebSocketsException(
        'NOT_FOUND',
        `table ${tableId} does not exist`,
      );
    }
    if (table.deletedAt) {
      throw new WebSocketsException('NOT_FOUND', `table ${tableId} is deleted`);
    }
    if (table.casinoId !== casinoId) {
      throw new WebSocketsException(
        'NOT_FOUND',
        `table ${tableId} belongs to casino ${table.casinoId}, not ${casinoId}`,
      );
    }
    if (table.casino.deletedAt) {
      throw new WebSocketsException(
        'NOT_FOUND',
        `table ${tableId} is in deleted casino ${casinoId}`,
      );
    }
  }
}
