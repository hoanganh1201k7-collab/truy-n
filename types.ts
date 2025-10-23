
export interface Dialogue {
  character: string;
  line: string;
}

export interface Scene {
  scene: number;
  sceneDescription: string;
  sceneDescriptionEn: string;
  narration: string;
  dialogue: Dialogue[];
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export type GenerationStep = 'idle' | 'key_selection' | 'script' | 'audio' | 'image' | 'video' | 'playing' | 'error';
