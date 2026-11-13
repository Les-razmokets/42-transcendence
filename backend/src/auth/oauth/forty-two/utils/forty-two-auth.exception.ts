import { HttpException, HttpStatus } from '@nestjs/common';

// The single, generic 42 failure (401). Used for every OAuth error so that no response
// reveals why it failed (bad state, 42 down, email taken…).
export class FortyTwoAuthException extends HttpException {
  constructor() {
    super('Échec de l’authentification 42', HttpStatus.UNAUTHORIZED);
  }
}