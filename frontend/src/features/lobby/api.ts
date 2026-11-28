import { request } from '../../lib/api';
import type { PublicCasino, Table } from '@transcendence/shared';

export function getTables(casinoId: string) {
    return request<Table[]>('GET', `/casinos/${casinoId}/tables`);
}

export function getCasinos() {
    return request<PublicCasino[]>('GET', '/casinos?limit=100');
}

