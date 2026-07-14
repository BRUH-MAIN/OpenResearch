'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Sparkles,
  Users,
  MessageSquare,
  FileText,
  Telescope,
  Quote,
  ArrowRight,
  Github,
} from 'lucide-react';

import { Button } from '@/components/ui';
import { AuroraBackground } from '@/components/ui/aurora-background';

// Staggered entrance: the eye lands on the headline, then the subhead, then the
// call to action — in that order, rather than everything arriving at once.
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Ask your own papers',
    description:
      'Mention @ai in any discussion. Answers are retrieved from the papers your group has collected, not from the model’s memory.',
  },
  {
    icon: Quote,
    title: 'Every claim is cited',
    description:
      'Each answer carries the passages that grounded it, with retrieval scores, so you can check the source rather than trust the tone.',
  },
  {
    icon: Telescope,
    title: 'An agent that investigates',
    description:
      'Deep research runs a tool-using loop: it searches your library, goes to arXiv for what you are missing, reads a paper in full, and shows its work.',
  },
  {
    icon: FileText,
    title: 'Upload a PDF, index the text',
    description:
      'The full text is extracted and embedded, so answers reach section-level detail instead of stopping at the abstract.',
  },
  {
    icon: Users,
    title: 'Isolated per group',
    description:
      'Retrieval is scoped to your group inside the query itself. One team’s papers can never surface in another team’s answers.',
  },
  {
    icon: Sparkles,
    title: 'Real-time, together',
    description:
      'Discussions stream live over websockets, including the AI answer, token by token, for everyone in the room.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Two searches, not one',
    body: 'Semantic search knows that “attention mechanism” and “transformer” mean the same thing. Keyword search catches “ResNet-152” exactly. Both run.',
  },
  {
    step: '02',
    title: 'Fused by rank',
    body: 'Reciprocal Rank Fusion merges the two rankings by position rather than score, because a cosine distance and a BM25 score are not on a comparable scale.',
  },
  {
    step: '03',
    title: 'Grounded, then cited',
    body: 'The retrieved passages are what the model may answer from, and they are handed back to you alongside the answer.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* ── Hero ── */}
      <AuroraBackground className="min-h-[92vh] px-6">
        <nav className="absolute top-0 left-0 right-0 z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <span className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] text-sm font-bold text-[var(--color-bg-primary)]">
              OR
            </span>
            OpenResearch
          </span>

          <div className="flex items-center gap-2">
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/60 px-3 py-1 text-xs text-[var(--color-text-secondary)] backdrop-blur">
              <Sparkles size={12} className="text-[var(--color-brand-secondary)]" />
              Retrieval-augmented, group-scoped, and cited
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="mt-6 text-balance text-5xl font-bold leading-[1.1] tracking-tight text-[var(--color-text-primary)] md:text-6xl"
          >
            Ask questions of{' '}
            <span className="bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] bg-clip-text text-transparent">
              your own papers
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-[var(--color-text-secondary)]"
          >
            A workspace where research teams collect papers, discuss them in real time, and
            get answers drawn from their own library, each one showing the passages it came
            from.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href="/auth/signup">
              <Button size="lg" rightIcon={<ArrowRight size={16} />}>
                Start researching
              </Button>
            </Link>
            <a
              href="https://github.com/BRUH-MAIN/OpenResearch"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" leftIcon={<Github size={16} />}>
                View the source
              </Button>
            </a>
          </motion.div>

          {/* The product in one exchange — worth more than a screenshot. */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            className="mx-auto mt-14 max-w-xl rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/70 p-4 text-left backdrop-blur"
          >
            <p className="text-sm text-[var(--color-text-primary)]">
              <span className="font-medium text-[var(--color-brand-secondary)]">@ai</span>{' '}
              which architecture does this paper propose, and how does it handle depth?
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--color-border-primary)] pt-3">
              {['Attention Is All You Need · 0.91', 'Deep Residual Learning · 0.87'].map(
                (source, i) => (
                  <span
                    key={source}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]"
                  >
                    <span className="font-medium text-[var(--color-brand-secondary)]">
                      [{i + 1}]
                    </span>
                    {source}
                  </span>
                )
              )}
            </div>
          </motion.div>
        </div>
      </AuroraBackground>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Built around one idea
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--color-text-secondary)]">
          An assistant is only useful if you can check its work.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
              className="group rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6 transition-all hover:-translate-y-1 hover:border-[var(--color-border-accent)]"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-bg-tertiary)] text-[var(--color-brand-secondary)] transition-colors group-hover:bg-[var(--color-brand-primary)]/20">
                <feature.icon size={18} />
              </div>
              <h3 className="mt-4 font-semibold text-[var(--color-text-primary)]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How retrieval works: the part worth explaining ── */}
      <section className="border-y border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/40">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Why the answers hold up
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step}>
                <span className="font-mono text-xs text-[var(--color-brand-secondary)]">
                  {item.step}
                </span>
                <h3 className="mt-2 font-semibold text-[var(--color-text-primary)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Bring your papers
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
          Create a group, add a few PDFs, and ask it something you already know the answer
          to. That is the only honest way to judge it.
        </p>
        <Link href="/auth/signup" className="mt-8 inline-block">
          <Button size="lg" rightIcon={<ArrowRight size={16} />}>
            Create an account
          </Button>
        </Link>
      </section>

      <footer className="border-t border-[var(--color-border-primary)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
        OpenResearch — retrieval-augmented research, with the sources shown.
      </footer>
    </div>
  );
}
