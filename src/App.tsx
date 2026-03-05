import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Loader2, Download, RefreshCw, Paperclip, AlertCircle, Newspaper, PenTool, Book, Camera, MapPin, X, Key, Trash2, Plus, Play, FileText, Layout, Clipboard, Hammer, Scissors, Zap, Sparkles, Layers, ListTodo } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import CrimeBoardGenerator from './components/CrimeBoard';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const removeBackground = (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();

    const timeoutId = setTimeout(() => {
      console.warn("removeBackground timed out");
      resolve(base64Image);
    }, 5000);

    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(base64Image);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const width = canvas.width;
        const height = canvas.height;

        // 1. Flood fill from edges
        const stack: number[] = [];
        let stackPtr = 0;

        // Helper to check if a pixel is "magenta-ish" or close to the corner background color
        const isBg = (r: number, g: number, b: number) => {
          // Magenta detection: red and blue are dominant over green
          const isMagenta = r > g + 30 && b > g + 30;
          // Also catch dark purple/magenta shadows
          const isDarkMagenta = r > g + 10 && b > g + 10 && r < 100 && b < 100;
          return isMagenta || isDarkMagenta;
        };

        const push = (x: number, y: number) => {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] !== 0) {
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];

              if (isBg(r, g, b)) {
                data[idx + 3] = 0; // Transparent
                stack[stackPtr++] = x;
                stack[stackPtr++] = y;
              }
            }
          }
        };

        // Seed edges (multiple layers deep to bypass thin borders)
        for (let depth = 0; depth < 10; depth++) {
          for (let x = 0; x < width; x++) { push(x, depth); push(x, height - 1 - depth); }
          for (let y = 0; y < height; y++) { push(depth, y); push(width - 1 - depth, y); }
        }

        while (stackPtr > 0) {
          const y = stack[--stackPtr];
          const x = stack[--stackPtr];
          push(x + 1, y);
          push(x - 1, y);
          push(x, y + 1);
          push(x, y - 1);
        }

        // 2. Aggressive Fringe Removal
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If it still has a magenta/purple tint
            if (r > g + 15 && b > g + 15) {
              // Desaturate completely
              const gray = (r + g + b) / 3;
              data[i] = gray;
              data[i + 1] = gray;
              data[i + 2] = gray;
              // Make it semi-transparent to soften the edge
              data[i + 3] = Math.floor(data[i + 3] * 0.5);
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);

        // Create a new canvas to apply the drop shadow
        const padding = 40;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width + padding * 2;
        finalCanvas.height = canvas.height + padding * 2;
        const finalCtx = finalCanvas.getContext('2d');

        if (finalCtx) {
          // Configure realistic drop shadow for corkboard
          finalCtx.shadowColor = 'rgba(0, 0, 0, 0.8)'; // Pure black shadow, darker to overpower any remaining fringe
          finalCtx.shadowBlur = 12;
          finalCtx.shadowOffsetX = 4;
          finalCtx.shadowOffsetY = 6;

          // Draw the transparent image onto the new canvas
          finalCtx.drawImage(canvas, padding, padding);
          resolve(finalCanvas.toDataURL('image/png'));
        } else {
          resolve(canvas.toDataURL('image/png'));
        }
      } catch (e) {
        console.error("Error in removeBackground:", e);
        resolve(base64Image);
      }
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
};

interface EvidenceItem {
  id: string;
  file: File;
  previewUrl: string;
  style: string;
  fastener: string;
  pulpText: string;
  generatedImage: string | null;
  status: 'idle' | 'generating' | 'success' | 'error';
  error: string | null;
}

export default function App() {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview'>('gemini-2.5-flash-image');
  const [activeTab, setActiveTab] = useState<'generator' | 'board'>('generator');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STYLES = [
    { id: 'polaroid', label: 'Polaroid', icon: Camera },
    { id: 'newspaper', label: 'Newspaper', icon: Newspaper },
    { id: 'pulp', label: 'Pulp Novel', icon: Book },
    { id: 'sketch', label: 'Grid Sketch', icon: PenTool },
    { id: 'white_newspaper', label: 'White Newspaper', icon: FileText },
    { id: 'wood_panel', label: 'Wood Panel', icon: Layout },
    { id: 'wrinkled_cutout', label: 'Wrinkled Cutout', icon: Scissors },
    { id: 'paper_craft', label: 'Paper Craft', icon: Layers },
  ];

  const FASTENERS = [
    { id: 'tape', label: 'Masking Tape', icon: Paperclip },
    { id: 'pin', label: 'Brass Pin', icon: MapPin },
    { id: 'nail', label: 'Old Nail', icon: Hammer },
    { id: 'none', label: 'None', icon: X },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f: any) => f.type.startsWith('image/')) as File[];
      processFiles(files);
    }
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: File[]) => {
    for (const file of files) {
      const previewUrl = await resizeImage(file);
      const newItem: EvidenceItem = {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl,
        style: 'polaroid',
        fastener: 'tape',
        pulpText: '',
        generatedImage: null,
        status: 'idle',
        error: null
      };
      setItems(prev => [...prev, newItem]);
    }
  };

  const updateItem = (id: string, updates: Partial<EvidenceItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const generateItem = async (item: EvidenceItem) => {
    if (item.status === 'generating') return;

    updateItem(item.id, { status: 'generating', error: null });

    try {
      let currentApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          currentApiKey = process.env.API_KEY || currentApiKey;
        }
      }

      if (!currentApiKey) throw new Error("API key is missing.");

      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const base64Data = item.previewUrl.split(',')[1];

      const modelName = selectedModel;

      const requestOptions: any = {
        model: modelName,
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: item.file.type } },
            {
              text: `You are an expert 2D game asset designer. Your task is to take the EXACT provided image and format it as an isolated vintage item.
              
              CRITICAL INSTRUCTIONS:
              1. BACKGROUND: The background MUST be 100% PURE SOLID MAGENTA (#FF00FF). The magenta MUST touch all absolute edges of the image. DO NOT draw a corkboard, DO NOT draw a desk, DO NOT draw a frame or border around the magenta. The ONLY thing in the image should be the vintage item resting directly on the magenta background.
              2. PRESERVE IMAGE: ${item.style === 'wrinkled_cutout' ? 'Identify the main subject (person or object) and extract ONLY its silhouette, ignoring the original photo background.' : 'DO NOT remove, crop, or alter the background of the provided image itself. The original image must remain completely intact inside its new frame.'}
              3. FASTENER: ${item.fastener === 'tape' ? 'Add a piece of wrinkled masking tape to the top edge of the item.' :
                  item.fastener === 'pin' ? 'Add a single, round and flat brass drawing pin (thumbtack) to the top center. It should look like a flat circular metal disc pressed flush against the surface. Use a dull, weathered, and tarnished brass finish with slight oxidation to look vintage.' :
                    item.fastener === 'nail' ? 'Add a single, rusty old iron nail driven directly THROUGH the top center of the item. Only the flat, rusty nail head should be visible, pressed firmly against the item surface as if it is nailing the item to a wall. DO NOT show the long body or shank of the nail. The nail head should cast a tiny, sharp shadow on the item to show it is firmly attached.' :
                      'Do NOT add any tape, pins, clips, nails, or fasteners.'
                }
              
              Style instructions: ${item.style === 'polaroid' ? 'Frame the exact provided image inside a vintage, scratched polaroid photo border. Worn white borders, retro colors.' :
                  item.style === 'newspaper' ? 'Embed the exact provided image as a printed photo within a heavily torn, aged vintage newspaper clipping. The newspaper MUST have highly irregular, ripped, and jagged edges. Add prominent brown water stains, coffee rings, and heavy foxing to the paper. Old yellowed newsprint, halftone dots, blurred vintage text snippets around the photo.' :
                    item.style === 'pulp' ? `Use the exact provided image as the main cover art for a vintage 1950s pulp detective novel. ${item.pulpText ? `Add a dramatic title reading EXACTLY "${item.pulpText}".` : 'Do not add any title text.'} Use retro typography, and worn book edges around it.` :
                      item.style === 'white_newspaper' ? 'Embed the exact provided image as a printed photo within a torn, aged white newspaper clipping. The paper should be mostly white or light gray. Include blurred vintage newsprint text, small columns, and a classic newspaper layout around the photo. The edges MUST be slightly torn and irregular. Add subtle water stains and foxing.' :
                        item.style === 'wood_panel' ? 'Embed the exact provided image onto an old, weathered wooden panel or board. The wood should have visible grain, scratches, and a vintage, rustic feel. The image should look like it is painted or printed directly onto the wood.' :
                          item.style === 'wrinkled_cutout' ? 'Identify the main subject (person or object) in the provided image and create a cutout of ONLY that subject, ignoring its original background. Add a thick, irregular white paper border that follows the subject\'s silhouette precisely. The entire cutout must have a subtle, light wrinkled paper texture with soft folds and gentle creases, making it look like a piece of paper that was slightly handled.' :
                            item.style === 'paper_craft' ? 'Transform the exact provided image into a handmade 3D paper craft collage. Recreate the subject and scene entirely using layered pieces of colored construction paper, torn craft paper, and corrugated cardboard. The elements should look physically cut or torn and glued together, with visible thickness, paper textures, and slight drop shadows between the layers to give a 3D tactile effect. The overall aesthetic should be charming, crafty, and highly textured.' :
                              'Redraw the exact provided image as a rough pencil sketch on a piece of folded, stained grid paper. Worn edges, vintage evidence look.'
                }`
            }
          ]
        }
      };

      if (modelName === 'gemini-2.5-flash-image') {
        requestOptions.config = {
          imageConfig: {
            imageSize: '1K'
          }
        };
      }

      const generatePromise = ai.models.generateContent(requestOptions);

      // Add a 60-second timeout to prevent infinite hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 60000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]) as any;

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const rawImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          const transparentImage = await removeBackground(rawImage);
          updateItem(item.id, { generatedImage: transparentImage, status: 'success' });
          foundImage = true;
          break;
        }
      }

      if (!foundImage) throw new Error('No image was returned by the model.');

    } catch (err: any) {
      console.error(err);
      let errorMessage = 'Failed to process evidence. Please try again.';
      if (err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota'))) {
        errorMessage = 'API Quota Exceeded. The shared model has reached its limit. If you are a Tier 1 user, please connect your own API key to continue.';
      } else if (err.message && err.message.includes('Requested entity was not found')) {
        errorMessage = 'API Key error. Please re-connect a valid Tier 1 API Key.';
        if (window.aistudio) {
          window.aistudio.openSelectKey();
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      updateItem(item.id, { status: 'error', error: errorMessage });
    }
  };

  const generateAll = async () => {
    setIsGeneratingAll(true);
    // Process sequentially to avoid hitting rate limits too hard
    for (const item of items) {
      if (item.status === 'idle' || item.status === 'error') {
        await generateItem(item);
      }
    }
    setIsGeneratingAll(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="mb-8 text-center relative">
          <h1 className="font-typewriter text-4xl md:text-5xl font-bold text-stone-800 mb-2 tracking-tighter">
            EVIDENCE LOCKER
          </h1>
          <p className="font-typewriter text-stone-600 text-lg">
            Case File: Vintage Collage Generator
          </p>
          <div className="h-px w-32 bg-stone-400 mx-auto mt-4"></div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-6">
            <div className="flex bg-stone-200 p-1 rounded-sm border border-stone-300">
              <button
                onClick={() => setSelectedModel('gemini-2.5-flash-image')}
                className={`flex items-center gap-2 px-4 py-1.5 text-xs font-typewriter transition-all rounded-sm ${selectedModel === 'gemini-2.5-flash-image'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300'
                  }`}
              >
                <Zap className="w-3 h-3" />
                Nano Banana (Standard)
              </button>
              <button
                onClick={() => setSelectedModel('gemini-3.1-flash-image-preview')}
                className={`flex items-center gap-2 px-4 py-1.5 text-xs font-typewriter transition-all rounded-sm ${selectedModel === 'gemini-3.1-flash-image-preview'
                  ? 'bg-stone-800 text-[#fdfbf7] shadow-sm'
                  : 'text-stone-600 hover:bg-stone-300'
                  }`}
              >
                <Sparkles className="w-3 h-3" />
                Nano Banana 2 (Pro/High Quality)
              </button>
            </div>

            {window.aistudio && (
              <button
                onClick={async () => {
                  if (window.aistudio) {
                    await window.aistudio.openSelectKey();
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-sm font-typewriter text-xs transition-colors border border-stone-300"
              >
                <Key className="w-3 h-3" />
                Connect API Key
              </button>
            )}
          </div>
          {/* Tabs */}
          <div className="flex justify-center mt-8 space-x-4 border-b border-stone-300 pb-px">
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-6 py-2 font-typewriter tracking-wide text-sm font-bold flex items-center gap-2 border-b-4 transition-colors ${activeTab === 'generator'
                ? 'border-stone-800 text-stone-800 bg-stone-100 rounded-t-md'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded-t-md'
                }`}
            >
              <Layout className="w-4 h-4" /> Item Generator
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`px-6 py-2 font-typewriter tracking-wide text-sm font-bold flex items-center gap-2 border-b-4 transition-colors ${activeTab === 'board'
                ? 'border-stone-800 text-stone-800 bg-stone-100 rounded-t-md'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded-t-md'
                }`}
            >
              <ListTodo className="w-4 h-4" /> Crime Board
            </button>
          </div>
        </div>

        {/* Main Content */}
        {activeTab === 'generator' ? (
          <div className="bg-[#fdfbf7] rounded-sm shadow-2xl border border-stone-300 p-6 md:p-10 relative">
            {/* Decorative tape */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-8 bg-amber-100/40 rotate-2 border border-amber-200/30 shadow-sm backdrop-blur-sm"></div>
            <div className="absolute -bottom-3 right-10 w-24 h-8 bg-amber-100/40 -rotate-3 border border-amber-200/30 shadow-sm backdrop-blur-sm"></div>

            {items.length === 0 ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-stone-300 rounded-sm p-16 flex flex-col items-center justify-center text-stone-500 hover:bg-stone-50/50 hover:border-stone-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-12 h-12 mb-4 text-stone-400" />
                <p className="font-typewriter text-xl mb-2 text-stone-700">Attach Evidence Here</p>
                <p className="text-sm font-sans text-stone-400">Drag & drop photos, or click to browse</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {/* Toolbar */}
                <div className="flex justify-between items-center bg-stone-200/50 p-4 rounded-sm border border-stone-300">
                  <div className="flex items-center gap-4">
                    <span className="font-typewriter text-stone-700 font-bold">{items.length} Items Attached</span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-300 text-stone-700 rounded-sm font-typewriter text-sm transition-colors border border-stone-300"
                    >
                      <Plus className="w-4 h-4" />
                      Add More
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                  </div>
                  <button
                    onClick={generateAll}
                    disabled={isGeneratingAll || items.every(i => i.status === 'success')}
                    className="bg-stone-800 text-[#fdfbf7] px-6 py-2 font-typewriter hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md flex items-center gap-2"
                  >
                    {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isGeneratingAll ? 'Processing...' : 'Generate All Evidence'}
                  </button>
                </div>

                {/* Items List */}
                <div className="flex flex-col gap-8">
                  {items.map((item, index) => (
                    <div key={item.id} className="grid md:grid-cols-12 gap-6 bg-white p-4 rounded-sm border border-stone-200 shadow-sm relative">
                      {/* Delete Button */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="absolute top-2 right-2 p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-sm transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Original Image (Col 1-3) */}
                      <div className="md:col-span-3 flex flex-col gap-2">
                        <h3 className="font-typewriter text-sm font-bold text-stone-600">Exhibit {index + 1}</h3>
                        <div className="relative aspect-square bg-stone-100 rounded-sm overflow-hidden border border-stone-300 shadow-inner p-2">
                          <img src={item.previewUrl} alt={`Original ${index + 1}`} className="w-full h-full object-contain" />
                        </div>
                      </div>

                      {/* Settings (Col 4-7) */}
                      <div className="md:col-span-4 flex flex-col gap-4 py-6">
                        <div className="flex flex-col gap-2">
                          <span className="font-typewriter text-xs text-stone-500 font-bold">Style:</span>
                          <div className="flex flex-wrap gap-2">
                            {STYLES.map((style) => {
                              const Icon = style.icon;
                              return (
                                <button
                                  key={style.id}
                                  onClick={() => updateItem(item.id, { style: style.id })}
                                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-sm font-typewriter text-xs transition-colors ${item.style === style.id
                                    ? 'bg-stone-800 text-[#fdfbf7] shadow-md'
                                    : 'text-stone-600 bg-stone-100 hover:bg-stone-300/50 border border-stone-300'
                                    }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {style.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="font-typewriter text-xs text-stone-500 font-bold">Fastener:</span>
                          <div className="flex flex-wrap gap-2">
                            {FASTENERS.map((fastener) => {
                              const Icon = fastener.icon;
                              return (
                                <button
                                  key={fastener.id}
                                  onClick={() => updateItem(item.id, { fastener: fastener.id })}
                                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-sm font-typewriter text-xs transition-colors ${item.fastener === fastener.id
                                    ? 'bg-stone-800 text-[#fdfbf7] shadow-md'
                                    : 'text-stone-600 bg-stone-100 hover:bg-stone-300/50 border border-stone-300'
                                    }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {fastener.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {item.style === 'pulp' && (
                          <div className="flex flex-col gap-2">
                            <span className="font-typewriter text-xs text-stone-500 font-bold">Pulp Novel Title (English):</span>
                            <input
                              type="text"
                              value={item.pulpText}
                              onChange={(e) => updateItem(item.id, { pulpText: e.target.value })}
                              placeholder="e.g. THE MYSTERY"
                              className="px-3 py-2 rounded-sm border border-stone-300 font-typewriter text-sm bg-stone-50 focus:outline-none focus:border-stone-500"
                            />
                          </div>
                        )}

                        <div className="mt-auto pt-4">
                          <button
                            onClick={() => generateItem(item)}
                            disabled={item.status === 'generating'}
                            className="w-full bg-stone-200 text-stone-800 px-4 py-2 font-typewriter hover:bg-stone-300 transition-colors shadow-sm flex items-center justify-center gap-2 border border-stone-300 text-sm disabled:opacity-50"
                          >
                            {item.status === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {item.status === 'success' ? 'Regenerate' : 'Generate'}
                          </button>
                        </div>
                      </div>

                      {/* Result Image (Col 8-12) */}
                      <div className="md:col-span-5 flex flex-col gap-2">
                        <h3 className="font-typewriter text-sm font-bold text-stone-600">Processed File</h3>
                        <div
                          className="relative flex-grow aspect-square bg-stone-100 rounded-sm overflow-hidden border border-stone-300 shadow-inner flex flex-col items-center justify-center p-2"
                          style={item.generatedImage && item.status !== 'generating' ? {
                            backgroundColor: '#c8a981',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`,
                            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1)'
                          } : {}}
                        >
                          {item.status === 'generating' ? (
                            <div className="flex flex-col items-center text-stone-600">
                              <Loader2 className="w-8 h-8 animate-spin mb-3" />
                              <p className="font-typewriter animate-pulse text-sm">Processing...</p>
                            </div>
                          ) : item.generatedImage ? (
                            <img src={item.generatedImage} alt={`Generated ${index + 1}`} className="w-full h-full object-contain" />
                          ) : item.status === 'error' ? (
                            <div className="text-center p-4">
                              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                              <p className="font-typewriter text-red-600 text-xs mb-3">{item.error}</p>
                              {(item.error?.includes('Quota') || item.error?.includes('429')) && window.aistudio && (
                                <button
                                  onClick={() => window.aistudio?.openSelectKey()}
                                  className="bg-red-100 text-red-700 px-3 py-1.5 text-xs font-typewriter hover:bg-red-200 transition-colors rounded-sm flex items-center gap-1.5 mx-auto"
                                >
                                  <Key className="w-3 h-3" />
                                  Connect My API Key
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="text-center p-4">
                              <p className="font-typewriter text-stone-400 text-sm">Awaiting processing</p>
                            </div>
                          )}
                        </div>

                        {item.generatedImage && item.status !== 'generating' && (
                          <div className="flex justify-end mt-1">
                            <a
                              href={item.generatedImage}
                              download={`evidence-${index + 1}.png`}
                              className="bg-stone-800 text-[#fdfbf7] px-3 py-1.5 text-xs font-typewriter hover:bg-stone-700 transition-colors shadow-md flex items-center gap-1.5 rounded-sm"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <CrimeBoardGenerator />
        )}

        <div className="mt-8 text-center">
          <p className="font-typewriter text-stone-500 text-sm">
            CONFIDENTIAL • FOR AUTHORIZED PERSONNEL ONLY
          </p>
        </div>
      </div>
    </div>
  );
}
