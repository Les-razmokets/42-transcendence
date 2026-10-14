import styles from "./Bandes.module.css"

type BandesProps = {
  variante?: "epaisse" | "fine";
};

export function Bandes(props: BandesProps) {
  const {variante = "epaisse"} = props;
  return (
    <div className={`${styles.bandes} ${styles[variante]}`} aria-hidden="true">
      <span className={styles.bandes1}/>
      <span className={styles.bandes2}/>
      <span className={styles.bandes3}/>
    </div>
  );
}