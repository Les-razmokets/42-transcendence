import { z } from 'zod';
import { isoDate } from './dates.js';
import { CasinoRole } from './enums.js';

// response schema when someone wants to GET a user.
export const publicUserSchema = z.object({
  pseudo: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

// reponse schema when staff wants to GET a user.
export const staffUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: isoDate,
  role: z.string(),
});
export type StaffUser = z.infer<typeof staffUserSchema>;
export type StaffUserInput = z.input<typeof staffUserSchema>;

// response schema when the user itself wants to GET his user.
export const myProfileUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: isoDate,
  role: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type MyProfileUser = z.infer<typeof myProfileUserSchema>;
export type MyProfileUserInput = z.input<typeof myProfileUserSchema>;

export const myProfileWithMembershipsSchema = myProfileUserSchema.extend({
  memberships: z.array(
    z.object({
      casinoId: z.string(),
      casinoName: z.string(),
      role: z.enum(CasinoRole), // Keeps your existing role validation
    })
  ),
});
export type MyProfileWithMemberships = z.infer<typeof myProfileWithMembershipsSchema>;
export type MyProfileWithMembershipsInput = z.input<typeof myProfileWithMembershipsSchema>;

// response schema when an admin wants to GET a user.
export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: isoDate,
  role: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserInput = z.input<typeof adminUserSchema>;
