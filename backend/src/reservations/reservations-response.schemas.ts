import { z } from 'zod';
import { ReservationStatus } from '../generated/prisma/enums';

// response schema for a reservation
// not exposed:
// - seat / user / notifications: relations, not loaded without `include`
//   (seatId / userId are enough for the front for now)
// - payment: not created yet, will be added as `paymentSchema.nullable()`
//   with the payment ticket
// notes:
// - userId: only the player sees their own reservation for now; a public
//   schema without userId will be needed if reservations are shown to others
// - updatedAt: changes on every write to the row, including automatic ones
//   (expiration, payment confirmation), not only player edits
export const reservationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  seatId: z.string(),
  createdAt: z.date(),
  arrivalAt: z.date(),
  updatedAt: z.date(),
  seatedAt: z.date().nullable(),
  leftAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  status: z.enum(ReservationStatus),
  //payment: paymentSchema.nullable() -> To complete when payment schema created.
});
export type Reservation = z.infer<typeof reservationSchema>;
