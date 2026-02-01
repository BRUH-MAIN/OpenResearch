'use client';

import React from 'react';
import {
  Headphones,
  Video,
  BrainCircuit,
  FileText,
  Layers,
  CheckSquare,
  BarChart3,
  Presentation,
  Table2,
  Pencil,
  Sparkles,
  PanelRightClose,
  Plus,
} from 'lucide-react';

export interface StudioOutput {
  id: string;
  type: 'audio' | 'video' | 'mindmap' | 'report' | 'flashcards' | 'quiz' | 'infographic' | 'slides' | 'table';
  title: string;
  status: 'ready' | 'generating' | 'failed';
  createdAt: string;
  downloadUrl?: string;
}

interface StudioPanelProps {
  outputs: StudioOutput[];
  onGenerateAudio: () => void;
  onGenerateVideo: () => void;
  onGenerateMindmap: () => void;
  onGenerateReport: () => void;
  onGenerateFlashcards: () => void;
  onGenerateQuiz: () => void;
  onGenerateInfographic: () => void;
  onGenerateSlides: () => void;
  onGenerateTable: () => void;
  onAddNote: () => void;
  onDownloadOutput?: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  hasSourcesSelected?: boolean;
  className?: string;
}

const STUDIO_ACTIONS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hasEdit: boolean;
  beta?: boolean;
}> = [
  { id: 'audio', label: 'Audio...', icon: Headphones, hasEdit: true },
  { id: 'video', label: 'Video...', icon: Video, hasEdit: true },
  { id: 'mindmap', label: 'Mind Map', icon: BrainCircuit, hasEdit: false },
  { id: 'report', label: 'Reports', icon: FileText, hasEdit: false },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, hasEdit: true },
  { id: 'quiz', label: 'Quiz', icon: CheckSquare, hasEdit: true },
  { id: 'infographic', label: 'Infographic', icon: BarChart3, hasEdit: true, beta: true },
  { id: 'slides', label: 'Slide deck', icon: Presentation, hasEdit: true, beta: true },
  { id: 'table', label: 'Data table', icon: Table2, hasEdit: true },
];

export function StudioPanel({
  outputs,
  onGenerateAudio,
  onGenerateVideo,
  onGenerateMindmap,
  onGenerateReport,
  onGenerateFlashcards,
  onGenerateQuiz,
  onGenerateInfographic,
  onGenerateSlides,
  onGenerateTable,
  onAddNote,
  isCollapsed = false,
  onToggleCollapse,
  hasSourcesSelected = false,
  className = '',
}: StudioPanelProps) {
  const handleAction = (actionId: string) => {
    switch (actionId) {
      case 'audio':
        onGenerateAudio();
        break;
      case 'video':
        onGenerateVideo();
        break;
      case 'mindmap':
        onGenerateMindmap();
        break;
      case 'report':
        onGenerateReport();
        break;
      case 'flashcards':
        onGenerateFlashcards();
        break;
      case 'quiz':
        onGenerateQuiz();
        break;
      case 'infographic':
        onGenerateInfographic();
        break;
      case 'slides':
        onGenerateSlides();
        break;
      case 'table':
        onGenerateTable();
        break;
    }
  };

  if (isCollapsed) {
    return (
      <div className={`w-[52px] bg-[#1e1f20] border-l border-[#3c4043] flex flex-col ${className}`}>
        <button
          onClick={onToggleCollapse}
          className="p-4 hover:bg-[#28292a] transition-colors"
          title="Expand studio"
        >
          <PanelRightClose size={20} className="text-[#9aa0a6] rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className={`w-[340px] bg-[#1e1f20] border-l border-[#3c4043] flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c4043]">
        <span className="text-[15px] font-medium text-[#e8eaed]">Studio</span>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-[#28292a] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* Language Banner */}
      <div className="px-4 py-3 border-b border-[#3c4043]">
        <div className="px-3 py-2 bg-[#28292a] rounded-lg">
          <p className="text-[12px] text-[#9aa0a6] leading-relaxed">
            Create an Audio Overview in: <span className="text-[#e8eaed]">हिन्दी</span>, <span className="text-[#e8eaed]">বাংলা</span>, <span className="text-[#e8eaed]">ગુજરાતી</span>, <span className="text-[#e8eaed]">ಕನ್ನಡ</span>, <span className="text-[#e8eaed]">മലയാളം</span>, <span className="text-[#e8eaed]">मराठी</span>, <span className="text-[#e8eaed]">ਪੰਜਾਬੀ</span>, <span className="text-[#e8eaed]">தமிழ்</span>, <span className="text-[#e8eaed]">తెలుగు</span>
          </p>
        </div>
      </div>

      {/* Action Tiles Grid */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {STUDIO_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                disabled={!hasSourcesSelected}
                className="relative flex flex-col items-center justify-center gap-1.5 p-3 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] hover:border-[#5f6368] rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group min-h-[72px]"
              >
                <Icon size={20} className="text-[#9aa0a6] group-hover:text-[#e8eaed] transition-colors" />
                <span className="text-[11px] text-[#9aa0a6] group-hover:text-[#e8eaed] transition-colors text-center leading-tight">
                  {action.label}
                </span>
                
                {/* Beta Badge */}
                {action.beta && (
                  <span className="absolute top-1.5 right-1.5 px-1 py-0.5 bg-[#3c4043] rounded text-[9px] text-[#9aa0a6] font-medium">
                    BETA
                  </span>
                )}
                
                {/* Edit Icon */}
                {action.hasEdit && (
                  <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil size={12} className="text-[#9aa0a6]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {outputs.length === 0 ? (
          <>
            <Sparkles size={28} className="text-[#8ab4f8] mb-3" />
            <p className="text-[13px] text-[#8ab4f8] font-medium mb-2">
              Studio output will be saved here.
            </p>
            <p className="text-[12px] text-[#9aa0a6] leading-relaxed">
              After adding sources, click to add Audio Overview, study guide, mind map and more!
            </p>
          </>
        ) : (
          <div className="w-full space-y-2">
            {outputs.map((output) => (
              <div
                key={output.id}
                className="flex items-center gap-3 p-3 bg-[#28292a] rounded-lg border border-[#3c4043]"
              >
                <FileText size={18} className="text-[#8ab4f8]" />
                <div className="flex-1 text-left">
                  <p className="text-[13px] text-[#e8eaed] truncate">{output.title}</p>
                  <p className="text-[11px] text-[#9aa0a6]">
                    {new Date(output.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Note Button */}
      <div className="px-4 pb-4">
        <button
          onClick={onAddNote}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[13px] text-[#e8eaed] transition-colors float-right"
        >
          <Plus size={16} />
          <span>Add note</span>
        </button>
      </div>
    </div>
  );
}

export default StudioPanel;
