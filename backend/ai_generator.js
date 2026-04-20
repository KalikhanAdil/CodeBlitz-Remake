import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

// Для работы ИИ нужен GEMINI_API_KEY в файле .env
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
}

const FALLBACK_PROBLEMS = [
    {
        title: "Two Sum",
        statement: "Given an array of integers and a target, return indices of the two numbers such that they add up to target.",
        inputFormat: "First line contains array elements separated by spaces. Second line contains the target integer.",
        outputFormat: "Two space-separated indices.",
        testCases: [{ input: "2 7 11 15\n9", output: "0 1" }]
    },
    {
        title: "Sum of Array",
        statement: "Given an array of integers, output the sum of all elements.",
        inputFormat: "A single line containing space-separated integers.",
        outputFormat: "A single integer representing the sum.",
        testCases: [{ input: "1 2 3 4 5", output: "15" }]
    },
    {
        title: "Maximum Element",
        statement: "Find the maximum element in a given list of numbers.",
        inputFormat: "A single line containing space-separated integers.",
        outputFormat: "A single integer representing the maximum value.",
        testCases: [{ input: "10 5 20 8", output: "20" }]
    },
    {
        title: "Reverse String",
        statement: "Given a string, output the reversed version of it.",
        inputFormat: "A single line containing a string.",
        outputFormat: "A single line containing the reversed string.",
        testCases: [{ input: "hello", output: "olleh" }]
    },
    {
        title: "Factorial",
        statement: "Calculate the factorial of a given non-negative integer n.",
        inputFormat: "A single integer n.",
        outputFormat: "A single integer representing n!",
        testCases: [{ input: "5", output: "120" }]
    }
];

function getRandomFallback() {
    const randomIndex = Math.floor(Math.random() * FALLBACK_PROBLEMS.length);
    return FALLBACK_PROBLEMS[randomIndex];
}

export async function generateProblem(elo, retries = 2) {
    if (!genAI) {
        console.warn("GEMINI_API_KEY is not set. Returning random fallback problem.");
        return getRandomFallback();
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
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        let jsonText = responseResult.response.text();
        
        // Gemini часто оборачивает JSON в маркдаун-блок, даже если просишь не делать этого.
        // Убираем ```json и ``` по краям строки, чтобы JSON.parse не падал с SyntaxError.
        jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        
        return JSON.parse(jsonText);

    } catch (error) {
        console.error(`AI Generation Error. Retries left: ${retries}`, error.message);
        
        if (retries > 0) {
            // Ждем секунду и пробуем снова
            await new Promise(res => setTimeout(res, 1000));
            return generateProblem(elo, retries - 1);
        }

        console.warn("Returning random fallback problem due to complete AI failure.");
        return getRandomFallback();
    }
}
