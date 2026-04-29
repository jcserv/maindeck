import Link from "@/app/_components/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border pb-16 md:pb-0">
      <div className="max-w-295 mx-auto px-6 lg:px-12 py-8 flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 sm:items-center gap-3 font-mono text-[12px] text-muted-foreground uppercase tracking-[0.3px]">
          <span className="sm:text-start">Maindeck</span>
          <nav
            aria-label="Footer links"
            className="flex items-center justify-center gap-4"
          >
            <Link
              href="/terms"
              className="hover:text-muted-foreground transition-colors underline"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="hover:text-muted-foreground transition-colors underline"
            >
              Privacy
            </Link>
          </nav>
          <span className="sm:text-end">
            © 2026 · Free forever · Private by default
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground text-center">
          <p>
            Maindeck is unofficial Fan Content permitted under the{" "}
            <a
              href="https://company.wizards.com/en/legal/fancontentpolicy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              Fan Content Policy
            </a>
            . Not approved/endorsed by Wizards. Portions of the materials used
            are property of Wizards of the Coast. © Wizards of the Coast LLC.
          </p>
          <p>
            Card data &amp; images via{" "}
            <a
              href="https://scryfall.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              Scryfall
            </a>
            . Scryfall is not produced by or endorsed by Wizards of the Coast.
          </p>
          <p>
            Made with{" "}
            <span aria-label="heart" role="img">
              💙
            </span>{" "}
            (and Food tokens) by{" "}
            <a
              href="https://jarrodservilla.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              Jarrod Servilla
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
