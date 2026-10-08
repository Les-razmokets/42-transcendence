import { z } from 'zod';

export const publicUserSchema = z.object({
  pseudo: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const staffUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: z.date(),
  role: z.string(),
});
export type StaffUser = z.infer<typeof staffUserSchema>;

export const myProfileUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: z.date(),
  role: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MyProfileUser = z.infer<typeof myProfileUserSchema>;

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  pseudo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  birthDate: z.date(),
  role: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
