import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { fileToBase64 } from '../utils/helpers';
import { IconSpinner, IconUpload, IconSparkles } from './Icons';

type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];


// Image Generation Component
const ImageGenerator = () => {
    const [prompt, setPrompt] = useState('A cinematic shot of a raccoon astronaut, wearing a retro sci-fi helmet, floating in space with Earth in the background, hyper-detailed, 8k');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
    const [images, setImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const generateImages = async () => {
        if (!prompt.trim()) {
            alert("Please enter a prompt.");
            return;
        }
        setIsLoading(true);
        setImages([]);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio,
                },
            });

            const generatedImages = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
            setImages(generatedImages);

        } catch (error) {
            console.error("Image generation error:", error);
            alert("Failed to generate images. Check the console for details.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
         <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Image Generation</h3>
            <div className="space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a detailed prompt..."
                    className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition h-24"
                />
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Aspect Ratio</label>
                        <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                        >
                            {aspectRatios.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 flex items-end">
                        <button
                            onClick={generateImages}
                            disabled={isLoading}
                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:bg-gray-600"
                        >
                            {isLoading ? <IconSpinner className="w-5 h-5"/> : <IconSparkles className="w-5 h-5" />}
                            Generate
                        </button>
                    </div>
                </div>
                {isLoading && <div className="text-center p-4">Generating... This may take a moment.</div>}
                {images.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mt-4">
                        {images.map((src, index) => (
                            <img key={index} src={src} alt={`Generated image ${index + 1}`} className="rounded-lg w-full object-contain" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


// Image Analyzer & Editor Component
const ImageManipulator = ({ mode }: { mode: 'analyze' | 'edit' }) => {
    const [image, setImage] = useState<{ file: File; url: string } | null>(null);
    const [prompt, setPrompt] = useState(mode === 'analyze' ? 'What is in this image?' : 'Add a retro cinematic filter');
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImage({ file, url: URL.createObjectURL(file) });
            setResult('');
        }
    };

    const processImage = async () => {
        if (!image || !prompt.trim()) {
            alert(`Please upload an image and enter a prompt.`);
            return;
        }
        setIsLoading(true);
        setResult('');
        try {
            const base64Image = await fileToBase64(image.file);
            const imagePart = {
                inlineData: {
                    mimeType: image.file.type,
                    data: base64Image,
                },
            };
            const textPart = { text: prompt };

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            if (mode === 'analyze') {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [imagePart, textPart] },
                });
                setResult(response.text);
            } else { // edit mode
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [imagePart, textPart] },
                    config: {
                        responseModalities: [Modality.IMAGE],
                    },
                });
                const editedImagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (editedImagePart?.inlineData) {
                    const editedImageUrl = `data:${editedImagePart.inlineData.mimeType};base64,${editedImagePart.inlineData.data}`;
                    setResult(editedImageUrl);
                } else {
                    throw new Error("No edited image returned from API.");
                }
            }
        } catch (error) {
            console.error(`Image ${mode} error:`, error);
            alert(`Failed to ${mode} image. Check console for details.`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Image {mode === 'analyze' ? 'Analysis' : 'Editing'}</h3>
            <div className="space-y-4">
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer w-full p-8 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-purple-500 hover:text-white transition-colors"
                >
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    {image ? (
                        <img src={image.url} alt="Uploaded" className="max-h-48 rounded-lg" />
                    ) : (
                        <>
                            <IconUpload className="w-10 h-10 mb-2"/>
                            <span>Click to upload an image</span>
                        </>
                    )}
                </div>

                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={mode === 'analyze' ? 'Ask a question about the image...' : 'Describe the edit you want...'}
                    className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition h-20"
                />
                 <button
                    onClick={processImage}
                    disabled={isLoading || !image}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:bg-gray-600"
                >
                    {isLoading ? <IconSpinner className="w-5 h-5"/> : <IconSparkles className="w-5 h-5" />}
                    {mode === 'analyze' ? 'Analyze Image' : 'Edit Image'}
                </button>
                
                {result && (
                     <div className="mt-4 p-4 bg-gray-900 rounded-md min-h-[100px]">
                        <h4 className="font-semibold text-gray-300 mb-2">Result:</h4>
                        {mode === 'analyze' ? (
                            <p className="text-gray-300 whitespace-pre-wrap">{result}</p>
                        ) : (
                            <img src={result} alt="Edited result" className="rounded-lg w-full object-contain" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Main Exported Component
type ImageTab = 'generate' | 'analyze' | 'edit';

export const ImagePlayground: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ImageTab>('generate');
    
    const tabs = [
        { id: 'generate' as ImageTab, label: 'Generate' },
        { id: 'analyze' as ImageTab, label: 'Analyze' },
        { id: 'edit' as ImageTab, label: 'Edit' },
    ];
    
    const renderContent = () => {
        switch (activeTab) {
            case 'generate': return <ImageGenerator />;
            case 'analyze': return <ImageManipulator mode="analyze" />;
            case 'edit': return <ImageManipulator mode="edit" />;
            default: return null;
        }
    };
    
    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold text-white">Image Tools</h2>
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
