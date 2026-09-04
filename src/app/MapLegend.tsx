import styles from "./MapLegend.module.css";

export default function MapLegend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendLabel}>Fewer</span>
      <span className={styles.legendBar} aria-hidden="true" />
      <span className={styles.legendLabel}>More books</span>
    </div>
  );
}
