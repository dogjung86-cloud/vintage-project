import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModels() {
    const m = 'gemini-3.1-flash-image-preview';
    const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const mimeType = "image/png";

    try {
        console.log(`Testing ${m} with full real prompt...`);
        const response = await ai.models.generateContent({
            model: m,
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    {
                        text: `You are an expert 2D game asset designer. Your task is to take the EXACT provided image and format it as an isolated vintage item.
            
            CRITICAL INSTRUCTIONS:
            1. BACKGROUND: The background MUST be 100% PURE SOLID MAGENTA (#FF00FF). The magenta MUST touch all absolute edges of the image. DO NOT draw a corkboard, DO NOT draw a desk, DO NOT draw a frame or border around the magenta. The ONLY thing in the image should be the vintage item resting directly on the magenta background.
            2. PRESERVE IMAGE: DO NOT remove, crop, or alter the background of the provided image itself. The original image must remain completely intact inside its new frame.
            3. FASTENER: Add a piece of wrinkled masking tape to the top edge of the item.
            
            Style instructions: Frame the exact provided image inside a vintage, scratched polaroid photo border. Worn white borders, retro colors.`
                    }
                ]
            }
        });
        console.log(`[SUCCESS] ${m} responded ok.`);
    } catch (e: any) {
        console.error(`[ERROR] ${m}: ${e.message}`);
    }
}

testModels();
