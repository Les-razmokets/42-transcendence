import { Box3, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { hauteurPourCadrer } from './cadrage';
import { nomPlace } from './modele';

export type Vue = {
  position: Vector3;
  orientation: Quaternion;
  angle: number;
};

function regarder(oeil: Vector3, cible: Vector3, haut: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(oeil, cible, haut));
}

export function vueDessus(boite: Box3, angle: number, angleVertical: number, aspect: number): Vue {
  const centre = boite.getCenter(new Vector3());
  const taille = boite.getSize(new Vector3());
  const hauteur = hauteurPourCadrer(
    { largeur: taille.x, profondeur: taille.z, sommet: boite.max.y },
    angleVertical,
    aspect,
  );
  const position = new Vector3(centre.x, hauteur, centre.z);
  const orientation = regarder(position, new Vector3(centre.x, 0, centre.z), new Vector3(0, 0, -1));
  return { position, orientation, angle };
}

export function vueDessusTournee(dessus: Vue, modele: Object3D, index: number): Vue {
  const chaise = modele.getObjectByName(nomPlace(index))!.getWorldPosition(new Vector3());
  const haut = new Vector3(dessus.position.x - chaise.x, 0, dessus.position.z - chaise.z).normalize();
  const cible = new Vector3(dessus.position.x, 0, dessus.position.z);
  return { ...dessus, orientation: regarder(dessus.position, cible, haut) };
}

export function vueAssise(modele: Object3D, index: number, angle: number): Vue {
  const pov = modele.getObjectByName(`${nomPlace(index)}_POV`)!;
  const correction = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  return {
    position: pov.getWorldPosition(new Vector3()),
    orientation: pov.getWorldQuaternion(new Quaternion()).multiply(correction),
    angle,
  };
}
