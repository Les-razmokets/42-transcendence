import { PerspectiveCamera, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { Box3, Vector3 } from 'three';
import { hauteurPourCadrer } from './cadrage';
import { URL_MODELE } from './modele';
import { angleDepuisObjectif, angleVertical, camera3D } from './tokens3d';

const ANGLE_BLENDER = angleDepuisObjectif(camera3D.objectifMm, camera3D.capteurMm);

export function CameraDessus() {
  const { scene } = useGLTF(URL_MODELE);
  const aspect = useThree((etat) => etat.size.width / etat.size.height);

  // La boîte qui englobe table + chaises, mesurée une fois sur le modèle
  const boite = useMemo(() => new Box3().setFromObject(scene), [scene]);
  const centre = boite.getCenter(new Vector3());
  const taille = boite.getSize(new Vector3());

  const fov = angleVertical(ANGLE_BLENDER, aspect);
  const hauteur = hauteurPourCadrer(
    { largeur: taille.x, profondeur: taille.z, sommet: boite.max.y },
    fov,
    aspect,
  );

  return (
    <PerspectiveCamera
      makeDefault
      position={[centre.x, hauteur, centre.z]}
      up={[0, 0, -1]}
      fov={fov}
      onUpdate={(camera) => camera.lookAt(centre.x, 0, centre.z)}
    />
  );
}
