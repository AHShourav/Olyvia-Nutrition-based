# Olyvia

Olyvia is a mobile-first React web app for AI-assisted, condition-aware nutrition tracking. It helps users log food through barcode scanning, text or voice entry, and camera input, then evaluates nutrition data against personal health goals and dietary rules.

## Why It Exists

Most nutrition apps show generic calories and macros. Olyvia focuses on food suitability for people who want more personalized feedback, such as users watching sodium, sugar, saturated fat, or processed foods because of goals or health conditions.

## Features

- Email signup, login, JWT authentication, and profile onboarding
- Mobile-first React interface for fast food logging
- Barcode scanning for packaged foods
- Text and voice-assisted food entry
- Camera-based image input with food label detection support
- USDA FoodData Central and Open Food Facts integrations
- Food history, daily nutrition summaries, and stats dashboard
- Condition-aware rules engine for `Good`, `Caution`, and `Avoid` verdicts
- Profile-based settings for goals, health conditions, diet preferences, and tracked nutrients

## Tech Stack

- Frontend: React, Vite, CSS, lucide-react, html5-qrcode
- Backend: Django, Django REST Framework, Simple JWT
- Database: SQLite for local development, PostgreSQL-ready for deployment
- APIs: Open Food Facts, USDA FoodData Central, Google Cloud Vision support, OpenAI/Groq support
- Deployment config: Render blueprint

## AI-Assisted Design

Olyvia uses AI-assisted workflows for food recognition and interpretation, while keeping health-related verdicts grounded in deterministic rules.

- Voice/text input can be parsed into food search queries.
- Camera input can be processed through image-label detection.
- The rules engine evaluates nutrients such as sodium, sugar, saturated fat, and processed-food indicators against the user's profile.
- AI-style explanations can support readability, but the rule engine remains the source of truth for food verdicts.

This project is a support tool and is not a replacement for medical advice.

## Project Status

Implemented:

- Authentication and onboarding
- Barcode, text, voice-assisted, and camera food input flows
- External nutrition data lookup
- Food logging and nutrition history
- Daily summaries and stats
- Condition-aware rules engine

Planned or partial:

- Full AI Insights page
- Allergy ingredient detection
- Stronger diet-preference enforcement
- Custom trained food image model
- Redis/Celery background processing
- More complete test coverage

## Local Setup

Requirements:

- Node.js
- Python 3.12 recommended
- Internet access for external nutrition and AI services

From the project root:

```powershell
npm.cmd run install:all
npm.cmd run setup
npm.cmd run dev
```

Open the frontend URL printed by Vite, usually:

```text
http://localhost:5173
```

The Django backend runs at:

```text
http://127.0.0.1:8000
```

If PowerShell blocks `npm`, use `npm.cmd` as shown above.

## Environment Variables

Copy the example file:

```powershell
Copy-Item backend\.env.example backend\.env
```

Then fill in values as needed:

- `SECRET_KEY`
- `USDA_API_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `DATABASE_URL`
- `CORS_ALLOWED_ORIGINS`

The app can run locally with limited functionality if optional API keys are missing, but voice/image/AI features may fall back or fail gracefully depending on the feature.

## Useful Commands

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run setup
```

Backend check:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py check
```

## Security Notes

Do not commit:

- `.env`
- service account JSON files
- local databases
- virtual environments
- `node_modules`
- build outputs

See `.gitignore` for ignored local files.
