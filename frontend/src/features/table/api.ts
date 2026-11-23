import { request } from '../../lib/api';
import type { Table, PublicCasino } from '@transcendence/shared';

export function getTable(id: string) {
    return request<Table>('GET', `/tables/${id}`);
}

export function getCasino(id: string) {
    return request<PublicCasino>('GET', `/casinos/${id}`);
}