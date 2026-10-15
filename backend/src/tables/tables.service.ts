import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { PokerVariant } from '../generated/prisma/enums';

@Injectable()
export class TablesService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(dto: CreateTableDto) {
    this.assertValidBlinds(dto.smallBlind, dto.bigBlind);
    this.assertValidSeats(dto.variant, dto.maxSeats);
    return this.prismaService.pokerTable.create({
      data: {
        ...dto,
        seats: {
          createMany: {
            data: Array.from({ length: dto.maxSeats }, (_, i) => ({
              seatNumber: i + 1,
            })),
          },
        },
      },
      include: { seats: true },
    });
  }

  private assertValidBlinds(smallBlind: number, bigBlind: number) {
    if (bigBlind < smallBlind) {
      throw new BadRequestException(
        'bigBlind must be greater than or equal to smallBlind',
      );
    }
  }

  private assertValidSeats(variant: PokerVariant, maxSeats: number) {
    if (variant === PokerVariant.OMAHA && maxSeats > 8) {
      throw new BadRequestException(
        'invalid number of seats for OMAHA poker variant (max = 8)',
      );
    }
  }
}
