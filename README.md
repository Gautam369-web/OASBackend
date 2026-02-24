# AI Solver Backend (Vercel)

This is a standalone backend for the LPU OAS AI Solver extension. It uses the Groq API to solve multiple-choice questions.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Environment Variables**:
    Create a `.env` file or set in Vercel:
    - `GROQ_API_KEY`: Your Groq API key.

## Deployment

Deploy directly to [Vercel](https://vercel.com):
```bash
vercel
```

## API Endpoint
`POST /api/solve`

**Request Body**:
```json
{
  "question": "Your question here",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
}
```

**Response**:
`3` (or the correct index)
