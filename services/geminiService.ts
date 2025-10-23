import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Scene } from '../types';

const STORY_PROMPT = `
Hãy tạo ra một kịch bản chi tiết cho câu chuyện cổ tích Việt Nam "Cây tre trăm đốt".
Kịch bản phải được chia thành nhiều cảnh (khoảng 8-12 cảnh).
Mỗi cảnh phải có các thuộc tính sau trong một đối tượng JSON:
- "scene": số thứ tự của cảnh.
- "sceneDescription": một mô tả ngắn gọn về bối cảnh và hành động trong cảnh, dùng để tạo hình ảnh và video. Mô tả này phải chi tiết, giàu hình ảnh.
- "sceneDescriptionEn": Dịch "sceneDescription" sang tiếng Anh một cách chính xác.
- "narration": lời kể của người dẫn chuyện cho cảnh này, bằng tiếng Việt.
- "dialogue": một mảng các đối tượng, mỗi đối tượng chứa "character" (tên nhân vật, ví dụ: "Anh Khoai", "Phú ông", "Bụt", "Người dẫn chuyện") và "line" (lời thoại của nhân vật bằng tiếng Việt).

Ví dụ một cảnh:
{
  "scene": 1,
  "sceneDescription": "Một anh nông dân nghèo tên Khoai đang chăm chỉ làm việc trên cánh đồng lúa rộng lớn dưới trời nắng gắt. Lão phú ông đứng trên bờ, tay chống gậy, vẻ mặt gian xảo.",
  "sceneDescriptionEn": "A poor farmer named Khoai is working diligently in a vast rice field under the hot sun. The rich landlord stands on the bank, leaning on his cane, with a cunning expression.",
  "narration": "Ngày xửa ngày xưa, có một anh nông dân hiền lành, khỏe mạnh tên là Khoai. Anh phải lòng con gái của lão phú ông trong làng và đến xin làm thuê để được cưới nàng làm vợ.",
  "dialogue": []
}

Hãy đảm bảo câu chuyện đầy đủ các tình tiết chính: lời hứa của phú ông, anh Khoai vào rừng, sự giúp đỡ của Bụt, câu thần chú "khắc nhập, khắc xuất", và cái kết trừng trị lão phú ông.
Chỉ trả về một mảng JSON hợp lệ, không có bất kỳ văn bản nào khác.
`;

// FIX: Create a WAV blob from raw PCM audio data. The Gemini API returns raw PCM audio,
// which is not directly playable in an <audio> tag. This function adds a WAV
// header to make it a playable audio file.
const createWavBlobFromBase64Pcm = (base64Pcm: string): Blob => {
    const pcmBytes = atob(base64Pcm);
    const sampleRate = 24000; // TTS model output is 24000Hz
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmBytes.length;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, pcmBytes.charCodeAt(i));
    }

    return new Blob([view], { type: 'audio/wav' });
};


export const generateStoryScript = async (): Promise<Scene[]> => {
    if (!process.env.API_KEY) throw new Error("API key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: STORY_PROMPT,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        scene: { type: Type.NUMBER },
                        sceneDescription: { type: Type.STRING },
                        sceneDescriptionEn: { type: Type.STRING },
                        narration: { type: Type.STRING },
                        dialogue: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    character: { type: Type.STRING },
                                    line: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as Scene[];
};

export const generateSceneAudio = async (scene: Scene): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let ttsPrompt = "TTS the following conversation:\n";
    if (scene.narration) {
        ttsPrompt += `Người dẫn chuyện: ${scene.narration}\n`;
    }
    (scene.dialogue || []).forEach(d => {
        ttsPrompt += `${d.character}: ${d.line}\n`;
    });

    if (ttsPrompt === "TTS the following conversation:\n") {
        return ""; // No audio to generate
    }

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: {
            // FIX: Use Modality.AUDIO enum member for correctness and type safety.
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                        { speaker: 'Người dẫn chuyện', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                        { speaker: 'Anh Khoai', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
                        { speaker: 'Phú ông', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
                        { speaker: 'Bụt', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
                    ]
                }
            }
        }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate audio.");
    
    // FIX: Convert raw PCM audio data to a WAV blob to make it playable.
    const audioBlob = createWavBlobFromBase64Pcm(base64Audio);
    return URL.createObjectURL(audioBlob);
};

export const generateSceneImage = async (prompt: string): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const fullPrompt = `${prompt}, in the style of a Vietnamese fairy tale illustration, vibrant colors, folk art.`;

    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '16:9',
        },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    if (!base64ImageBytes) throw new Error("Failed to generate image.");
    
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const generateSceneVideo = async (prompt: string, imageBase64: string): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API key not found");
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const imageData = imageBase64.split(',')[1];

    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt + ", cinematic, fairy tale animation",
        image: {
            imageBytes: imageData,
            mimeType: 'image/jpeg',
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
        }
    });

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
         throw new Error("Video generation failed, no download link found.");
    }
   
    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        throw new Error(`Failed to download video: ${errorText}`);
    }
    const videoBlob = await videoResponse.blob();
    return URL.createObjectURL(videoBlob);
};