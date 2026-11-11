import { z } from 'zod';

// Response dates: Prisma gives a Date, the JSON body carries an ISO string.
// With this transform the inferred output type (z.infer) is `string`, like what
// the front actually receives, while z.input stays `Date` for the backend.
// Wire format is unchanged: JSON.stringify(date) is already date.toISOString().
export const isoDate = z.date().transform((date) => date.toISOString());
