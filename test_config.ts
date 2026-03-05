import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModels() {
    const m = 'gemini-3.1-flash-image-preview';

    try {
        console.log(`Testing ${m} with aspectRatio 16:9...`);
        const response = await ai.models.generateContent({
            model: m,
            contents: "Draw a simple red square.",
            config: {
                imageConfig: {
                    aspectRatio: "16:9"
                }
            } as any
        });
        console.log(`[SUCCESS] ${m} responded ok.`);
    } catch (e: any) {
        console.error(`[ERROR] ${m}: ${e.message}`);
    }
}

testModels();
