/** Placeholder genérico das áreas cujas telas reais entram nas stories 09–13. */
export function Placeholder({ title, story }: { title: string; story: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">Em construção — {story}.</p>
    </section>
  );
}
