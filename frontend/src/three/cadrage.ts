export type Emprise = {
  largeur: number;
  profondeur: number;
  sommet: number;
};

export function hauteurPourCadrer(emprise: Emprise, angleVertical: number, aspect: number, marge = 1.1): number {
  const demiV = Math.tan((angleVertical * Math.PI) / 360);
  const demiH = demiV * aspect;
  const distance = Math.max(emprise.profondeur / 2 / demiV, emprise.largeur / 2 / demiH);
  return emprise.sommet + distance * marge;
}