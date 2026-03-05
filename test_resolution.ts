import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModels() {
    const m = 'gemini-3.1-flash-image-preview';

    try {
        console.log(`Testing ${m} with aspectRatio 16:9 and outputOptions 4K/higher resolution...`);
        const response = await ai.models.generateContent({
            model: m,
            contents: "Draw a very simple yellow sticky note with the text 'HELLO WORLD' clearly written on it.",
            config: {
                outputOptions: {
                    mimeType: "image/png"
                },
                imageConfig: {
                    aspectRatio: "16:9"
                }
            } as any
        });
        console.log(`[SUCCESS] ${m} responded ok. Text generation check.`);
        const parts = response.candidates[0].content.parts;
        parts.forEach((p, idx) => {
            if (p.inlineData) {
                console.log(`Got image of type: ${p.inlineData.mimeType}`);
            }
        })
    } catch (e: any) {
        console.error(`[ERROR] ${m}: ${e.message}`);
    }
}

testModels();
