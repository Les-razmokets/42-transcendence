import { UsersCreationDto } from "../../../../users/dto/users.dto";
import { PickType } from "@nestjs/mapped-types";

export class FortyTwoCompleteDto extends PickType(UsersCreationDto, ['birthDate']) {}