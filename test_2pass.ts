import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test2Pass() {
    const m = 'gemini-3.1-flash-image-preview';
    try {
        console.log(`[Pass 1] Generating base image...`);
        const resp1 = await ai.models.generateContent({
            model: m,
            contents: "Draw a simple corkboard with one yellow sticky note that says 'HELLO'."
        });

        let imgData1 = '';
        const parts1 = resp1.candidates[0].content.parts;
        parts1.forEach(p => { if (p.inlineData) imgData1 = p.inlineData.data; });

        if (!imgData1) {
            console.log("No image from pass 1");
            return;
        }
        fs.writeFileSync('pass1.jpg', Buffer.from(imgData1, 'base64'));
        console.log(`[Pass 1] Done. Saved pass1.jpg`);

        console.log(`[Pass 2] Remastering / Upscaling...`);
        const resp2 = await ai.models.generateContent({
            model: m,
            contents: {
                parts: [
                    { inlineData: { data: imgData1, mimeType: "image/jpeg" } },
                    { text: "Take this exact image and remaster it into ultra sharp, highly detailed, photorealistic 8k quality. Strictly preserve the exact layout and text." }
                ]
            }
        });

        let imgData2 = '';
        const parts2 = resp2.candidates[0].content.parts;
        parts2.forEach(p => { if (p.inlineData) imgData2 = p.inlineData.data; });

        if (imgData2) {
            fs.writeFileSync('pass2.jpg', Buffer.from(imgData2, 'base64'));
            console.log(`[Pass 2] Done. Saved pass2.jpg`);
        }

    } catch (e: any) {
        console.error(`[ERROR]: ${e.message}`);
    }
}

test2Pass();
