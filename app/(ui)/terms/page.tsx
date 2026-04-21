import type { Metadata } from "next";
import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Terms · Maindeck",
  description:
    "The ground rules for using Maindeck — what's allowed, what isn't, and what you can expect from a free hobby project.",
};

const LAST_UPDATED = "April 19, 2026";
const CONTACT_EMAIL = "support@maindeck.xyz";
const JURISDICTION = "the Province of Ontario, Canada";

const SECTIONS = [
  {
    kicker: "01",
    title: "Accepting these terms",
    body: (
      <>
        <p>
          These terms (&quot;Terms&quot;) apply to everything on maindeck.xyz
          and any related subdomains (the &quot;Site&quot;). By using the Site
          you agree to them on your own behalf. If you don&apos;t agree, please
          don&apos;t use the Site.
        </p>
        <p>
          Maindeck is a free hobby project built and operated by one person,
          not a company.
        </p>
      </>
    ),
  },
  {
    kicker: "02",
    title: "Changes to these terms",
    body: (
      <>
        <p>
          We may update these Terms from time to time. When we do, we&apos;ll
          change the &quot;last updated&quot; date at the top of this page.
          Continuing to use the Site after that date means you accept the
          updated Terms. The updated Terms replace all previous versions.
        </p>
      </>
    ),
  },
  {
    kicker: "03",
    title: "Magic: The Gathering and Wizards of the Coast",
    body: (
      <>
        <p>
          Maindeck is unofficial Fan Content permitted under the{" "}
          <a
            href="https://company.wizards.com/en/legal/fancontentpolicy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Wizards of the Coast Fan Content Policy
          </a>
          . Maindeck is not produced, endorsed, supported, or affiliated with
          Wizards of the Coast.
        </p>
        <p>
          Portions of the materials used are property of Wizards of the Coast.
          © Wizards of the Coast LLC. Magic: The Gathering and all associated
          names and logos are trademarks of Wizards of the Coast LLC.
        </p>
      </>
    ),
  },
  {
    kicker: "04",
    title: "Card data and images",
    body: (
      <>
        <p>
          Card names, oracle text, images, and related metadata are supplied
          by{" "}
          <a
            href="https://scryfall.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Scryfall
          </a>
          . Scryfall is not produced by or endorsed by Wizards of the Coast.
          Your use of card data through Maindeck is also subject to
          Scryfall&apos;s terms where they apply.
        </p>
      </>
    ),
  },
  {
    kicker: "05",
    title: "Your license to use the Site",
    body: (
      <>
        <p>
          We grant you a personal, revocable, non-exclusive, non-transferable
          license to use the Site for building, browsing, and sharing
          decklists. You may not copy, scrape, resell, or redistribute the
          Site or substantial portions of its content, and you may not use the
          Site to build a competing product.
        </p>
      </>
    ),
  },
  {
    kicker: "06",
    title: "Your account",
    body: (
      <>
        <p>
          You&apos;re responsible for keeping your credentials secure and for
          everything that happens under your account. Give us a working email
          so we can reach you for verification and security notices. If you
          think your account has been compromised, email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          You may close your account at any time. We may suspend or close
          accounts that violate these Terms.
        </p>
      </>
    ),
  },
  {
    kicker: "07",
    title: "Your content",
    body: (
      <>
        <p>
          You keep ownership of the decks, names, descriptions, and other
          content you create on Maindeck (&quot;Your Content&quot;). By
          submitting Your Content, you grant us a worldwide, royalty-free
          license to host, store, display, and transmit it solely to operate
          and improve the Site — for example, to show a public deck to someone
          who visits its link, or to back it up.
        </p>
        <p>
          Public decks are visible to anyone with the link. Private decks are
          visible only to you. Don&apos;t post content you don&apos;t have the
          right to share.
        </p>
      </>
    ),
  },
  {
    kicker: "08",
    title: "Acceptable use",
    body: (
      <>
        <p>Please don&apos;t use the Site to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-foreground">Harass or harm others.</strong>{" "}
            No foul, abusive, discriminatory, sexual, or hateful language in
            deck names, descriptions, usernames, or anywhere else on the Site.
          </li>
          <li>
            <strong className="text-foreground">Impersonate.</strong> No
            pretending to be another person, group, or organization in a way
            meant to mislead or deceive.
          </li>
          <li>
            <strong className="text-foreground">Break the law.</strong> No
            activity that violates applicable laws or regulations.
          </li>
          <li>
            <strong className="text-foreground">Attack the Site.</strong>{" "} No
            probing, scanning, or testing the Site&apos;s security without
            authorization; no accessing accounts or data that aren&apos;t
            yours; no uploading malware, and no overwhelming the Site with
            traffic.
          </li>
          <li>
            <strong className="text-foreground">
              Automate without permission.
            </strong>{" "}
            No bots, scrapers, or other automated tools for crawling, copying,
            or monitoring the Site, and no manual process used for the same
            purpose without our written consent.
          </li>
        </ul>
        <p>
          We handle violations case by case. Depending on severity, the
          response can range from removing specific content, to a warning, to
          suspending or banning the account. To appeal a decision, email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    kicker: "09",
    title: "Third-party links and services",
    body: (
      <>
        <p>
          The Site links to or integrates with third-party services
          (Scryfall, email providers, hosts). Those services have their own
          terms and privacy practices, and we don&apos;t control their
          content. Using them is at your own discretion.
        </p>
      </>
    ),
  },
  {
    kicker: "10",
    title: "Availability and changes to the Site",
    body: (
      <>
        <p>
          Maindeck is a hobby project and is offered as-is. We may add,
          change, or remove features at any time, and we may take the Site
          offline — temporarily or permanently — without notice. We&apos;ll
          try to give a reasonable heads-up before anything that would
          permanently remove your data.
        </p>
      </>
    ),
  },
  {
    kicker: "11",
    title: "Disclaimer of warranties",
    body: (
      <>
        <p className="uppercase text-[13px] tracking-wide">
          The Site is provided &quot;as is&quot; and &quot;as available&quot;
          without warranties of any kind, express or implied. To the maximum
          extent permitted by law, we disclaim all warranties, including
          merchantability, fitness for a particular purpose, and
          non-infringement. We don&apos;t warrant that the Site will be
          uninterrupted, secure, error-free, or that defects will be
          corrected.
        </p>
      </>
    ),
  },
  {
    kicker: "12",
    title: "Limitation of liability",
    body: (
      <>
        <p className="uppercase text-[13px] tracking-wide">
          To the maximum extent permitted by law, in no event will we be
          liable for any indirect, incidental, special, consequential,
          punitive, or exemplary damages arising out of your use of or
          inability to use the Site. Our total liability to you for all
          claims relating to the Site is limited to one hundred Canadian
          dollars (CA$100).
        </p>
        <p>
          Any claim you bring relating to the Site must be filed within one
          (1) year of the event giving rise to it.
        </p>
      </>
    ),
  },
  {
    kicker: "13",
    title: "Indemnification",
    body: (
      <>
        <p>
          You agree to indemnify and hold harmless the operator of Maindeck
          from any losses, costs, or reasonable expenses (including
          attorneys&apos; fees) arising out of your violation of these Terms
          or your misuse of the Site.
        </p>
      </>
    ),
  },
  {
    kicker: "14",
    title: "Termination",
    body: (
      <>
        <p>
          You can stop using the Site at any time. We may suspend or end your
          access to the Site at any time, with or without notice, if you
          violate these Terms or if we decide to wind the project down. The
          sections that by their nature should survive termination (content
          license, disclaimers, limitation of liability, indemnification,
          governing law) will continue to apply.
        </p>
      </>
    ),
  },
  {
    kicker: "15",
    title: "Governing law",
    body: (
      <>
        <p>
          These Terms are governed by the laws of {JURISDICTION}, without
          regard to conflict-of-laws rules. You agree that the courts located
          in {JURISDICTION} have exclusive jurisdiction over any dispute
          arising out of or relating to these Terms, except where local law
          gives you the right to bring a claim where you live.
        </p>
      </>
    ),
  },
  {
    kicker: "16",
    title: "Miscellaneous",
    body: (
      <>
        <p>
          If any provision of these Terms is found unenforceable, the rest
          stay in effect and the unenforceable part is replaced with the
          closest enforceable version. Our failure to enforce a provision
          isn&apos;t a waiver of our right to enforce it later.
        </p>
        <p>
          Please also see our{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          , which also applies to your use of the Site.
        </p>
      </>
    ),
  },
  {
    kicker: "17",
    title: "Contact",
    body: (
      <>
        <p>
          Questions, notices, or appeals? Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </>
    ),
  },
] as const;

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 pb-30">
      <Eyebrow className="mb-6">Legal · Terms</Eyebrow>
      <h1 className="font-display text-[clamp(44px,7vw,72px)] font-medium leading-[0.95] tracking-[-0.03em] m-0">
        Terms of Service
      </h1>
      <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground/70">
        Last updated {LAST_UPDATED}
      </p>
      <p className="mt-10 text-[17px] leading-relaxed text-muted-foreground">
        Maindeck is a free, one-person hobby project for Magic: The Gathering
        deckbuilding. These terms lay out the ground rules — what&apos;s
        allowed, what isn&apos;t, and what you can reasonably expect from a
        site that&apos;s run for love of the game, not profit.
      </p>

      <hr className="border-border my-16" />

      <div className="flex flex-col gap-14">
        {SECTIONS.map((section) => (
          <section key={section.kicker}>
            <div className="font-mono text-[11px] text-primary tracking-[0.2em] mb-3.5 uppercase">
              {section.kicker}
            </div>
            <h2 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] m-0 mb-4">
              {section.title}
            </h2>
            <div className="flex flex-col gap-3 text-[15px] leading-[1.65] text-muted-foreground">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
