import React, { useState, useEffect, useCallback } from 'react';
import type { Scene, GenerationStep } from './types';
import * as geminiService from './services/geminiService';
import VideoPlayer from './components/VideoPlayer';

declare global {
    // FIX: Define AIStudio as an interface to allow for declaration merging and resolve type conflicts.
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        // FIX: Make the 'aistudio' property on the Window interface optional to resolve a TypeScript declaration conflict.
        aistudio?: AIStudio;
    }
}

const LoadingIndicator: React.FC<{ status: string }> = ({ status }) => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <svg className="animate-spin h-12 w-12 text-purple-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-xl font-semibold text-purple-300">{status}</p>
        <p className="text-gray-400 mt-2">AI is crafting your fairy tale. This may take several minutes...</p>
    </div>
);


const App: React.FC = () => {
    const [apiKeySelected, setApiKeySelected] = useState(false);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [step, setStep] = useState<GenerationStep>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkApiKey = useCallback(async () => {
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
            setApiKeySelected(true);
            setStep('idle');
        } else {
            setApiKeySelected(false);
            setStep('key_selection');
        }
    }, []);

    useEffect(() => {
        checkApiKey();
    }, [checkApiKey]);

    const handleSelectKey = async () => {
        if(window.aistudio) {
            await window.aistudio.openSelectKey();
            // Assume success to avoid race conditions and re-check on next action
            setApiKeySelected(true);
            setStep('idle');
        }
    };
    
    const resetState = () => {
        setScenes([]);
        setStep('idle');
        setProgress({ current: 0, total: 0 });
        setCurrentSceneIndex(null);
        setError(null);
    };

    const handleGenerateVideo = async () => {
        await checkApiKey();
        if (!apiKeySelected) {
            setError("Please select an API key first.");
            setStep('key_selection');
            return;
        }

        resetState();
        
        try {
            setStep('script');
            const script = await geminiService.generateStoryScript();
            setScenes(script);
            setProgress({ current: 0, total: script.length });

            const scenesWithAssets: Scene[] = [];
            for (let i = 0; i < script.length; i++) {
                const scene = script[i];
                
                setStep('audio');
                setProgress({ current: i + 1, total: script.length });
                scene.audioUrl = await geminiService.generateSceneAudio(scene);

                setStep('image');
                scene.imageUrl = await geminiService.generateSceneImage(scene.sceneDescriptionEn);
                
                setStep('video');
                try {
                    scene.videoUrl = await geminiService.generateSceneVideo(scene.sceneDescriptionEn, scene.imageUrl);
                } catch(e: any) {
                    if (e.message && e.message.includes("Requested entity was not found.")) {
                       setError("API Key is invalid. Please select a valid key.");
                       setStep('key_selection');
                       setApiKeySelected(false);
                       return;
                    }
                    throw e; // re-throw other errors
                }

                scenesWithAssets.push(scene);
                setScenes([...scenesWithAssets]);
            }

            setStep('playing');
            setCurrentSceneIndex(0);

        } catch (err: any) {
            console.error(err);
            setError(`An error occurred: ${err.message}`);
            setStep('error');
        }
    };
    
    const handleNextScene = () => {
        if (currentSceneIndex !== null && currentSceneIndex < scenes.length - 1) {
            setCurrentSceneIndex(currentSceneIndex + 1);
        } else {
             setCurrentSceneIndex(null);
             setStep('idle'); // Story finished
        }
    };
    
    const getStatusMessage = () => {
        switch (step) {
            case 'idle': return 'Ready to create your story';
            case 'key_selection': return 'Please select your API Key to begin.';
            case 'script': return 'Generating story script...';
            case 'audio': return `Generating audio for scene ${progress.current}/${progress.total}...`;
            case 'image': return `Generating image for scene ${progress.current}/${progress.total}...`;
            case 'video': return `Generating video for scene ${progress.current}/${progress.total}...`;
            case 'playing': return 'Playing your story...';
            case 'error': return `Error: ${error}`;
            default: return '';
        }
    };
    
    const isGenerating = ['script', 'audio', 'image', 'video'].includes(step);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                        AI Fairy Tale Generator
                    </h1>
                    <p className="text-gray-300 mt-2 text-lg">"Cây Tre Trăm Đốt" - The Hundred-Knot Bamboo</p>
                </header>

                <main className="bg-gray-800 rounded-xl shadow-2xl p-6 min-h-[500px] flex flex-col justify-center items-center">
                    {step === 'playing' && currentSceneIndex !== null ? (
                        <VideoPlayer scene={scenes[currentSceneIndex]} onEnded={handleNextScene} />
                    ) : (
                        <div className="text-center">
                           {isGenerating ? (
                                <LoadingIndicator status={getStatusMessage()} />
                           ) : (
                            <>
                                {step === 'key_selection' && (
                                    <div className="flex flex-col items-center">
                                        <p className="text-red-400 mb-4">{error || "A personal API key is required to generate videos."}</p>
                                        <p className="text-gray-400 mb-4 text-sm">Video generation is an experimental feature and requires billing to be enabled. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Learn more</a>.</p>
                                        <button 
                                            onClick={handleSelectKey}
                                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105"
                                        >
                                            Select API Key
                                        </button>
                                    </div>
                                )}
                                {(step === 'idle' || step === 'error') && (
                                    <div className="flex flex-col items-center">
                                        {error && <p className="text-red-400 mb-4">{error}</p>}
                                        <p className="mb-6 text-gray-300">
                                            {step === 'idle' && scenes.length > 0 ? 'Story finished. Want to create it again?' : 'Click the button below to generate the entire story video with AI.'}
                                        </p>
                                        <button 
                                            onClick={handleGenerateVideo}
                                            disabled={isGenerating}
                                            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ✨ Create My Fairy Tale ✨
                                        </button>
                                    </div>
                                )}
                            </>
                           )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;