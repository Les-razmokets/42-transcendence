import { request } from '../../lib/api';
import type { User } from '../../lib/types/domain';

export function login(email: string, password: string) {
    return request<User>('POST', '/auth/login', {email, password});
}