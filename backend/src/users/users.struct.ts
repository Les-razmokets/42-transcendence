export enum Role {
	User = "USER",
	Admin = "ADMIN"
}

export interface UserInfo {
	firstName: string;
	lastName: string;
	pseudo: string;
	email: string;
	passwordHash?: string;
	birthDate: Date;
	phone?: string;
}

export interface StoredUser {
	id: string;
	firstName: string;
	lastName: string;
	pseudo: string;
	email: string;
	passwordHash: string | null;
	birthDate: Date;
	phone: string | null;
	role: Role;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}