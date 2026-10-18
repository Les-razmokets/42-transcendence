import { z } from 'zod';

export const missingResponseSchema = z.custom(() => false, {
  message:
    'Route without @SerializeOptions: declare a response schema',
});
3;
