
import React, { useEffect, useRef } from 'react';
import type { Scene } from '../types';

interface VideoPlayerProps {
    scene: Scene | null;
    onEnded: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ scene, onEnded }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const videoElement = videoRef.current;
        const audioElement = audioRef.current;

        if (videoElement && audioElement && scene?.videoUrl && scene.audioUrl) {
            videoElement.src = scene.videoUrl;
            audioElement.src = scene.audioUrl;

            const playMedia = async () => {
                try {
                    await videoElement.play();
                    await audioElement.play();
                } catch (error) {
                    console.error("Error playing media:", error);
                }
            };
            
            // Give a moment for src to load
            setTimeout(playMedia, 100);

        }

        if (videoElement) {
            videoElement.addEventListener('ended', onEnded);
        }

        return () => {
            if (videoElement) {
                videoElement.removeEventListener('ended', onEnded);
            }
        };
    }, [scene, onEnded]);

    if (!scene) {
        return null;
    }

    const fullText = [
        scene.narration,
        ...scene.dialogue.map(d => `${d.character}: ${d.line}`)
    ].filter(Boolean).join('\n');

    return (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl">
            <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted // Mute video to allow audio element to control sound, avoids sync issues
            />
            <audio ref={audioRef} />

            {fullText && (
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-4">
                    <p className="text-white text-center text-lg md:text-xl font-semibold whitespace-pre-wrap">
                        {fullText}
                    </p>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
