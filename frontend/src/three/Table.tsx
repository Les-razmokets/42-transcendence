import { useCursor, useGLTF } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { nomPlace, trouverPlace, URL_MODELE } from './modele';
import { couleurChaise, couleurs3D, type EtatChaise } from './tokens3d';

type TableProps = {
  places: EtatChaise[];
  onChoisir?: (index: number) => void;
};

export function Table({ places, onChoisir }: TableProps) {
  const { scene } = useGLTF(URL_MODELE);
  const [survol, setSurvol] = useState<number | null>(null);

  useCursor(survol !== null);

  
  const { copie, tissus } = useMemo(() => {
    const copie = scene.clone(true);
    const tissus = Array.from({ length: 9 }, (_, i) => {
      const morceaux: Mesh[] = [];
      copie.getObjectByName(nomPlace(i))?.traverse((objet) => {
        if (objet instanceof Mesh && objet.material.name === 'Floor_Chaise') {
          morceaux.push(objet);
        }
      });
      if (morceaux.length === 0) return null;

      const tissu = (morceaux[0].material as MeshStandardMaterial).clone();
      morceaux.forEach((morceau) => {
        morceau.material = tissu;
      });
      return tissu;
    });
    return { copie, tissus };
  }, [scene]);

  function placeLibre(objet: Object3D): number | null {
    const index = trouverPlace(objet);
    return index !== null && places[index] === 'libre' ? index : null;
  }

  useLayoutEffect(() => {
    tissus.forEach((tissu, i) => {
      if (!tissu) return;
      tissu.color.set(couleurChaise(places[i] ?? 'occupee'));
      tissu.emissive.set(couleurs3D.lueurSurvol);
      tissu.emissiveIntensity = i === survol && places[i] === 'libre' ? 0.35 : 0;
    });
  }, [tissus, places, survol]);

  return (
    <primitive
      object={copie}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setSurvol(placeLibre(e.object));
      }}
      onPointerOut={() => setSurvol(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const index = placeLibre(e.object);
        if (index !== null) onChoisir?.(index);
      }}
    />
  );
}
