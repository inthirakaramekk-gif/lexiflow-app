import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { word, pos } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured" }, { status: 400 });
    }

    const prompt = `Generate 5 example sentences for the English word or phrase "${word}" (which is a ${pos}).
Each sentence MUST strictly follow one of the 5 English sentence structures:
1. S + V (Subject + Verb)
2. S + V + O (Subject + Verb + Object)
3. S + V + C (Subject + Verb + Complement)
4. S + V + IO + DO (Subject + Verb + Indirect Object + Direct Object)
5. S + V + O + C (Subject + Verb + Object + Complement)

Return the result as a raw JSON object with the following schema:
{
  "wordTranslation": "Thai translation of the vocabulary word itself (e.g. 'ละทิ้ง' for 'abandon')",
  "sentences": [
    {
      "structure": "S + V",
      "sentence": "Example sentence using the word",
      "translation": "Thai translation of the sentence",
      "grammar": "Detailed breakdown matching the specific English words in the sentence to their grammatical parts with Thai translations, formatted exactly like: 'S (SubjectWord: คำแปล) + V (VerbWord: คำแปล) + ...' (e.g. 'S (He: เขา) + V (runs: วิ่ง) + O (the race: การแข่งขัน)')"
    }
  ],
  "trick": "A small clever memory trick or mnemonic in Thai to easily remember this word"
}

Ensure the sentences use the word "${word}" naturally in its correct form (conjugate verbs or pluralize nouns if needed to fit the sentence structure). Return ONLY valid JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Gemini API error: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    const textContent = data.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(textContent);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate content" }, { status: 500 });
  }
}
