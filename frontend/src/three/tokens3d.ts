/**
 * Floor — couleurs de la scène 3D (Three.js)
 *
 * Mêmes valeurs que tokens.css (--table-*, --chaise-*), mais en hexadécimal :
 * les matériaux Three.js ne savent pas lire une variable CSS.
 * Si une couleur change dans Figma, mettre à jour tokens.css ET ce fichier.
 */
export const couleurs3D = {
  tableTapis: "#284074",     // --table-tapis     (bleu-500)
  tableRail: "#d72e2f",      // --table-rail      (rouge-500)
  tableLigne: "#fceea6",     // --table-ligne     (creme-500)
  chaiseLibre: "#fceea6",    // --chaise-libre    (creme-500)
  chaiseOccupee: "#716b4b",  // --chaise-occupee  (creme-900)
  chaiseSelection: "#d72e2f",// --chaise-selection (rouge-500)
  contour: "#121c36",        // contours des objets (bleu-900)
  lueurSurvol: "#fceea6",    // --lueur-chaise-survol → --etat-focus (creme-500)

} as const;

/** Durées des animations de caméra, en secondes (GSAP travaille en secondes). */
export const durees3D = {
  zoomTable: 0.7,       // lobby → table plein écran
  rotationVersChaise: 0.8, // la chaise choisie vient en bas de l'écran
  descenteVersChaise: 1.3, // la caméra s'assoit
  chevauchement: 0.15,  // les deux mouvements se chevauchent
} as const;

export type EtatChaise = "libre" | "occupee" | "selection";

/** Couleur du tissu d'une chaise selon l'état de la place. */
export function couleurChaise(etat: EtatChaise): string {
  if (etat === "occupee") return couleurs3D.chaiseOccupee;
  if (etat === "selection") return couleurs3D.chaiseSelection;
  return couleurs3D.chaiseLibre;
}

/** Caméra de la vue du dessus */
export const camera3D = {
  objectifAssisMm: 18,
  objectifMm: 28,
  capteurMm: 36,
} as const;

/** Angle de vue (en degrés) d'un objectif, comme le calcule blender
 * 2 x atan(capteur / 2 / focale) 
 */
export function angleDepuisObjectif(objectifMm: number, capteurMm: number): number {
  return (2 * Math.atan(capteurMm / 2 / objectifMm) * 180) / Math.PI;
}

/** 
 * Three.js attend un angle Vertical (camera.fov)
 * l'angle sur le plus grand coté de l'image.
 * écran en largeur (aspect >= 1) : l'angle Blender est horizontal -> on le convertit
 * ecran en hauteur (mobile) : l'angle Blender est déjà vertical -> on le garde 
 */

export function angleVertical(angleBlender: number, aspect: number): number {
  if (aspect < 1)
      return angleBlender;
  const demiAngle = (angleBlender * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(demiAngle) / aspect) * 180) / Math.PI;
}