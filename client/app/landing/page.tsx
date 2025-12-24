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
    <div className="min-h-screen bg-[#212121]">
      {/* Header */}
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">OR</span>
            </div>
            <span className="text-2xl font-bold text-white">OpenResearch</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/auth/signin">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-6">
            Research, Collaborate,
            <span className="bg-gradient-to-r from-[#0D7377] to-[#14FFEC] bg-clip-text text-transparent">
              {' '}Innovate
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
            The AI-native platform that unifies research communication, project coordination, 
            and knowledge discovery into a single collaborative workspace.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="lg" className="w-full sm:w-auto">
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
          <div className="mt-16 rounded-2xl overflow-hidden shadow-2xl border-4 border-[#323232]">
            <div className="bg-[#323232] h-96 flex items-center justify-center">
              <p className="text-gray-400 text-lg">Platform Screenshot</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-4 py-24 sm:px-6 lg:px-8 bg-[#323232]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Everything You Need for Modern Research
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Stop context switching between fragmented tools. OpenResearch brings it all together.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="p-6 rounded-xl border border-[#0D7377] hover:shadow-lg hover:shadow-[#14FFEC]/20 transition-all bg-[#212121]"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-lg flex items-center justify-center mb-4">
                    <Icon className="text-white" size={24} />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-300">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Simple, Yet Powerful
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Get started in three easy steps
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white text-2xl font-bold">{item.step}</span>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-300">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-br from-[#0D7377] to-[#14FFEC]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Research Workflow?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Join researchers worldwide who are already collaborating smarter.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="bg-white text-[#0D7377] hover:bg-gray-100">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 sm:px-6 lg:px-8 bg-[#212121] text-gray-400 border-t border-[#323232]">
        <div className="max-w-7xl mx-auto text-center">
          <p>&copy; 2025 OpenResearch. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}