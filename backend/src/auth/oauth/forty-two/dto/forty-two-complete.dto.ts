import { UsersCreationDto } from "../../../../users/dto/users.dto";
import { PickType } from "@nestjs/mapped-types";

// Body of POST /auth/42/complete: only the birth date, with the exact same rules as register (18+).
// Any other field (email, pseudo…) is rejected by forbidNonWhitelisted.
export class FortyTwoCompleteDto extends PickType(UsersCreationDto, ['birthDate']) {}