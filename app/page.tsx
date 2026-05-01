import Link from "next/link";

const evidenceTags = [
  "Large paste event",
  "Text unchanged after paste",
  "Strong summary alignment",
  "Summary omits major claim"
];

export default function HomePage() {
  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <Link className="brand-mark" href="/">AuthorCheck</Link>
        <nav className="product-nav" aria-label="Public navigation">
          <Link href="/student">Student</Link>
          <Link href="/professor">Professor</Link>
          <Link href="/login">Log in</Link>
          <Link className="nav-cta" href="/signup">Sign up</Link>
        </nav>
      </header>

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Writing process evidence</p>
          <h1>AuthorCheck verifies how writing happened.</h1>
          <p className="hero-text">
            Capture drafts, revisions, paste events, submission locks, summaries, and replay timelines without turning evidence into accusation.
          </p>
          <div className="hero-actions">
            <Link className="primary" href="/signup">Start workspace</Link>
            <Link className="ghost" href="/login">Log in</Link>
          </div>
        </div>

        <div className="evidence-preview" aria-label="Evidence report preview">
          <div className="preview-header">
            <span>Evidence report</span>
            <strong>Neutral tags</strong>
          </div>
          <div className="timeline-preview">
            <span />
            <span />
            <span />
          </div>
          <div className="tag-list">
            {evidenceTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="feature-band" aria-label="Product areas">
        <article>
          <h2>For students</h2>
          <p>Write in a focused workspace with autosaved events, a locked submission, and a timed comprehension summary.</p>
          <Link className="text-link" href="/student">Open student workspace</Link>
        </article>
        <article>
          <h2>For professors</h2>
          <p>Review assignments, submissions, replay timelines, factual observations, and exportable reports.</p>
          <Link className="text-link" href="/professor">Open professor dashboard</Link>
        </article>
        <article>
          <h2>Evidence, not scores</h2>
          <p>Process observations are grouped as factual tags. No integrity score, suspicion score, or cheating label.</p>
        </article>
      </section>
    </main>
  );
}
