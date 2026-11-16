import { request } from '../../lib/api';
import type { PublicCasino, Table } from '@transcendence/shared';

//TODO tsk-54 la route devient /casinos/:casinoId/tables
export function getTables() {
    return request<Table[]>('GET', '/tables');
}

export function getCasinos() {
    return request<PublicCasino[]>('GET', '/casinos?limit=100');
}

