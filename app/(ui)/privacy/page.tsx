import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Privacy · Maindeck",
  description:
    "How Maindeck handles your account, decks, and usage data. No ads, no data sales.",
};

const LAST_UPDATED = "April 19, 2026";
const CONTACT_EMAIL = "support@maindeck.xyz";

const SECTIONS = [
  {
    kicker: "01",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong className="text-foreground">Account info.</strong> When you
          sign up we store your email address, an optional display name and
          username, and, if you signed up with a password, a one-way hash of
          that password. 
          {/* If you sign in through a third-party provider (e.g.
          Google), we store the tokens that provider issues so we can keep you
          signed in. */}
        </p>
        <p>
          <strong className="text-foreground">Session metadata.</strong> To
          keep your account secure, each active session records an IP address
          and user-agent string. This is used to expire stale sessions and
          surface suspicious activity. Nothing more.
        </p>
        <p>
          <strong className="text-foreground">Your content.</strong>{" "}Decks,
          categories, and the cards inside them. If you set a deck to
          &quot;public&quot; its contents are visible to anyone with the link;
          private decks are visible only to you.
        </p>
        <p>
          <strong className="text-foreground">Product analytics.</strong> We
          use Vercel Analytics and Vercel Speed Insights to measure page views
          and performance. These tools do not use third-party cookies and do
          not track you across sites. They record the URL you visited, rough
          device/browser info, and timing data, but not your identity.
        </p>
      </>
    ),
  },
  {
    kicker: "02",
    title: "What we don't collect",
    body: (
      <>
        <p>
          No advertising identifiers. No cross-site trackers. No payment info
          (Maindeck is free). No precise geolocation. No biometric data. We do
          not sell, rent, or trade personal information.
        </p>
      </>
    ),
  },
  {
    kicker: "03",
    title: "How we use it",
    body: (
      <>
        <p>
          To run the product: authenticate you, save the decks you build,
          deliver verification and account emails, and keep the site fast and
          reliable. That&apos;s the whole list. We do not build advertising
          profiles and we do not share your content with anyone outside the
          service providers listed below.
        </p>
      </>
    ),
  },
  {
    kicker: "04",
    title: "Service providers",
    body: (
      <>
        <p>
          We rely on a small number of vendors to operate Maindeck. Each one
          only sees the data it needs to do its job:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-foreground">Vercel</strong> for hosting,
            edge caching, analytics, and performance measurement.
          </li>
          <li>
            <strong className="text-foreground">Resend</strong> for sending
            transactional email (sign-up verification, password resets).
          </li>
          <li>
            <strong className="text-foreground">Railway</strong> for hosting
            the PostgreSQL database that stores your account and deck data.
          </li>
          <li>
            <strong className="text-foreground">Scryfall</strong> for public
            card data and images. Requests for card info are made from our
            servers; your account identity is never shared with Scryfall.
          </li>
        </ul>
        {/* <p>
          When you initiate a Moxfield import, we fetch the decklist you
          referenced from Moxfield on your behalf. No account credentials are
          exchanged.
        </p> */}
      </>
    ),
  },
  {
    kicker: "05",
    title: "Where your data lives",
    body: (
      <>
        <p>
          Your account and deck data is stored in{" "}
          <strong className="text-foreground">AWS us-east-1 (Virginia)</strong>{" "}
          via Railway. The Maindeck web app itself is served from
          Vercel&apos;s global edge network, with compute functions defaulting
          to US regions. Transactional email is delivered through Resend from
          US infrastructure.
        </p>
        <p>
          If you access Maindeck from outside the United States, your data
          will be stored in the US to operate the service.
        </p>
      </>
    ),
  },
  {
    kicker: "06",
    title: "Cookies",
    body: (
      <>
        <p>
          We set a small number of first-party cookies that are strictly
          necessary for the site to work: a session cookie so you stay signed
          in, and a theme preference cookie so light/dark mode persists. No
          third-party advertising cookies are used.
        </p>
      </>
    ),
  },
  {
    kicker: "07",
    title: "Your controls",
    body: (
      <>
        <p>
          You can request account deletion or a copy of your data at any time
          by emailing{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          from the address tied to your account. We verify requests against
          the email on file to prevent account takeovers.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-foreground">Deletion.</strong> Your
            profile, sessions, decks, and all associated content are removed
            from our primary database within 30 days of confirming the
            request, and rotated out of encrypted backups within 90 days
            total.
          </li>
          <li>
            <strong className="text-foreground">Export.</strong> We&apos;ll
            send you a JSON archive of your account and decks, typically
            within 7 days.
          </li>
          <li>
            <strong className="text-foreground">Correction.</strong> Most
            profile fields (email, username, display name) can be updated
            directly from your account settings.
          </li>
        </ul>
      </>
    ),
  },
  {
    kicker: "08",
    title: "Data retention",
    body: (
      <>
        <p>
          Account and deck data is retained for as long as your account is
          active. Session records are retained until they expire (typically 30
          days) or you sign out. Analytics data is retained per Vercel&apos;s
          default retention windows.
        </p>
      </>
    ),
  },
  {
    kicker: "09",
    title: "Children",
    body: (
      <>
        <p>
          Maindeck is not directed to children under 13, and we do not
          knowingly collect personal information from them. If you believe we
          have collected information from a child under 13, please contact us
          and we will delete it.
        </p>
      </>
    ),
  },
  {
    kicker: "10",
    title: "Changes to this policy",
    body: (
      <>
        <p>
          We&apos;ll update the &quot;last updated&quot; date at the top of
          this page whenever this policy changes. For material changes
          we&apos;ll also notify you in-app or by email before they take
          effect.
        </p>
      </>
    ),
  },
  {
    kicker: "11",
    title: "Contact",
    body: (
      <>
        <p>
          Questions about this policy or how your data is handled? Email{" "}
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

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 pb-30">
      <Eyebrow className="mb-6">Legal · Privacy</Eyebrow>
      <h1 className="font-display text-[clamp(44px,7vw,72px)] font-medium leading-[0.95] tracking-[-0.03em] m-0">
        Privacy policy.
      </h1>
      <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground/70">
        Last updated {LAST_UPDATED}
      </p>
      <p className="mt-10 text-[17px] leading-relaxed text-muted-foreground">
        Maindeck is a deckbuilder for Magic: The Gathering. We don&apos;t run
        ads, we don&apos;t sell data, and we collect the minimum needed to
        keep your account working and your decks saved. This page explains
        what that means in practice.
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
