import type { LoaderFunctionArgs } from 'react-router';
import { getTable } from './api';

export async function chargerTable({ params }: LoaderFunctionArgs) {
    try {
        return await getTable(params.tableId ?? '');
    } catch {
        return null;
    }
}
