/** A bench with a few parts: a dashed "before" outline, a solid "after" part, and a Δ in between. */
export function BenchIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="A workbench where a motor moved from a dashed 'before' spot to a new 'after' spot">
      <defs>
        <pattern id="mat" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth="1" />
        </pattern>
      </defs>
      {/* bench top */}
      <rect x="10" y="40" width="400" height="230" rx="22" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="10" y="40" width="400" height="230" rx="22" fill="url(#mat)" className="text-foreground" />
      {/* breadboard */}
      <rect x="250" y="180" width="130" height="58" rx="10" fill="var(--subtle)" stroke="var(--border)" strokeWidth="2" />
      {Array.from({ length: 3 }).map((_, r) =>
        Array.from({ length: 10 }).map((__, c) => <circle key={`${r}-${c}`} cx={264 + c * 11.5} cy={196 + r * 13} r="2" fill="var(--muted-foreground)" opacity="0.4" />),
      )}
      {/* battery */}
      <rect x="44" y="190" width="70" height="48" rx="10" fill="#2a2724" />
      <rect x="52" y="198" width="24" height="32" rx="5" fill="#16A34A" />
      <rect x="82" y="198" width="24" height="32" rx="5" fill="#16A34A" />
      {/* wire */}
      <path d="M114 214 C 160 170, 200 250, 250 205" stroke="#E11D48" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* before: dashed outline of the motor */}
      <rect x="60" y="72" width="76" height="62" rx="16" fill="none" stroke="var(--muted-foreground)" strokeWidth="2.5" strokeDasharray="7 6" />
      <text x="98" y="155" textAnchor="middle" fontSize="13" fill="var(--muted-foreground)" fontFamily="Inter, sans-serif" fontWeight="500">before</text>
      {/* after: solid motor */}
      <rect x="282" y="66" width="80" height="66" rx="18" fill="#9AA3AB" stroke="#5F6870" strokeWidth="2.5" />
      <circle cx="322" cy="99" r="17" fill="#D6DCE1" stroke="#5F6870" strokeWidth="2.5" />
      <circle cx="322" cy="99" r="4" fill="#2B2F33" />
      <text x="322" y="155" textAnchor="middle" fontSize="13" fill="var(--foreground)" fontFamily="Inter, sans-serif" fontWeight="600">after</text>
      {/* connector with Δ */}
      <path d="M146 103 H 268" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
      <path d="M262 95 L272 103 L262 111" stroke="var(--brand)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="207" cy="103" r="24" fill="var(--card)" stroke="var(--brand)" strokeWidth="2.5" />
      <image href="/images/delta-mark.png" x="192" y="91" width="30" height="25" />
    </svg>
  )
}
