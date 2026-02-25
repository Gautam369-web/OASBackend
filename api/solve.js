const fetch = require('node-fetch');
const crypto = require('crypto');

// 10-minute Cache for License Verification
// Note: This persists while the Vercel lambda instance is warm.
const verificationCache = {};
const CACHE_DURATION = 10 * 60 * 1000; // 10 Minutes in ms

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

    const SECRET_SALT = "parrot-oas-secret-2026";

    try {
        const { question, options, licenseKey, deviceId } = req.body;

        if (!question || !options) {
            return res.status(400).json({ error: 'Missing question or options' });
        }

        let isValidLicense = false;

        // 1. Check for Admin Override
        if (licenseKey === "admin-123") {
            isValidLicense = true;
        }
        // 2. Perform Algorithmic Check (Dynamic Prefix)
        else if (licenseKey) {
            const parts = licenseKey.split("-");
            if (parts.length === 3 && parts[2].length === 4) {
                const payload = `${parts[0]}-${parts[1]}`;
                const providedChecksum = parts[2];

                const hmac = crypto.createHmac('sha256', SECRET_SALT);
                hmac.update(payload);
                const calculatedChecksum = hmac.digest('hex').substring(0, 4).toUpperCase();

                if (providedChecksum === calculatedChecksum) {
                    // Check Cache First (Bound to license + device)
                    const now = Date.now();
                    const cacheKey = `${licenseKey}:${deviceId || 'nodev'}`;
                    const cached = verificationCache[cacheKey];

                    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
                        console.log(`Using cached verification for: ${cacheKey}`);
                        isValidLicense = true;
                    } else {
                        // 3. Live Check against Veda Platform
                        try {
                            const verifyRes = await fetch(`https://vedax.vercel.app/api/verify?hwid=${licenseKey}&deviceId=${deviceId || ''}`);
                            const verifyData = await verifyRes.json();

                            if (verifyData.status === 'approved') {
                                isValidLicense = true;
                                // Update Cache
                                verificationCache[cacheKey] = {
                                    status: 'approved',
                                    timestamp: now
                                };
                            } else {
                                // If status changed to blocked/pending, remove from cache immediately
                                delete verificationCache[cacheKey];
                                return res.status(403).json({
                                    error: `Access Denied: ${verifyData.status === 'blocked' ? 'Key in use on another device' : 'Your license is pending'}.`
                                });
                            }
                        } catch (vErr) {
                            console.error("Veda Verification Error:", vErr);
                            return res.status(500).json({ error: 'Verification Server Down. Try again later.' });
                        }
                    }
                }
            }
        }

        if (!isValidLicense) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or Missing License Key' });
        }

        // Use the verified key for immediate functionality on Vercel
        const apiKey = "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";

        if (!apiKey) {
            return res.status(500).json({ error: 'OPENROUTER_API_KEY missing [v1.0.2]' });
        }

        const formattedOptions = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
        const promptText = `Solve this multiple choice question and return ONLY the option number (1, 2, 3, or 4). Do not provide any explanation or text.
Question: ${question}
Options:
${formattedOptions}
Answer Number:`;

        const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

        const response = await fetch(openRouterUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://vedax.vercel.app", // Required by OpenRouter
                "X-Title": "OAS Solver Proxy",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001", // High accuracy, low latency
                messages: [{ role: "user", content: promptText }],
                temperature: 0.1,
                max_tokens: 10
            })
        });

        const data = await response.json();

        // 1. Check for API-level errors
        if (data.error) {
            console.error('OpenRouter API Error:', data.error);
            return res.status(500).json({ error: `VERIFY-DEPLOYMENT: OpenRouter Error: ${data.error.message || 'Unknown API Error'}` });
        }

        // 2. Extract Answer
        if (data.choices && data.choices.length > 0) {
            const answer = data.choices[0].message.content.trim();
            res.status(200).send(answer);
        } else {
            console.error('OpenRouter Unexpected Response:', JSON.stringify(data, null, 2));
            res.status(500).json({ error: 'OpenRouter returned no response. Check your credits or model status.' });
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
