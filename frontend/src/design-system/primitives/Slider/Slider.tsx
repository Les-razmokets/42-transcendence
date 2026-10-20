import type { CSSProperties } from "react";
import styles from './Slider.module.css';

type SliderProps = {
    valeur: number;
    min: number;
    max: number;
    step: number;
    onChange: (valeur: number) => void;
    libelle: string;
    texteValeur: string;
    texteMin: string;
    texteMax: string;
};

export function Slider(props: SliderProps) {
    const {valeur, min, max, step, onChange, libelle, texteValeur, texteMin, texteMax} = props;

    const diff = max - min;
    const p = diff === 0 ? 0 : Math.max(0, Math.min(100, ((valeur - min) / diff) * 100));

    return (
        <div className={styles.slider}>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={valeur}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={libelle}
                aria-valuetext={texteValeur}
                className={styles.piste}
                style={{ '--pourcentage': `${p}%` } as CSSProperties}
            />
            <div className={`${styles.borne} typo-legende`} aria-hidden="true">
                <span>{texteMin}</span>
                <span>{texteMax}</span>
            </div>
        </div>
    );
}