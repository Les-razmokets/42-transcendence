import { request } from '../../lib/api';
import type { PublicCasino, Table } from '@transcendence/shared';

//a voir au a la pr de fred tsk-54 TODOO
export function getTables() {
    return request<Table[]>('GET', '/tables');
}

export function getCasinos() {
    return request<PublicCasino[]>('GET', '/casinos?limit=100');
}

