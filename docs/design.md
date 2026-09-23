# Design foundation

Company Human inherits the audited surface, type, spacing, and interaction language of Company OS Web. The actual tokens and primitives live in `apps/web/app/globals.css` and `apps/web/components/ui`. This is a sibling visual system, not a copy of Company OS screens or navigation.

Use neutral canvas and raised surfaces, Geist type, a consistent spacing scale, and a blue focus and link accent. Color in content must communicate a state or measured value. Keep controls visibly focused, disabled, loading, and interactive; loading placeholders should preserve final geometry. Respect reduced motion and maintain readable contrast in light and dark themes.

Contributor pages should answer the human questions in the Notion UX specification: work due, completed work, moving opportunities, earnings, performance, and available tools. Keep deep workflows on dedicated routes. New screens must use existing primitives when suitable and provide truthful empty, error, and permission states. Avoid decorative icons, unsupported metrics, and generic dashboard filler. Responsive review is required when a new surface ships; the current authenticated UI is only an organization selection and context scaffold.
