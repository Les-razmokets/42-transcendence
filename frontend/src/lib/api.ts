const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
};

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        credentials: 'include',
        headers: body !== undefined ? { 'Content-Type': 'application/json'} : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        let message = res.statusText;
        try {
            const data = await res.json();
            message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
        } catch {
            // a definir l'erreur
        }
        throw new ApiError(res.status, message);
    }

    if (res.status === 204)
        return undefined as T;
    return (await res.json()) as T;

}