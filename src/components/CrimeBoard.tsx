import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Download, AlertCircle, Play, Image as ImageIcon, X, MapPin, Zap, Sparkles, Plus, Key, Layout, Camera, BookText, BoxSelect } from 'lucide-react';

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
  const [boardType, setBoardType] = useState<'crime_board' | 'polaroid_desk' | 'scientist_desk'>('crime_board');
  const [isAngledView, setIsAngledView] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');

  // 컴포넌트 마운트 시 로컬 스토리지에서 API 키 불러오기
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_custom_api_key');
    if (savedKey) setCustomApiKey(savedKey);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomApiKey(val);
    localStorage.setItem('gemini_custom_api_key', val);
  };

  const [isGenerating, setIsGenerating] = useState(false);
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
      // 1. 최우선: 사용자가 직접 입력한 로컬 키
      let currentApiKey = customApiKey.trim();

      // 2. Try Vite's native environment variables
      if (!currentApiKey) {
        currentApiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
      }

      // 3. Try the replaced global values from vite.config.ts (if running in browser after build)
      if (!currentApiKey) {
        // @ts-ignore
        if (typeof __GEMINI_API_KEY__ !== 'undefined' && __GEMINI_API_KEY__) currentApiKey = __GEMINI_API_KEY__;
        // @ts-ignore
        else if (typeof __API_KEY__ !== 'undefined' && __API_KEY__) currentApiKey = __API_KEY__;
      }

      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          // In AI studio environment, it might inject it or we fall back to what we found
          currentApiKey = currentApiKey;
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
        if (text && text.length > 0 && boardType !== 'polaroid_desk') {
          if (boardType === 'crime_board') {
            return `- Next to Photo #${idx + 1}, attach a yellow sticky note specifically with this text: "${text}". Make the text look like natural, legible dark ink handwriting.`;
          } else if (boardType === 'scientist_desk') {
            return `- Underneath or beside Photo #${idx + 1}, place a small paper label or note specifically reading: "${text}". Make it look like a legible handwritten tag or typed note fitting a scientist's documentation.`;
          }
        }
        return null;
      }).filter(Boolean);

      const noteInstruction = notesInstructionLines.length > 0
        ? `Additionally, include notes/labels matched with the photos as follows:\n${notesInstructionLines.join('\n')}`
        : '';

      let boardPrompt = '';
      if (boardType === 'crime_board') {
        boardPrompt = `You are an expert artist specializing in hyper-realistic vintage scenes. 
        Your task is to create a SINGLE, close-up, highly detailed photograph of a detective's corkboard.
        
        CRITICAL INSTRUCTIONS:
        1. Aspect Ratio: The AI MUST generate a horizontal, wide 16:9 rectangular scene. Do NOT generate a square.
        2. Base Scene: A large horizontal corkboard mounted on a brick wall. The board is neatly framed with light wood. 
        3. Lighting (CRITICAL): There is a visible warm lamp or light fixture at the VERY TOP CENTER of the image shining directly down on the board. The light creates a bright spotlight pool in the center of the corkboard, while the edges and corners fall off into deep, natural, moody shadows (strong vignette effect). Do not use even, flat lighting. 
        4. Photos & Layout: Analyze the ${images.length} provided images. Pin them realistically onto the corkboard as clean physical photographs. Leave comfortable breathing room (empty corkboard space) around each photo so the layout feels like a well-organized, spaced-out FBI investigation board. DO NOT squish them together.
        5. ${noteInstruction}
        6. Extra Details: Add scattered, smaller, anonymous yellow/white sticky notes with question marks ("?"), generic typed documents (like witness statements), and fingerprint cards in the background spaces to fill out the scene naturally. 
        7. Connections: Connect the photos and sticky notes visibly across the empty spaces using taut RED STRING and red push-pins. The red strings form a conspiracy web.
        8. Quality: Photorealistic, 8k resolution style, extremely sharp focus on the photos and text. The generated outcome must be exactly ONE integrated layout scene.`;
      } else if (boardType === 'polaroid_desk') {
        boardPrompt = `You are an expert artist specializing in hyper-realistic vintage photography.
        Your task is to create a SINGLE, highly detailed photograph looking down at a wooden desk surface.
        
        CRITICAL INSTRUCTIONS:
        1. Aspect Ratio: The AI MUST generate a horizontal, wide 16:9 rectangular scene. Do NOT generate a square.
        2. Base Scene: A flat, top-down view of an old, warm-toned wooden desk showing signs of age and character, but clean. The wood should have dark, rich textures. In the periphery of the desk (edges or corners), casually place a classic vintage Polaroid instant camera (like an SX-70 or similar retro camera) and perhaps some loose film cartridges or a leather camera strap to set a nostalgic mood.
        3. Photos & Layout: Analyze the ${images.length} provided images. Render EVERY SINGLE ONE of them as a classic vintage Polaroid instant photograph (with the iconic thick white bottom border). Scatter these Polaroid photos casually across the wooden desk, near the vintage camera. They can slightly overlap or sit at different angles to look like someone just tossed them onto the table.
        4. Lighting: Natural, soft, beautiful daylight coming from a window off-camera, creating gentle, realistic drop shadows under the Polaroid photos and the camera to show they are resting on the physical desk.
        5. No Extra Text: Do not write any text on the Polaroid borders.
        6. Quality: Photorealistic, 8k resolution style, extremely sharp focus.`;
      } else if (boardType === 'scientist_desk') {
        boardPrompt = `You are an expert artist specializing in hyper-realistic, academic vintage scenes.
        Your task is to create a SINGLE, close-up, highly detailed photograph of a 19th-century scientist's or explorer's research desk.
        
        CRITICAL INSTRUCTIONS:
        1. Aspect Ratio: The AI MUST generate a horizontal, wide 16:9 rectangular scene. Do NOT generate a square.
        2. Base Scene: A sprawling, ancient, heavy oak desk covered in academic clutter. Surrounding the main area, place thick leather-bound antique books, a magnifying glass, maybe a brass microscope, fountain pens, inkwells, and perhaps a small fossil, skeleton fragment, or old world map to establish a strong scientific explorer vibe.
        3. Photos & Layout: Analyze the ${images.length} provided images. Render them as physical, vintage photographs or sketches resting on the desk. They should be arranged somewhat neatly in the center as the primary focus of the scene.
        4. ${noteInstruction}
        5. Connections: You may lightly connect some of the photos with thin red thread pinned to the desk, as if mapping out a theory, or leave them simply arranged.
        6. Lighting: Warm, dramatic, moody lighting, perhaps from an antique desk lamp out of frame, casting rich shadows across the books and tools.
        7. Quality: Photorealistic, cinematic, 8k resolution style, extremely sharp focus on the photos and any handwritten text.`;
      }

      const perspectiveInstruction = isAngledView
        ? `\n\nCRITICAL ANGLE REQUIREMENT: Do NOT use a flat top-down or straight-on view. Shoot from a dynamic, angled 3D perspective. The camera should be tilted looking across the scene from a realistic diagonal angle to create a strong sense of physical depth, thickness of objects, and 3D space. Use a subtle shallow depth of field (bokeh) to blur the distant background slightly.`
        : '';

      parts.push({ text: boardPrompt + perspectiveInstruction });

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

  return (
    <div className="bg-[#fdfbf7] rounded-sm shadow-2xl border border-stone-300 p-6 md:p-10 relative">
      {/* Decorative tape */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-8 bg-amber-100/40 rotate-2 border border-amber-200/30 shadow-sm backdrop-blur-sm"></div>

      <div className="grid md:grid-cols-12 gap-10">

        {/* Left Panel: Inputs */}
        <div className="md:col-span-4 flex flex-col gap-8 pr-6 border-r border-stone-200">

          {/* API Key Input (BYOK) */}
          <div className="flex flex-col gap-3">
            <label className="font-typewriter text-sm font-bold text-stone-800 flex items-center gap-2">
              <Key className="w-4 h-4" /> Your Gemini API Key
            </label>
            <div className="flex flex-col gap-2">
              <input
                type="password"
                value={customApiKey}
                onChange={handleApiKeyChange}
                placeholder="Paste your API key here (AI Studio)"
                className="w-full bg-[#fdfbf7] border border-stone-300 p-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-stone-500 shadow-inner rounded-sm"
              />
              <p className="text-[10px] text-stone-500 font-sans px-1 leading-tight">
                Keys are stored locally in your browser and never sent anywhere else. Get a free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-stone-800">Google AI Studio</a>.
              </p>
            </div>
          </div>

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

          {/* Board Type Selector */}
          <div className="flex flex-col gap-3">
            <label className="font-typewriter text-sm font-bold text-stone-800 flex items-center gap-2">
              <Layout className="w-4 h-4" /> Board Theme
            </label>
            <div className="flex flex-col gap-2 bg-stone-100 p-2 border border-stone-300 rounded-sm">
              <button
                onClick={() => setBoardType('crime_board')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-typewriter transition-all rounded-sm text-left ${boardType === 'crime_board'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300 hover:text-stone-800'
                  }`}
              >
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <div>
                  <div className="font-bold">Crime Board</div>
                  <div className="text-[10px] opacity-80 font-sans mt-0.5">Classic corkboard with red string & pins</div>
                </div>
              </button>
              <button
                onClick={() => setBoardType('polaroid_desk')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-typewriter transition-all rounded-sm text-left ${boardType === 'polaroid_desk'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300 hover:text-stone-800'
                  }`}
              >
                <Camera className="w-3 h-3 flex-shrink-0" />
                <div>
                  <div className="font-bold">Polaroid Desk</div>
                  <div className="text-[10px] opacity-80 font-sans mt-0.5">Polaroids scattered on a rustic wooden desk</div>
                </div>
              </button>
              <button
                onClick={() => setBoardType('scientist_desk')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-typewriter transition-all rounded-sm text-left ${boardType === 'scientist_desk'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300 hover:text-stone-800'
                  }`}
              >
                <BookText className="w-3 h-3 flex-shrink-0" />
                <div>
                  <div className="font-bold">Scientist Desk</div>
                  <div className="text-[10px] opacity-80 font-sans mt-0.5">Academic desk with books, notes & tools</div>
                </div>
              </button>
            </div>
          </div>

          {/* Perspective Selector */}
          <div className="flex flex-col gap-3">
            <label className="font-typewriter text-sm font-bold text-stone-800 flex items-center gap-2">
              <BoxSelect className="w-4 h-4" /> Camera Angle
            </label>
            <label className="flex items-center gap-3 cursor-pointer bg-stone-100 p-3 border border-stone-300 rounded-sm hover:bg-stone-200 transition-colors">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isAngledView}
                  onChange={(e) => setIsAngledView(e.target.checked)}
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${isAngledView ? 'bg-stone-800' : 'bg-stone-300'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isAngledView ? 'translate-x-4' : ''}`}></div>
              </div>
              <div>
                <div className="font-bold text-xs font-typewriter text-stone-800">Angled 3D Perspective (사선뷰)</div>
                <div className="text-[10px] text-stone-500 font-sans mt-0.5">Generate with physical depth and camera tilt</div>
              </div>
            </label>
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
                  {boardType !== 'polaroid_desk' && (
                    <input
                      type="text"
                      value={img.noteText || ''}
                      onChange={(e) => updateImageNote(img.id, e.target.value)}
                      placeholder={`Note for Image #${idx + 1}...`}
                      className="w-full bg-[#fcf4be] border-l-2 border-l-amber-400 border border-stone-200 p-2 text-xs font-typewriter text-stone-800 focus:outline-none focus:border-stone-400 shadow-sm"
                    />
                  )}
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
              disabled={isGenerating || images.length === 0}
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
                <img src={resultImage} alt="Completed Crime Board" className="w-full h-full object-contain bg-black" />
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2 z-30">
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
