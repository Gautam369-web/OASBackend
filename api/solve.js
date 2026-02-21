const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, options } = req.body;

        if (!question || !options) {
            return res.status(400).json({ error: 'Missing question or options' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
        }
        const formattedOptions = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");

        const prompt = `Solve this multiple choice question and return ONLY the option number (1, 2, 3, or 4). Do not provide any explanation or text.
Question: ${question}
Options:
${formattedOptions}
Answer Number:`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
                temperature: 0.1
            })
        });

        const data = await response.json();

        if (data.choices && data.choices.length > 0) {
            const answer = data.choices[0].message.content.trim();
            // Return plain text answer number
            res.status(200).send(answer);
        } else {
            console.error('Groq Error:', data);
            res.status(500).json({ error: 'Failed to solve' });
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
