import { useEffect, useRef, useState } from "react";
import styles from "./MenuDeroulant.module.css";
import { OptionMenu } from "../OptionMenu";
import { Filtre } from "../../primitives/Filtre";

type MenuDeroulantProps = {
    libelle: string;
    options: string[];
    valeur: string | null;
    onChange: (valeur: string | null) => void;
};

export function MenuDeroulant(props: MenuDeroulantProps) {
    const { libelle, options, valeur, onChange} = props;
    const [ouvert, setOuvert] = useState(false);
    const zone = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ouvert)
            return;
        function clicOutside(e: MouseEvent) {
            if (zone.current && !zone.current.contains(e.target as Node)) setOuvert(false);
        }
        function inSide(e: KeyboardEvent) {
            if (e.key === 'Escape') setOuvert(false);
        }

        document.addEventListener('mousedown', clicOutside);
        document.addEventListener('keydown', inSide);
        return () => {
            document.removeEventListener('mousedown', clicOutside);
            document.removeEventListener('keydown', inSide);
        };
    }, [ouvert]);

    function choose(option: string | null) {
        onChange(option);
        setOuvert(false);
    }

    return (
        <div ref={zone} className={styles.zone}>
            <Filtre ouvert={ouvert} actif={valeur !== null} onClick={() => setOuvert(!ouvert)}>
                {valeur ?? libelle}
            </Filtre>
            {ouvert && (
                <div className={styles.panneau}>
                    <OptionMenu selected={valeur === null} onClick={() => choose(null)}>
                        {libelle}
                    </OptionMenu>
                    {options.map((option) => (
                        <OptionMenu key={option} selected={valeur === option} onClick={() => choose(option)}>
                            {option}
                        </OptionMenu>
                    ))}
                </div>
            )}
        </div>
    );
};