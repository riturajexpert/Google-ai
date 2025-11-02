import React, { useState, useMemo } from 'react';
import { ChatPlayground } from './components/ChatPlayground';
import { ImagePlayground } from './components/ImagePlayground';
import { VideoPlayground } from './components/VideoPlayground';
import { AudioPlayground } from './components/AudioPlayground';
import { IconChat, IconImage, IconVideo, IconAudio, IconGemini } from './components/Icons';

type Tab = 'chat' | 'image' | 'video' | 'audio';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const tabs = useMemo(() => [
    { id: 'chat' as Tab, label: 'Chat & Grounding', icon: <IconChat className="w-5 h-5" /> },
    { id: 'image' as Tab, label: 'Image Tools', icon: <IconImage className="w-5 h-5" /> },
    { id: 'video' as Tab, label: 'Video Tools', icon: <IconVideo className="w-5 h-5" /> },
    { id: 'audio' as Tab, label: 'Audio Tools', icon: <IconAudio className="w-5 h-5" /> },
  ], []);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatPlayground />;
      case 'image':
        return <ImagePlayground />;
      case 'video':
        return <VideoPlayground />;
      case 'audio':
        return <AudioPlayground />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 bg-gray-900/80 backdrop-blur-lg border-b md:border-b-0 md:border-r border-gray-700 p-4 shrink-0">
        <div className="flex items-center gap-3 mb-8">
           <IconGemini className="w-8 h-8 text-purple-400"/>
          <h1 className="text-xl font-bold text-white">AI Studio</h1>
        </div>
        <nav className="flex flex-row md:flex-col gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {tab.icon}
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
         {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
