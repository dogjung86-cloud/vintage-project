import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testResolution(configObj: any, label: string) {
    const m = 'gemini-3.1-flash-image-preview';

    try {
        console.log(`Testing [${label}] ...`);
        const response = await ai.models.generateContent({
            model: m,
            contents: "Draw a very simple yellow sticky note.",
            config: configObj as any
        });
        const parts = response.candidates[0].content.parts;
        parts.forEach((p, idx) => {
            if (p.inlineData) {
                const buffer = Buffer.from(p.inlineData.data, 'base64');
                // Simple crude check for image dims (assuming jpeg or png)
                console.log(`[SUCCESS] ${label}: Got size ${buffer.length} bytes for type ${p.inlineData.mimeType}`);
                fs.writeFileSync(`test_out_${label}.jpg`, buffer);
            }
        })
    } catch (e: any) {
        console.error(`[ERROR] ${label}: ${e.message}`);
    }
}

async function runAll() {
    await testResolution({ imageConfig: { aspectRatio: "16:9" } }, "16_9_default");
    await testResolution({ imageConfig: { aspectRatio: "16:9", imageSize: "4500x2500" } }, "16_9_custom_size_str");
    await testResolution({ imageConfig: { aspectRatio: "16:9", width: 3840, height: 2160 } }, "16_9_width_height");
}

runAll();
