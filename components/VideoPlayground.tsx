import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ApiKeySelector } from './ApiKeySelector';
import { fileToBase64 } from '../utils/helpers';
import { IconSpinner, IconUpload, IconSparkles } from './Icons';

type AspectRatio = "16:9" | "9:16";

const loadingMessages = [
    "Warming up the digital director's chair...",
    "Choreographing pixels into motion...",
    "Rendering your cinematic masterpiece...",
    "This can take a few minutes, hang tight!",
    "Finalizing the special effects...",
    "Polishing the lens for the perfect shot...",
];


// Video Generation Component
const VideoGenerator = () => {
    const [prompt, setPrompt] = useState('A neon hologram of a cat driving a sports car at top speed through a futuristic city');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [image, setImage] = useState<{ file: File; url: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isKeyReady, setIsKeyReady] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const checkKey = async () => {
            // @ts-ignore
            if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setIsKeyReady(true);
            }
        };
        checkKey();
    }, []);
    
    useEffect(() => {
        let interval: number;
        if(isLoading) {
            interval = window.setInterval(() => {
                setLoadingMessage(prev => {
                    const currentIndex = loadingMessages.indexOf(prev);
                    return loadingMessages[(currentIndex + 1) % loadingMessages.length];
                });
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImage({ file, url: URL.createObjectURL(file) });
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim() && !image) {
            alert("Please provide a prompt or an image.");
            return;
        }
        setIsLoading(true);
        setVideoUrl(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            const imagePayload = image ? {
                imageBytes: await fileToBase64(image.file),
                mimeType: image.file.type,
            } : undefined;

            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                ...(imagePayload && { image: imagePayload }),
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: aspectRatio,
                }
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                // @ts-ignore - The type seems to be missing from the SDK definitions
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }
            
            // @ts-ignore
            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if(downloadLink) {
                 const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                 const blob = await response.blob();
                 setVideoUrl(URL.createObjectURL(blob));
            } else {
                throw new Error("Video generation completed but no download link was found.");
            }

        } catch (error: any) {
            console.error("Video generation error:", error);
            if (error.message?.includes("Requested entity was not found")) {
                alert("API Key is invalid or not found. Please select a valid key.");
                setIsKeyReady(false);
            } else {
                alert(`Failed to generate video: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isKeyReady) {
        return <ApiKeySelector onKeySelected={() => setIsKeyReady(true)} />;
    }

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Video Generation (Veo)</h3>
            <div className="space-y-4">
                 <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a detailed prompt..."
                    className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition h-24"
                />
                 <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer w-full p-4 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-purple-500 hover:text-white transition-colors"
                >
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    {image ? (
                        <div className="text-center">
                            <img src={image.url} alt="Uploaded" className="max-h-32 rounded-lg mx-auto" />
                            <span className="text-sm mt-2 block">{image.file.name} (optional starting image)</span>
                        </div>
                    ) : (
                         <div className="flex items-center gap-2">
                            <IconUpload className="w-6 h-6"/>
                            <span>Upload optional starting image</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Aspect Ratio</label>
                        <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                        >
                           <option value="16:9">16:9 (Landscape)</option>
                           <option value="9:16">9:16 (Portrait)</option>
                        </select>
                    </div>
                    <div className="flex-1 flex items-end">
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:bg-gray-600"
                        >
                            {isLoading ? <IconSpinner className="w-5 h-5"/> : <IconSparkles className="w-5 h-5" />}
                            Generate Video
                        </button>
                    </div>
                </div>

                 {isLoading && (
                    <div className="text-center p-8 bg-gray-800 rounded-lg">
                        <IconSpinner className="w-10 h-10 mx-auto mb-4 text-purple-400"/>
                        <p className="font-semibold text-lg">{loadingMessage}</p>
                        <p className="text-gray-400">Video generation can take several minutes.</p>
                    </div>
                 )}
                 {videoUrl && (
                    <div className="mt-4">
                        <h4 className="font-semibold mb-2">Generated Video:</h4>
                        <video src={videoUrl} controls autoPlay loop className="w-full rounded-lg" />
                    </div>
                 )}
            </div>
        </div>
    );
};


// Video Analyzer Component
const VideoAnalyzer = () => {
    const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
    const [prompt, setPrompt] = useState('Summarize this video in a few sentences.');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setVideo({ file, url: URL.createObjectURL(file) });
            setResult('');
        }
    };

    const analyzeVideo = async () => {
        if (!video || !videoRef.current) {
            alert("Please upload a video file.");
            return;
        }
        setIsLoading(true);
        setResult('');

        try {
            const frames = await extractFrames(videoRef.current, 1); // 1 frame per second
            if (frames.length === 0) {
                throw new Error("Could not extract any frames from the video.");
            }

            const frameParts = frames.map(frameData => ({
                inlineData: { mimeType: 'image/jpeg', data: frameData.split(',')[1] }
            }));
            const textPart = { text: prompt };

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts: [textPart, ...frameParts] },
            });
            setResult(response.text);

        } catch (error: any) {
            console.error("Video analysis error:", error);
            alert(`Failed to analyze video: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const extractFrames = (videoElement: HTMLVideoElement, fps: number): Promise<string[]> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const frames: string[] = [];
            let currentTime = 0;
            const duration = videoElement.duration;

            videoElement.onseeked = () => {
                if (!context) return;
                canvas.width = videoElement.videoWidth;
                canvas.height = videoElement.videoHeight;
                context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                frames.push(canvas.toDataURL('image/jpeg'));

                currentTime += 1 / fps;
                if (currentTime <= duration) {
                    videoElement.currentTime = currentTime;
                } else {
                    resolve(frames);
                }
            };
            
            videoElement.currentTime = currentTime;
        });
    };


    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Video Analysis</h3>
            <div className="space-y-4">
                 <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer w-full p-8 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-purple-500 hover:text-white transition-colors"
                >
                    <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    {video ? (
                        <video ref={videoRef} src={video.url} className="max-h-48 rounded-lg" muted onLoadedMetadata={() => videoRef.current?.load()} />
                    ) : (
                        <>
                            <IconUpload className="w-10 h-10 mb-2"/>
                            <span>Click to upload a video</span>
                        </>
                    )}
                </div>
                 <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="What do you want to know about the video?"
                    className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition h-20"
                />
                 <button
                    onClick={analyzeVideo}
                    disabled={isLoading || !video}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:bg-gray-600"
                >
                    {isLoading ? <IconSpinner className="w-5 h-5"/> : <IconSparkles className="w-5 h-5" />}
                    Analyze Video
                </button>

                 {result && (
                     <div className="mt-4 p-4 bg-gray-900 rounded-md">
                        <h4 className="font-semibold text-gray-300 mb-2">Analysis Result:</h4>
                        <p className="text-gray-300 whitespace-pre-wrap">{result}</p>
                    </div>
                )}
            </div>
        </div>
    )
};


// Main Exported Component
type VideoTab = 'generate' | 'analyze';

export const VideoPlayground: React.FC = () => {
    const [activeTab, setActiveTab] = useState<VideoTab>('generate');
    
    const tabs = [
        { id: 'generate' as VideoTab, label: 'Generate' },
        { id: 'analyze' as VideoTab, label: 'Analyze' },
    ];
    
    const renderContent = () => {
        switch (activeTab) {
            case 'generate': return <VideoGenerator />;
            case 'analyze': return <VideoAnalyzer />;
            default: return null;
        }
    };
    
    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold text-white">Video Tools</h2>
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
