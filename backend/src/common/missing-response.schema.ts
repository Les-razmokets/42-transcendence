import { z } from 'zod';

export const missingResponseSchema = z.custom(() => false, {
  message:
    'Road with out @SerializeOptions you must declare a schema for every answer',
});
3;
