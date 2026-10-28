import { SetMetadata } from '@nestjs/common';

// Custom NestJS decorator that defines a route as public.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
