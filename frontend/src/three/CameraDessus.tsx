import { PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { angleDepuisObjectif, angleVertical, camera3D } from './tokens3d';

const ANGLE_BLENDER = angleDepuisObjectif(camera3D.objectifMm, camera3D.capteurMm);

export function CameraDessus() {
  const aspect = useThree((etat) => etat.size.width / etat.size.height);

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, camera3D.hauteurDessus, 0]}
      up={[0, 0, -1]}
      fov={angleVertical(ANGLE_BLENDER, aspect)}
      onUpdate={(camera) => camera.lookAt(0, 0, 0)}
    />
  );
}
