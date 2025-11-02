import React, { useState, useRef, useCallback, useEffect } from 'react';
// Fix: The 'LiveSession' type is not exported from '@google/genai'. It has been removed from the import.
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { IconMicrophone, IconStop, IconPlay, IconSpinner, IconSpeaker } from './Icons';
import { decode, encode, decodeAudioData, fileToBase64 } from '../utils/helpers';

// Live Conversation Component
const LiveConversation = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [transcription, setTranscription] = useState<{ user: string, model: string }[]>([]);
    const [currentTurn, setCurrentTurn] = useState({ user: '', model: '' });

    // Fix: Replaced unexported 'LiveSession' type with 'any' for the session promise ref.
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const stopSession = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if(scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }

        setIsSessionActive(false);
        nextStartTimeRef.current = 0;
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();

    }, []);

    const startSession = async () => {
        if (isSessionActive) return;
        setIsSessionActive(true);
        setTranscription([]);
        setCurrentTurn({user: '', model: ''});

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            // Fix: Cast window to any to access vendor-prefixed webkitAudioContext for Safari compatibility.
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            // Fix: Cast window to any to access vendor-prefixed webkitAudioContext for Safari compatibility.
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: 'You are a friendly and helpful AI assistant.',
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // Handle transcription
                        if (message.serverContent?.inputTranscription) {
                            setCurrentTurn(prev => ({...prev, user: prev.user + message.serverContent.inputTranscription.text}));
                        }
                        if (message.serverContent?.outputTranscription) {
                           setCurrentTurn(prev => ({...prev, model: prev.model + message.serverContent.outputTranscription.text}));
                        }
                        if (message.serverContent?.turnComplete) {
                           setTranscription(prev => [...prev, currentTurn]);
                           setCurrentTurn({ user: '', model: '' });
                        }

                        // Handle audio playback
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const sourceNode = outputAudioContextRef.current.createBufferSource();
                            sourceNode.buffer = audioBuffer;
                            sourceNode.connect(outputAudioContextRef.current.destination);
                            sourceNode.addEventListener('ended', () => sourcesRef.current.delete(sourceNode));
                            sourceNode.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(sourceNode);
                        }

                        if (message.serverContent?.interrupted) {
                            sourcesRef.current.forEach(source => source.stop());
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e) => {
                        console.error('Live session error:', e);
                        alert('A session error occurred. Please try again.');
                        stopSession();
                    },
                    onclose: () => {
                        stopSession();
                    },
                }
            });

        } catch (error) {
            console.error("Failed to start live session:", error);
            alert("Could not start the microphone. Please grant permission and try again.");
            setIsSessionActive(false);
        }
    };
    
    useEffect(() => {
        return () => {
            stopSession();
        };
    }, [stopSession]);

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Live Conversation</h3>
            <div className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-center mb-4">
                    <button
                        onClick={isSessionActive ? stopSession : startSession}
                        className={`px-6 py-3 rounded-full text-white font-semibold flex items-center gap-2 transition-all duration-300 ${isSessionActive ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                        {isSessionActive ? <><IconStop className="w-6 h-6"/> Stop Session</> : <><IconMicrophone className="w-6 h-6"/> Start Session</>}
                    </button>
                </div>
                <div className="h-64 overflow-y-auto bg-gray-900 p-4 rounded-md space-y-4">
                    {transcription.map((turn, index) => (
                        <div key={index}>
                            <p><strong className="text-purple-400">You:</strong> {turn.user}</p>
                            <p><strong className="text-cyan-400">AI:</strong> {turn.model}</p>
                        </div>
                    ))}
                    {isSessionActive && (
                        <div>
                             {currentTurn.user && <p><strong className="text-purple-400">You:</strong> {currentTurn.user}</p>}
                             {currentTurn.model && <p><strong className="text-cyan-400">AI:</strong> {currentTurn.model}</p>}
                        </div>
                    )}
                     {!isSessionActive && transcription.length === 0 && (
                        <p className="text-gray-500 text-center">Start a session to see the conversation.</p>
                     )}
                </div>
            </div>
        </div>
    );
};

// Audio Transcriber Component
const AudioTranscriber = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [transcription, setTranscription] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const handleStartRecording = async () => {
        setTranscription('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = event => {
                audioChunksRef.current.push(event.data);
            };
            mediaRecorderRef.current.onstop = handleStopRecording;
            audioChunksRef.current = [];
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access the microphone. Please grant permission.');
        }
    };

    const handleStopRecording = async () => {
        if (!mediaRecorderRef.current) return;
        setIsRecording(false);
        setIsLoading(true);

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
            const base64Audio = await fileToBase64(audioBlob);
            const audioPart = {
                inlineData: {
                    mimeType: audioBlob.type,
                    data: base64Audio,
                },
            };
            const textPart = { text: "Transcribe this audio." };
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [audioPart, textPart] },
            });
            
            setTranscription(response.text);
        } catch (error) {
            console.error("Transcription error:", error);
            alert("Failed to transcribe audio.");
            setTranscription('Error: Could not transcribe the audio.');
        } finally {
            setIsLoading(false);
            audioChunksRef.current = [];
            // Stop mic tracks
            if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            }
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
        } else {
            handleStartRecording();
        }
    };

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Audio Transcription</h3>
            <div className="bg-gray-800 p-4 rounded-lg">
                <button
                    onClick={toggleRecording}
                    disabled={isLoading}
                    className={`w-full px-4 py-2 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'} disabled:bg-gray-600`}
                >
                    {isLoading ? <IconSpinner className="w-5 h-5"/> : (isRecording ? <><IconStop className="w-5 h-5"/> Stop Recording</> : <><IconMicrophone className="w-5 h-5"/> Start Recording</>)}
                </button>
                <div className="mt-4 p-4 bg-gray-900 rounded-md min-h-[100px]">
                    <p className="text-gray-300 whitespace-pre-wrap">{transcription || 'Your transcription will appear here.'}</p>
                </div>
            </div>
        </div>
    );
};


// Text-to-Speech Component
const TextToSpeech = () => {
    const [text, setText] = useState('Hello! I am Gemini. Have a wonderful day!');
    const [isLoading, setIsLoading] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);

    const handleSynthesize = async () => {
        if (!text.trim()) {
            alert("Please enter some text to synthesize.");
            return;
        }
        setIsLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: `Say cheerfully: ${text}` }] }],
                config: {
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
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Text-to-Speech (TTS)</h3>
            <div className="bg-gray-800 p-4 rounded-lg">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter text to speak..."
                    className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition h-28"
                />
                <button
                    onClick={handleSynthesize}
                    disabled={isLoading}
                    className="w-full mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:bg-gray-600"
                >
                    {isLoading ? <IconSpinner className="w-5 h-5"/> : <><IconSpeaker className="w-5 h-5"/> Synthesize & Play</>}
                </button>
            </div>
        </div>
    );
};

// Main Exported Component
type AudioTab = 'live' | 'transcribe' | 'tts';

export const AudioPlayground: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AudioTab>('live');
    
    const tabs = [
        { id: 'live' as AudioTab, label: 'Live Conversation' },
        { id: 'transcribe' as AudioTab, label: 'Transcribe Audio' },
        { id: 'tts' as AudioTab, label: 'Text-to-Speech' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'live': return <LiveConversation />;
            case 'transcribe': return <AudioTranscriber />;
            case 'tts': return <TextToSpeech />;
            default: return null;
        }
    };
    
    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold text-white">Audio Tools</h2>
             <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-purple-500 text-purple-400'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            {renderContent()}
        </div>
    );
};