export function estMajeur(date: string) {
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 18);
    return date <= limite.toISOString().slice(0, 10);
}
