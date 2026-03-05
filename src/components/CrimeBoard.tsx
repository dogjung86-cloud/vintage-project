import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Download, AlertCircle, Play, Image as ImageIcon, X, MapPin, Zap, Sparkles, Plus } from 'lucide-react';

interface NoteItem {
  id: string;
  text: string;
}

interface EvidenceImage {
  id: string;
  file: File;
  previewUrl: string;
  noteText?: string;
}

export default function CrimeBoardGenerator() {
  const [images, setImages] = useState<EvidenceImage[]>([]);
  const [selectedModel, setSelectedModel] = useState<'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview'>('gemini-2.5-flash-image');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newImages: EvidenceImage[] = [];

      for (const file of files) {
        const previewUrl = await resizeImage(file);
        newImages.push({
          id: Math.random().toString(36).substring(7),
          file,
          previewUrl
        });
      }
      setImages(prev => [...prev, ...newImages]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const updateImageNote = (id: string, text: string) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, noteText: text } : img));
  };

  const generateBoard = async () => {
    if (images.length === 0) {
      setError("Please upload at least one image to create a crime board.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultImage(null);

    try {
      let currentApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          currentApiKey = process.env.API_KEY || currentApiKey;
        }
      }

      if (!currentApiKey) throw new Error("API key is missing. Please connect your API key.");

      const ai = new GoogleGenAI({ apiKey: currentApiKey });

      // 파트 조립: 입력 이미지들
      const parts: any[] = images.map((img) => {
        const base64Data = img.previewUrl.split(',')[1];
        return { inlineData: { data: base64Data, mimeType: img.file.type } };
      });

      // 사진별 개별 메모 지시문 생성
      const notesInstructionLines = images.map((img, idx) => {
        const text = img.noteText?.trim();
        if (text && text.length > 0) {
          return `- Next to Photo #${idx + 1}, attach a yellow sticky note specifically with this text: "${text}". Make the text look like natural, legible dark ink handwriting.`;
        }
        return null;
      }).filter(Boolean);

      const noteInstruction = notesInstructionLines.length > 0
        ? `Additionally, include yellow sticky notes on the board matched with the photos as follows:\n${notesInstructionLines.join('\n')}`
        : '';

      parts.push({
        text: `You are an expert artist specializing in hyper-realistic vintage scenes. 
        Your task is to create a SINGLE, close-up, highly detailed photograph of a detective's corkboard.
        
        CRITICAL INSTRUCTIONS:
        1. Aspect Ratio: The AI MUST generate a horizontal, wide 16:9 rectangular scene. Do NOT generate a square.
        2. Base Scene: A large horizontal corkboard mounted on a brick wall. The board is neatly framed with light wood. 
        3. Lighting (CRITICAL): There is a visible warm lamp or light fixture at the VERY TOP CENTER of the image shining directly down on the board. The light creates a bright spotlight pool in the center of the corkboard, while the edges and corners fall off into deep, natural, moody shadows (strong vignette effect). Do not use even, flat lighting. 
        4. Photos & Layout: Analyze the ${images.length} provided images. Pin them realistically onto the corkboard as clean physical photographs. Leave comfortable breathing room (empty corkboard space) around each photo so the layout feels like a well-organized, spaced-out FBI investigation board. DO NOT squish them together.
        5. ${noteInstruction}
        6. Extra Details: Add scattered, smaller, anonymous yellow/white sticky notes with question marks ("?"), generic typed documents (like witness statements), and fingerprint cards in the background spaces to fill out the scene naturally. 
        7. Connections: Connect the photos and sticky notes visibly across the empty spaces using taut RED STRING and red push-pins. The red strings form a conspiracy web.
        8. Quality: Photorealistic, 8k resolution style, extremely sharp focus on the photos and text. The generated outcome must be exactly ONE integrated layout scene.
        `
      });

      const requestOptions: any = {
        model: selectedModel,
        contents: { parts }
      };

      const generatePromise = ai.models.generateContent(requestOptions);

      // 120-second timeout for large generation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. The 4K board is taking longer than expected. Please try again.')), 120000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]) as any;

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const rawDoc = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          setResultImage(rawDoc);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) throw new Error('No image was returned by the model.');

    } catch (err: any) {
      console.error(err);
      let errorMessage = 'Failed to generate board. Please try again.';
      if (err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota'))) {
        errorMessage = 'API Quota Exceeded. The shared model has reached its limit. Please connect your own API key to continue.';
      } else if (err.message && err.message.includes('Requested entity was not found')) {
        errorMessage = 'API Key error. Please re-connect a valid Tier 1/2 API Key.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const upscaleBoard = async () => {
    if (!resultImage) return;
    setIsUpscaling(true);
    setError(null);

    try {
      let currentApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          currentApiKey = process.env.API_KEY || currentApiKey;
        }
      }

      if (!currentApiKey) throw new Error("API key is missing. Please connect your API key.");

      const ai = new GoogleGenAI({ apiKey: currentApiKey });

      const upscaleBase64 = resultImage.split(',')[1];
      const upscaleMime = resultImage.split(';')[0].split(':')[1];

      const upscaleParts = [
        { inlineData: { data: upscaleBase64, mimeType: upscaleMime } },
        { text: "Take this exact image and upscale its resolution by 2x, remastering it into ultra sharp, highly detailed, photorealistic 8k quality with maximum texture fidelity. Strictly preserve the exact layout, photos, and text." }
      ];

      const upscaleOpts: any = {
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: upscaleParts }
      };

      const upscalePromise = ai.models.generateContent(upscaleOpts);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upscale request timed out. Please try again.')), 120000)
      );

      const upscaledResponse = await Promise.race([upscalePromise, timeoutPromise]) as any;

      let finalImage = '';
      for (const part of upscaledResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          finalImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!finalImage) throw new Error('No image was returned during the upscaling step.');

      setResultImage(finalImage);

    } catch (err: any) {
      console.error(err);
      let errorMessage = 'Failed to upscale board. Please try again.';
      if (err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota'))) {
        errorMessage = 'API Quota Exceeded. The shared model has reached its limit.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsUpscaling(false);
    }
  };

  return (
    <div className="bg-[#fdfbf7] rounded-sm shadow-2xl border border-stone-300 p-6 md:p-10 relative">
      {/* Decorative tape */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-8 bg-amber-100/40 rotate-2 border border-amber-200/30 shadow-sm backdrop-blur-sm"></div>

      <div className="grid md:grid-cols-12 gap-10">

        {/* Left Panel: Inputs */}
        <div className="md:col-span-4 flex flex-col gap-8 pr-6 border-r border-stone-200">

          {/* Model Selector */}
          <div className="flex flex-col gap-3">
            <label className="font-typewriter text-sm font-bold text-stone-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> AI Generator Option
            </label>
            <div className="flex flex-col gap-2 bg-stone-100 p-2 border border-stone-300 rounded-sm">
              <button
                onClick={() => setSelectedModel('gemini-2.5-flash-image')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-typewriter transition-all rounded-sm text-left ${selectedModel === 'gemini-2.5-flash-image'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300 hover:text-stone-800'
                  }`}
              >
                <Zap className="w-3 h-3 flex-shrink-0" />
                <div>
                  <div className="font-bold">Nano Banana</div>
                  <div className="text-[10px] opacity-80 font-sans mt-0.5">Fast & Standard Quality</div>
                </div>
              </button>
              <button
                onClick={() => setSelectedModel('gemini-3.1-flash-image-preview')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-typewriter transition-all rounded-sm text-left ${selectedModel === 'gemini-3.1-flash-image-preview'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300 hover:text-stone-800'
                  }`}
              >
                <Sparkles className="w-3 h-3 flex-shrink-0" />
                <div>
                  <div className="font-bold">Nano Banana 2</div>
                  <div className="text-[10px] opacity-80 font-sans mt-0.5">Premium 4K High Quality</div>
                </div>
              </button>
            </div>
          </div>

          {/* Image Upload */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <label className="font-typewriter text-sm font-bold text-stone-800 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Evidence Photos
              </label>
              <span className="text-xs font-typewriter text-stone-500">{images.length} added</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {images.map((img, idx) => (
                <div key={img.id} className="relative flex flex-col gap-2 border border-stone-300 p-2 bg-white shadow-sm rounded-sm group">
                  <div className="relative aspect-square w-full">
                    <img src={img.previewUrl} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-2 -right-2 bg-stone-800 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={img.noteText || ''}
                    onChange={(e) => updateImageNote(img.id, e.target.value)}
                    placeholder={`Note for Image #${idx + 1}...`}
                    className="w-full bg-[#fcf4be] border-l-2 border-l-amber-400 border border-stone-200 p-2 text-xs font-typewriter text-stone-800 focus:outline-none focus:border-stone-400 shadow-sm"
                  />
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-stone-300 bg-stone-50 flex flex-col items-center justify-center text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors rounded-sm h-full max-h-[200px]"
              >
                <Plus className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-sans">Add Photo</span>
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" multiple className="hidden" />
          </div>

          <div className="mt-4 pt-6 border-t border-stone-200">
            <button
              onClick={generateBoard}
              disabled={isGenerating || isUpscaling || images.length === 0}
              className="w-full bg-stone-800 text-[#fdfbf7] px-6 py-4 font-typewriter text-lg hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-3"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {isGenerating ? 'Investigating...' : 'Generate 4K Board'}
            </button>
          </div>
        </div>

        {/* Right Panel: Output */}
        <div className="md:col-span-8 flex flex-col">
          <h3 className="font-typewriter text-sm font-bold text-stone-800 mb-4 border-b border-stone-200 pb-2">Completed Evidence Board</h3>

          <div
            className={`flex-grow border-8 border-stone-800 bg-stone-100 rounded-sm overflow-hidden flex flex-col items-center justify-center relative min-h-[500px] ${!resultImage && !isGenerating ? 'bg-[url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23d6d3d1\' fill-opacity=\'0.2\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")]' : ''
              }`}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center gap-4 text-stone-600">
                <Loader2 className="w-12 h-12 animate-spin text-stone-400" />
                <div className="text-center">
                  <p className="font-typewriter font-bold text-lg animate-pulse mb-1">Connecting the dots...</p>
                  <p className="font-sans text-xs opacity-70">Synthesizing scene layout. This may take up to 30 seconds.</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center p-8 max-w-md">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="font-typewriter text-red-600 text-sm mb-4">{error}</p>
              </div>
            ) : resultImage ? (
              <div className="w-full h-full relative group">
                <img src={resultImage} alt="Completed Crime Board" className={`w-full h-full object-contain bg-black transition-opacity ${isUpscaling ? 'opacity-30' : ''}`} />
                {isUpscaling && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 text-white">
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-amber-400" />
                    <p className="font-typewriter font-bold text-lg animate-pulse">Upscaling Resolution...</p>
                    <p className="font-sans text-xs opacity-70">Enhancing details and textures. This may take up to a minute.</p>
                  </div>
                )}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2 z-30">
                  <button
                    onClick={upscaleBoard}
                    disabled={isUpscaling}
                    className="bg-amber-100/95 backdrop-blur-sm text-amber-900 px-4 py-2 font-typewriter hover:bg-amber-200 hover:text-amber-950 transition-all shadow-xl flex items-center justify-center gap-2 rounded-sm font-bold border border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpscaling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isUpscaling ? 'Upscaling...' : 'Upscale (2x) with Nano Banana 2'}
                  </button>
                  <a
                    href={resultImage}
                    download="investigation-board-4k.png"
                    className="bg-white/95 backdrop-blur-sm text-stone-900 px-4 py-2 font-typewriter hover:bg-stone-800 hover:text-white transition-all shadow-xl flex items-center justify-center gap-2 rounded-sm font-bold border border-stone-300 hover:border-stone-800"
                  >
                    <Download className="w-4 h-4" />
                    Download Full Res
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 text-stone-400">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-typewriter text-lg mb-2">The board is empty</p>
                <p className="font-sans text-sm">Upload evidence photos on the left and run the generator.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
