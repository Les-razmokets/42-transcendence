import { request } from '../../lib/api';
import type { Table } from '@transcendence/shared';

export function getTable(id: string) {
    return request<Table>('GET', `/tables/${id}`);
}