import React, { useState, useEffect, useRef, useCallback } from 'react';
// Fix: Import 'Modality' to use the enum value for 'responseModalities'.
import { GoogleGenAI, Modality } from '@google/genai';
import { IconSend, IconSparkles, IconSearch, IconMapPin, IconBolt, IconBrain, IconSpeaker, IconUser, IconGemini } from './Icons';
import { decode, decodeAudioData } from '../utils/helpers';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  sources?: any[];
}

interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
    placeAnswerSources?: {
      reviewSnippets?: {
        uri: string;
        text: string;
      }[];
    };
  };
}


export const ChatPlayground: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat settings
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useLite, setUseLite] = useState(false);
  
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchUserLocation = useCallback(() => {
    if (useMaps) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err) => {
          console.warn(`Could not get location: ${err.message}`);
          setError("Could not get your location. Maps grounding may be less accurate.");
        }
      );
    }
  }, [useMaps]);

  useEffect(() => {
    if (useMaps) {
      fetchUserLocation();
    } else {
      setUserLocation(null);
    }
  }, [useMaps, fetchUserLocation]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage, { sender: 'bot', text: '', sources: [] }]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        let model = 'gemini-2.5-flash';
        if (useThinking) model = 'gemini-2.5-pro';
        if (useLite) model = 'gemini-2.5-flash-lite';
        
        const tools: any[] = [];
        if (useSearch) tools.push({ googleSearch: {} });
        if (useMaps) tools.push({ googleMaps: {} });
        
        const config: any = {};
        if (useThinking) {
            config.thinkingConfig = { thinkingBudget: 32768 };
        }
        if (tools.length > 0) {
            config.tools = tools;
        }
        if (useMaps && userLocation) {
            config.toolConfig = {
                retrievalConfig: {
                    latLng: {
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude,
                    }
                }
            };
        }
        
        const requestPayload: any = {
            model: model,
            contents: input,
        };
        if (Object.keys(config).length > 0) {
            requestPayload.config = config;
        }

        const stream = await ai.models.generateContentStream(requestPayload);

        for await (const chunk of stream) {
            const chunkText = chunk.text;
            const chunkSources = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;

            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];

                if (lastMessage && lastMessage.sender === 'bot') {
                    lastMessage.text += chunkText;
                    if (chunkSources && chunkSources.length > 0) {
                        lastMessage.sources = chunkSources;
                    }
                }
                return newMessages;
            });
        }
    } catch (e: any) {
        console.error(e);
        const errorMessage = `Error: ${e.message || 'An unknown error occurred.'}`;
        setError(errorMessage);
        setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.sender === 'bot') {
                lastMessage.text = errorMessage;
            } else {
                newMessages.push({ sender: 'bot', text: errorMessage });
            }
            return newMessages;
        });
    } finally {
      setIsLoading(false);
    }
  };

  const playTTS = async (text: string) => {
     try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                // Fix: Use 'Modality.AUDIO' enum instead of a raw string for 'responseModalities' as per API guidelines.
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                // Fix: Cast window to any to access vendor-prefixed webkitAudioContext for Safari compatibility.
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContextRef.current, 24000, 1);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
        }
    } catch (error) {
        console.error("TTS Error:", error);
        alert("Failed to synthesize speech.");
    }
  }

  const SettingToggle = ({ isEnabled, setIsEnabled, icon, label, description, isProOnly = false }: { isEnabled: boolean; setIsEnabled: (val: boolean) => void; icon: React.ReactNode; label: string; description: string; isProOnly?: boolean }) => (
    <div className="flex items-start gap-3">
        <div className="mt-1 text-purple-400">{icon}</div>
        <div className="flex-1">
            <label className="font-semibold text-white flex items-center">
                {label} {isProOnly && <span className="ml-2 text-xs bg-purple-500/50 text-purple-300 px-2 py-0.5 rounded-full">PRO</span>}
            </label>
            <p className="text-sm text-gray-400">{description}</p>
        </div>
        <button onClick={() => setIsEnabled(!isEnabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-purple-600' : 'bg-gray-600'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-full">
        <div className="flex-1 flex flex-col bg-gray-800 rounded-xl overflow-hidden max-h-[80vh]">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <IconSparkles className="w-6 h-6 text-purple-400" />
                    Gemini Chat
                </h2>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-6">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-4 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                        {msg.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center shrink-0"><IconGemini className="w-5 h-5 text-white" /></div>}
                        <div className={`max-w-xl p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                            <p className="whitespace-pre-wrap">{msg.text}{msg.sender === 'bot' && msg.text.length === 0 && isLoading && <span className="animate-pulse">▍</span>}</p>
                            {msg.sender === 'bot' && msg.text.length > 0 && (
                                <div className="flex items-center mt-2">
                                    <button onClick={() => playTTS(msg.text)} className="text-gray-400 hover:text-white transition-colors">
                                        <IconSpeaker className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-600">
                                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Sources:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {msg.sources.map((chunk: GroundingChunk, i) => (
                                          (chunk.web || chunk.maps) &&
                                            <a key={i} href={chunk.web?.uri || chunk.maps?.uri} target="_blank" rel="noopener noreferrer" className="text-xs bg-gray-600 hover:bg-gray-500 text-cyan-300 px-2 py-1 rounded-md truncate max-w-xs">
                                                {chunk.web?.title || chunk.maps?.title || 'Source'}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                         {msg.sender === 'user' && <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center shrink-0"><IconUser className="w-5 h-5 text-white" /></div>}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-700">
                 {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask Gemini anything..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-700 rounded-full border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                        disabled={isLoading}
                    />
                    <button onClick={handleSendMessage} disabled={isLoading || !input.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                        <IconSend className="w-5 h-5 text-white" />
                    </button>
                </div>
            </div>
        </div>

        <div className="lg:w-80 shrink-0">
             <div className="bg-gray-800 rounded-xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white">Chat Settings</h3>
                <SettingToggle isEnabled={useSearch} setIsEnabled={setUseSearch} icon={<IconSearch className="w-5 h-5" />} label="Search Grounding" description="Use Google Search for up-to-date info." />
                <SettingToggle isEnabled={useMaps} setIsEnabled={setUseMaps} icon={<IconMapPin className="w-5 h-5" />} label="Maps Grounding" description="Use Google Maps for location queries." />
                <hr className="border-gray-700" />
                <SettingToggle isEnabled={useLite} setIsEnabled={setUseLite} icon={<IconBolt className="w-5 h-5" />} label="Low-Latency Mode" description="Use Flash Lite for faster responses." />
                <SettingToggle isEnabled={useThinking} setIsEnabled={setUseThinking} icon={<IconBrain className="w-5 h-5" />} label="Thinking Mode" description="For complex reasoning tasks." isProOnly={true}/>
             </div>
        </div>
    </div>
  );
};