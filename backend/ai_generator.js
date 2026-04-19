import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

// Для работы ИИ нужен GEMINI_API_KEY в файле .env
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
}

export async function generateProblem(elo) {
    // Если нет ключа, отдаем захардкоженную задачу-заглушку (Fallback)
    if (!genAI) {
        console.warn("GEMINI_API_KEY is not set. Returning fallback problem.");
        return {
            title: "Two Sum",
            statement: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.",
            inputFormat: "nums = [2,7,11,15], target = 9",
            outputFormat: "[0,1]",
            testCases: [
                { input: "[2,7,11,15]\n9", output: "[0,1]" }
            ]
        };
    }

    try {
        const prompt = `
Generate a competitive programming problem suitable for a player with Elo rating ${elo}.
The problem MUST be solvable in Python and JavaScript reading from standard input.
The output MUST be exactly a raw JSON object with the following schema:
{
  "title": "Problem Title",
  "statement": "Detailed problem description",
  "inputFormat": "Explanation of inputs. IMPORTANT: Input must be raw values separated by spaces or newlines, easily read via stdin.",
  "outputFormat": "Explanation of outputs. IMPORTANT: Output must be a single value or space-separated values, printed to stdout.",
  "testCases": [{"input": "raw string for stdin", "output": "exact expected stdout"}] // Generate exactly 5 test cases. No extra text, just raw data.
}
Return ONLY valid JSON. No markdown backticks, no comments.
`;

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const responseResult = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        let jsonText = responseResult.response.text();
        const problem = JSON.parse(jsonText);
        return problem;

    } catch (error) {
        console.error("AI Generation Error:", error);
        throw error;
    }
}
