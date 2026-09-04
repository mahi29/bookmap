import Link from "next/link";
import LandingMap from "./LandingMap";
import styles from "./Landing.module.css";

export default function Landing() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.brand}>BookMap</span>
        <nav className={styles.navActions} aria-label="Account">
          <Link className={styles.ghost} href="/login">
            Log in
          </Link>
          <Link className={styles.primary} href="/signup">
            Sign up
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
        <p className={styles.pitch}>
          BookMap shades each country by how much you&apos;ve read from authors
          of that nationality — a choropleth of your library. Finish a book, and
          the map fills in.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.primary} href="/signup">
            Create an account
          </Link>
          <Link className={styles.ghost} href="/login">
            Log in
          </Link>
        </div>
      </section>

      <LandingMap />

      <section className={styles.explain} aria-labelledby="how-heading">
        <h2 className={styles.sectionTitle} id="how-heading">
          How the heatmap works
        </h2>
        <ul className={styles.points}>
          <li>
            <h3>Coverage</h3>
            <p>
              Every distinct country in your readings. Dual nationals and
              co-authors count for each of their countries, so one book can
              light up more than one place.
            </p>
          </li>
          <li>
            <h3>Intensity</h3>
            <p>
              How many books are attributable to a country. That count drives
              the shade: a single Nigerian novel is a light wash; a shelf of
              them goes dark.
            </p>
          </li>
          <li>
            <h3>By year, or all time</h3>
            <p>
              Filter the map to a year and watch coverage and shading change.
              The question it answers: how many countries have I read from?
            </p>
          </li>
        </ul>
      </section>

      <section className={styles.closing}>
        <p className={styles.closingPitch}>
          Start a map of your own. Import can wait — log a book and the first
          countries appear.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.primary} href="/signup">
            Sign up
          </Link>
          <Link className={styles.ghost} href="/login">
            I already have an account
          </Link>
        </div>
      </section>
    </main>
  );
}
