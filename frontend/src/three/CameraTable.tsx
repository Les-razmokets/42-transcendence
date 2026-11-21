import { PerspectiveCamera, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Box3, Quaternion, Vector3, type PerspectiveCamera as CameraThree } from 'three';
import { URL_MODELE } from './modele';
import { angleDepuisObjectif, angleVertical, camera3D, durees3D } from './tokens3d';
import { vueAssise, vueDessus, vueDessusTournee } from './vues';

const ANGLE_DESSUS = angleDepuisObjectif(camera3D.objectifMm, camera3D.capteurMm);
const ANGLE_ASSIS = angleDepuisObjectif(camera3D.objectifAssisMm, camera3D.capteurMm);

type CameraTableProps = {
  placeAssise: number | null;
  onAssis?: () => void;
  onDebout?: () => void;
};

export function CameraTable({ placeAssise, onAssis, onDebout }: CameraTableProps) {
  const { scene } = useGLTF(URL_MODELE);
  const aspect = useThree((etat) => etat.size.width / etat.size.height);
  const camera = useRef<CameraThree>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const angleActuel = useRef(ANGLE_DESSUS);

  const boite = useMemo(() => new Box3().setFromObject(scene), [scene]);
  const dessus = useMemo(
    () => vueDessus(boite, ANGLE_DESSUS, angleVertical(ANGLE_DESSUS, aspect), aspect),
    [boite, aspect],
  );

  const courant = useRef({ dessus, onAssis, onDebout });
  useLayoutEffect(() => {
    courant.current = { dessus, onAssis, onDebout };
  });

  function appliquer(position: Vector3, orientation: Quaternion, angle: number) {
    const cam = camera.current;
    if (!cam) return;
    cam.position.copy(position);
    cam.quaternion.copy(orientation);
    angleActuel.current = angle;
    cam.fov = angleVertical(angle, cam.aspect);
    cam.updateProjectionMatrix();
  }

  useLayoutEffect(() => {
    if (!timeline.current)
      appliquer(dessus.position, dessus.orientation, dessus.angle);
    else if (camera.current) {
      camera.current.fov = angleVertical(angleActuel.current, aspect);
      camera.current.updateProjectionMatrix();
    }
  }, [dessus, aspect]);

  useEffect(() => {
    if (placeAssise === null) {
      const tl = timeline.current;
      if (!tl) return;
      tl.eventCallback('onReverseComplete', () => {
        timeline.current = null;
        tl.kill();
        courant.current.onDebout?.();
      });
      tl.reverse();
      return;
    }

    const { dessus } = courant.current;
    const tournee = vueDessusTournee(dessus, scene, placeAssise);
    const assise = vueAssise(scene, placeAssise, ANGLE_ASSIS);
    const etat = { rotation: 0, descente: 0 };
    const position = new Vector3();
    const orientation = new Quaternion();

    const tl = gsap.timeline({
      onUpdate: () => {
        orientation.copy(dessus.orientation).slerp(tournee.orientation, etat.rotation);
        orientation.slerp(assise.orientation, etat.descente);
        position.copy(dessus.position).lerp(assise.position, etat.descente);
        appliquer(position, orientation, gsap.utils.interpolate(dessus.angle, assise.angle, etat.descente));
      },
      onComplete: () => courant.current.onAssis?.(),
    });
    tl.to(etat, { rotation: 1, duration: durees3D.rotationVersChaise, ease: 'power2.inOut' });
    tl.to(etat, { descente: 1, duration: durees3D.descenteVersChaise, ease: 'power2.inOut' }, `-=${durees3D.chevauchement}`);
    timeline.current = tl;
  }, [placeAssise, scene]);

  useEffect(() => () => {
    timeline.current?.kill();
  }, []);

  return <PerspectiveCamera ref={camera} makeDefault />;
}
