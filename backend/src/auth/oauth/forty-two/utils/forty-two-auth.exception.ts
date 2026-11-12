import { HttpException, HttpStatus } from '@nestjs/common';

export class FortyTwoAuthException extends HttpException {
  constructor() {
    super('Échec de l’authentification 42', HttpStatus.UNAUTHORIZED);
  }
}