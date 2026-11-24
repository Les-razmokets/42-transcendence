import { useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { CameraTable } from './CameraTable';
import { URL_MODELE } from './modele';
import { Table } from './Table';
import type { EtatChaise } from './tokens3d';

export type SceneTableProps = {
  places: EtatChaise[];
  onChoisir?: (index: number) => void;
  placeAssise?: number | null;
  onAssis?: () => void;
  onDebout?: () => void;
};

export function SceneTable({ places, onChoisir, placeAssise = null, onAssis, onDebout }: SceneTableProps) {
  return (
    <Canvas flat dpr={[1, 2]}>

      {/* Repris de jeton_floor.blend (Blender Z-haut → Three Y-haut : (x, y, z) → (x, z, −y)) */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[-2.5, 4, 2.2]} intensity={1.5} color="#fff5e6" /> 
      <directionalLight position={[0.5, 3, -3.2]} intensity={1} />
      <directionalLight position={[3.2, 2.5, 2.8]} intensity={0.4} color="#e6f2ff" />

      <Suspense fallback={null}>
        <Table places={places} onChoisir={onChoisir} interactif={placeAssise === null}/>
        <CameraTable placeAssise={placeAssise} onAssis={onAssis} onDebout={onDebout}/>
      </Suspense>
    </Canvas>
  );
}


useGLTF.preload(URL_MODELE);
