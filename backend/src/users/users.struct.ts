export interface UserInfo {
	firstName: string;
	lastName: string;
	pseudo: string;
	email: string;
	passwordHash?: string;
	birthDate: Date;
	phone?: string;
}
