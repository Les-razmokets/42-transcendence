import imageTable from '@/assets/table/table_seule.png';
import { Chaise, type EtatChaise } from './Chaise';
import styles from './CarteTable.module.css';

//rapporter par le fichier blender pour etre cohérent
const PLACES = [
  { x: 72.84, y: 85.14, angle: 159.1 },
  { x: 91.23, y: 65.61, angle: 122.8 },
  { x: 91.19, y: 34.19, angle: 57.2 },
  { x: 72.76, y: 14.72, angle: 20.9 },
  { x: 49.96, y: 8.99,  angle: 0 },
  { x: 27.16, y: 14.76, angle: -20.9 },
  { x: 8.77,  y: 34.29, angle: -57.2 },
  { x: 8.81,  y: 65.70, angle: -122.8 },
  { x: 27.24, y: 85.18, angle: -159.1 },
] as const;

export const NOMBRE_PLACES = PLACES.length;

export function normalisePlaces(places: EtatChaise[]): EtatChaise[] {
    return Array.from({ length: NOMBRE_PLACES}, (_, i) => places[i] ?? 'occupee');
}

type VueTableProps = {
    places: EtatChaise[];
};

export function VueTable(props: VueTableProps) {
    const { places } = props;

    return (
        <div className={styles.vue}>
            <img src={imageTable} alt='' className={styles.imageTable} draggable={false}/>
            {PLACES.map((place, i) => (
                <div
                    key={i}
                    className={styles.place}
                    style={{
                        left: `${place.x}%`,
                        top: `${place.y}%`,
                        transform: `translate(-50%, -50%) rotate(${place.angle}deg)`
                    }}
                >
                    <Chaise etat={places[i]}/>
                </div>
            ))}
        </div>
    );
}