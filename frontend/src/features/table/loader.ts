import type { LoaderFunctionArgs } from 'react-router';
import { getTable, getCasino } from './api';

export async function chargerTable({ params }: LoaderFunctionArgs) {
    try {
        const table = await getTable(params.tableId ?? '');
        const casino = await getCasino(table.casinoId);
        return { table, casino };
    } catch {
        return null;
    }
}
