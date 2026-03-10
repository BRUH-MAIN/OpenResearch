import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Sparkles, Users, MessageSquare, FileText, Zap, Shield } from 'lucide-react';

export default function LandingPage() {
  const features = [
    {
      icon: Users,
      title: 'Collaborative Groups',
      description: 'Create teams and organize research projects with your colleagues.',
    },
    {
      icon: MessageSquare,
      title: 'AI-Powered Chat',
      description: 'Real-time discussions enhanced with intelligent AI assistance.',
    },
    {
      icon: FileText,
      title: 'Paper Explorer',
      description: 'Discover, save, and discuss academic papers in one place.',
    },
    {
      icon: Sparkles,
      title: 'Smart Summaries',
      description: 'Automatic session summaries and task extraction from conversations.',
    },
    {
      icon: Zap,
      title: 'Session-Scoped Context',
      description: 'Focused research discussions that keep AI context relevant.',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your research data is protected with enterprise-grade security.',
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] transition-colors duration-300">
      {/* Header */}
      <header className="px-4 py-6 sm:px-6 lg:px-8 sticky top-0 z-50 glass border-b border-[var(--color-border-primary)]">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-xl flex items-center justify-center shadow-lg shadow-[#0D7377]/30">
              <span className="text-white font-bold text-xl">OR</span>
            </div>
            <span className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary)]">OpenResearch</span>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <Link href="/auth/signin">
              <Button variant="ghost" className="w-full justify-center sm:w-auto">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="w-full justify-center sm:w-auto">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#0D7377]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#14FFEC]/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0D7377]/20 border border-[#0D7377]/40 text-[#14FFEC] text-sm font-medium mb-8">
            <Sparkles size={16} />
            <span>AI-Powered Research Platform</span>
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[var(--color-text-primary)] mb-6 leading-tight">
            Research, Collaborate,
            <span className="bg-gradient-to-r from-[#0D7377] to-[#14FFEC] bg-clip-text text-transparent">
              {' '}Innovate
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-[var(--color-text-secondary)] mb-10 max-w-3xl mx-auto leading-relaxed">
            The AI-native platform that unifies research communication, project coordination,
            and knowledge discovery into a single collaborative workspace.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="lg" className="w-full sm:w-auto shadow-xl shadow-[#0D7377]/30">
                Start Researching Free
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Learn More
              </Button>
            </Link>
          </div>

          {/* Hero Image Placeholder */}
          <div className="mt-20 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-[var(--color-border-primary)] bg-gradient-to-b from-[var(--color-bg-secondary)] to-[var(--color-bg-primary)]">
            <div className="bg-[var(--color-bg-secondary)] h-96 flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-primary)] via-transparent to-transparent" />
              <p className="text-[var(--color-text-tertiary)] text-lg font-medium">Platform Screenshot</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-4 py-24 sm:px-6 lg:px-8 bg-[var(--color-bg-tertiary)] border-y border-[var(--color-border-primary)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[var(--color-text-primary)] mb-4">
              Everything You Need for Modern Research
            </h2>
            <p className="text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto">
              Stop context switching between fragmented tools. OpenResearch brings it all together.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group p-6 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] hover:border-[#0D7377]/50 hover:shadow-xl hover:shadow-[#0D7377]/10 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#0D7377]/25 group-hover:shadow-[#0D7377]/40 transition-shadow">
                    <Icon className="text-white" size={24} />
                  </div>
                  <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-[var(--color-text-tertiary)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[var(--color-text-primary)] mb-4">
              Simple, Yet Powerful
            </h2>
            <p className="text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto">
              Get started in three easy steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-transparent via-[#0D7377]/50 to-transparent" />
            {[
              {
                step: '1',
                title: 'Create Groups',
                description: 'Organize your research teams and invite collaborators.',
              },
              {
                step: '2',
                title: 'Start Sessions',
                description: 'Launch focused discussions for specific research topics.',
              },
              {
                step: '3',
                title: 'Let AI Assist',
                description: 'Get summaries, extract tasks, and discover insights automatically.',
              },
            ].map((item, index) => (
              <div key={index} className="text-center relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#0D7377]/30 ring-4 ring-[var(--color-bg-primary)]">
                  <span className="text-white text-2xl font-bold">{item.step}</span>
                </div>
                <h3 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3">
                  {item.title}
                </h3>
                <p className="text-[var(--color-text-tertiary)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0D7377] to-[#14FFEC]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-20" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Research Workflow?
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Join researchers worldwide who are already collaborating smarter.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="bg-white text-[#0D7377] hover:bg-gray-100 shadow-xl border-none">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 sm:px-6 lg:px-8 bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] border-t border-[var(--color-border-primary)]">
        <div className="max-w-7xl mx-auto text-center">
          <p>&copy; 2026 OpenResearch. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}