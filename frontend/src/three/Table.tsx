import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import { nomPlace, URL_MODELE } from './modele';
import { couleurChaise, type EtatChaise } from './tokens3d';

type TableProps = {
  places: EtatChaise[];
};

export function Table({ places }: TableProps) {
  const { scene } = useGLTF(URL_MODELE);

    const tissus = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => {
      // 1. On récupère les morceaux "tissu" de la chaise
      const morceaux: Mesh[] = [];
      scene.getObjectByName(nomPlace(i))?.traverse((objet) => {
        if (objet instanceof Mesh && objet.material.name === 'Floor_Chaise') {
          morceaux.push(objet);
        }
      });
      if (morceaux.length === 0) return null;

      // 2. Une seule copie du matériau, partagée par les morceaux de CETTE chaise
      const tissu = (morceaux[0].material as MeshStandardMaterial).clone();
      morceaux.forEach((morceau) => {
        morceau.material = tissu;
      });
      return tissu;
    });
  }, [scene]);


  // À chaque changement de places, on met juste à jour les couleurs
  // (pas de nouveaux objets : la scène est redessinée 60 fois par seconde).
  useLayoutEffect(() => {
    tissus.forEach((tissu, i) => {
      tissu?.color.set(couleurChaise(places[i] ?? 'occupee'));
    });
  }, [tissus, places]);

  return <primitive object={scene} />;
}
