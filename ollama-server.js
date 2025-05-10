// Import Cerebras SDK
const { Cerebras } = require('@cerebras/cerebras_cloud_sdk');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

// Initialize Cerebras client with direct API key
const client = new Cerebras({
  apiKey: 'csk-ffxtrfecp63c38t9j8422mc48x2r8mc8dpf2rfekrpep4xek'
});

// Initialize express application
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 60000; // 60 second timeout

// Test the Cerebras API on startup
async function testCerebrasAPI() {
  try {
    console.log("Testing Cerebras API connection...");
    const completionCreateResponse = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Why is fast inference important?' }],
      model: 'llama-4-scout-17b-16e-instruct',
    });

    console.log("✅ Cerebras API test successful!");
    return true;
  } catch (error) {
    console.error("❌ Cerebras API test failed:", error.message);
    return false;
  }
}

// Configure security middleware
app.use(helmet()); // Add security headers

// Configure CORS with specific options
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request size limits
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.path}`);
  
  // Log response when finished
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] [${requestId}] Response: ${res.statusCode}`);
  });
  
  next();
});

// Input validation middleware
const validateApiRequest = (req, res, next) => {
  const { action, message, context, material, exam, materials } = req.body;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action'
    });
  }

  // HIER "generateFlashcards" HINZUFÜGEN
  const validActions = ['chatMessage', 'summarize', 'generateQuiz', 'generateStudyPlan', 'getStudyTips', 'generateFlashcards'];
  if (!validActions.includes(action)) {
    return res.status(400).json({
      success: false,
      error: `Invalid action. Must be one of: ${validActions.join(', ')}`
    });
  }

  // Action-specific validations
  if (action === 'chatMessage' && !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: message'
    });
  }

  // HIER AUCH FÜR 'generateFlashcards' PRÜFEN
  if ((action === 'summarize' || action === 'generateQuiz' || action === 'generateFlashcards') &&
      (!material || !material.content)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: material with content for the specified action'
    });
  }

  if (action === 'generateStudyPlan' && (!exam || !materials || !Array.isArray(materials))) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters for study plan: exam and materials array'
    });
  }

  if (action === 'getStudyTips' && !exam) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: exam'
    });
  }

  next();
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] [${req.requestId}] Error:`, err);
  
  res.status(err.status || 500).json({
    success: false,
    error: 'Server error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Call Cerebras API with retry mechanism
async function callCerebrasAPIWithRetry(prompt, action, retries = 0) {
  const requestId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] [${requestId}] 🤖 Using Cerebras API for ${action}`);
    
    // Use the client instance directly
    const response = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-4-scout-17b-16e-instruct',
      max_tokens: 8000,
    });
    
    if (!response.choices || !response.choices[0]?.message?.content) {
      console.warn(`[${new Date().toISOString()}] [${requestId}] ⚠️ Invalid or empty response from Cerebras API`);
      return { response: "Sorry, I couldn't generate a response." };
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Received valid response from Cerebras API`);
    return { response: response.choices[0].message.content };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error calling Cerebras API (attempt ${retries + 1}/${MAX_RETRIES + 1}):`, error.message);
    
    if (retries < MAX_RETRIES) {
      const delay = (retries + 1) * 2000;
      console.log(`[${new Date().toISOString()}] [${requestId}] 🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callCerebrasAPIWithRetry(prompt, action, retries + 1);
    }
    
    throw error;
  }
}

// Process AI prompt with Cerebras API
async function processPrompt(prompt, action, retries = 0) {
  const requestId = uuidv4();
  console.log(`[${new Date().toISOString()}] [${requestId}] 📝 Processing prompt for action: ${action}, API: Cerebras`);
  
  try {
    return await callCerebrasAPIWithRetry(prompt, action, retries);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error in processPrompt:`, error.message);
    throw new Error(`Failed to process prompt: ${error.message}`);
  }
}

// Middleware für Request ID
app.use((req, res, next) => {
  req.requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  next();
});

// Add compatibility endpoint for /api/ollama that forwards to /api/ai
// Replace the problematic compatibility endpoint with a working version
// Add compatibility endpoint for /api/ollama that forwards to /api/ai
app.post('/api/ai', validateApiRequest, async (req, res) => {
  // Der Konsolen-Log hier ist etwas irreführend, da dies der primäre /api/ai Endpunkt ist,
  // nicht der /api/ollama Kompatibilitätsendpunkt.
  // Ich lasse ihn aber bestehen, falls du ihn aus einem bestimmten Grund so wolltest.
  // Besser wäre: console.log(`[${new Date().toISOString()}] [${req.requestId}] 🚀 Handling request for /api/ai`);
  console.log(`[${new Date().toISOString()}] [${req.requestId}] ⚠️ Deprecated endpoint used: /api/ollama - handling with same logic as /api/ai`);

  try {
    const { action, message, context, material, exam, materials } = req.body;

    console.log(`[${new Date().toISOString()}] [${req.requestId}] 📥 Received ${action} request via /api/ai`); // Angepasst von /api/ollama

    let prompt = "";

    // Create different prompts based on the action
    switch (action) {
      case 'chatMessage':
        prompt = `Du bist ein KI-Lernassistent namens "LucaAcul", der Studenten beim Lernen hilft. Antworte auf Deutsch.
                Deine Antworten sollten hilfreich, präzise und ermunternd sein.`;

        if (context?.upcomingExams?.length > 0) {
          prompt += `\nDer Student hat folgende anstehende Prüfungen: ${context.upcomingExams.map(e =>
            `${e.name} (${e.subject}) in ${e.daysLeft} Tagen`).join(', ')}.`;

          if (context.upcomingExams[0].daysLeft <= 3) {
            prompt += `\nDie nächste Prüfung ist sehr bald! Deine Antworten sollten kurz, konkret und unmittelbar hilfreich sein.`;
          }
        }

        if (material?.content) {
          const limitedContent = material.content.substring(0, 12000);
          prompt += `\nDer Student lernt gerade: "${material.name}"\n\nEin Ausschnitt aus dem Inhalt: "${limitedContent}..."`;
          prompt += `\nBeziehe dich in deiner Antwort spezifisch auf dieses Material, wenn es für die Frage relevant ist.`;
        }

        prompt += `\n\nFrage des Studenten: ${message}\n\nDeine hilfreiche Antwort:`;
        break;

      case 'summarize':
        prompt = `Bitte erstelle eine SEHR AUSFÜHRLICHE und detaillierte strukturierte Zusammenfassung des folgenden Textes.
      Die Zusammenfassung MUSS MINDESTENS 1000 WÖRTER enthalten und sollte folgende Elemente enthalten:

      1. Eine umfassende Einleitung (6-8 Sätze)
      2. Die Hauptthemen und wichtigsten Konzepte in detaillierter Form mit vielen Beispielen
      3. Eine tiefgehende Gliederung ALLER relevanten Punkte mit Beispielen und Erläuterungen
      4. Schlüsselbegriffe mit ausführlichen Definitionen und Erklärungen (mindestens 10 Begriffe)
      5. Zusammenhänge zwischen den verschiedenen Konzepten mit konkreten Beispielen
      6. Eine kritische Einschätzung und Analyse der wichtigsten Inhalte
      7. Praktische Anwendungsbeispiele des Gelernten
      8. Eine umfassende Zusammenfassung am Ende

      Formatiere deine Antwort mit Überschriften (## für Hauptüberschriften, ### für Unterüberschriften) und Aufzählungspunkten (* für Listen).
      Nutze auch **Hervorhebungen** für wichtige Begriffe und *Kursivschrift* für Definitionen.
      Antworte auf Deutsch und sorge für eine übersichtliche, lernfreundliche und SEHR UMFANGREICHE Formatierung.
      DENKE DARAN: Die Zusammenfassung MUSS sehr ausführlich sein und mindestens 1000 Wörter umfassen und auch mindestens 5-6 Sätze pro unterkapitel enthalten.
      Hier ist der Text, den du zusammenfassen sollst:\n\n"${material.name}"\n\n${material.content.substring(0, 20000)}...`;
        break;

      case 'generateQuiz':
        prompt = `Als ein erfahrener Prüfungsersteller, erstelle ein Multiple-Choice-Quiz mit EXAKT 20 Fragen basierend auf diesem Text.

    WICHTIG - Du musst deine Antwort als ein JSON-Objekt im EXAKT folgenden Format formatieren:

    {
      "questions": [
        {
          "question": "Fragetext hier",
          "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
          "correctAnswerIndex": 0
        },
        ... weitere 19 Fragen
      ]
    }

    Die Fragen sollten verschiedene Schwierigkeitsgrade haben und unterschiedliche kognitive Fähigkeiten testen (Wissen, Verständnis, Anwendung, Analyse).
    Stelle sicher, dass die falschen Antworten plausibel sind.
    Keine zusätzlichen Erklärungen oder Text. Nur JSON.
    Der Index der richtigen Antwort (correctAnswerIndex) muss eine Zahl zwischen 0 und 3 sein.
    Erstelle Fragen, die das gesamte Themenspektrum des Textes abdecken.

    Hier ist der Text für das Quiz: "${material.name}"\n\n${material.content.substring(0, 20000)}..."`;
        break;

      // NEUER CASE FÜR LERNKARTEN
      c// NEUER CASE FÜR LERNKARTEN
      case 'generateFlashcards':
        prompt = `Erstelle Lernkarten (Frage und Antwort) basierend auf dem folgenden Text.
Gib die Lernkarten als JSON-Array zurück, wobei jedes Objekt eine "question" und eine "answer" Eigenschaft hat.
Stelle sicher, dass die Ausgabe valides JSON ist, das direkt geparst werden kann. Beginne mit [ und ende mit ].
Beispiel: [{"question": "Was ist die Hauptstadt von Deutschland?", "answer": "Berlin"}, {"question": "...", "answer": "..."}]
Maximal 15 Lernkarten.
WICHTIG: Vermeide Fragen, die sich auf die genaue visuelle Darstellung von Tabellen, Diagrammen oder spezifischen Seitenlayouts beziehen, wenn diese Informationen nicht explizit im Text beschrieben sind. Formuliere Fragen, die auf dem reinen Textverständnis basieren und ohne das Originaldokument vor Augen zu haben beantwortet werden können.

Text:
${material.content.substring(0, 12000)} 

JSON-Array mit Lernkarten:`; // Stelle sicher, dass der Text nicht zu lang ist für den Prompt
        break;

      case 'generateStudyPlan':
        prompt = `Erstelle einen detaillierten Lernplan für die Prüfung "${exam.name}" (${exam.subject}), die in ${exam.daysLeft} Tagen stattfindet.

Der Plan sollte:
1. Die verbleibende Zeit optimal nutzen
2. Tägliche Ziele festlegen
3. Verschiedene Lernmethoden (Lesen, Zusammenfassen, Übungsfragen etc.) empfehlen
4. Konkrete Zeiteinteilungen vorschlagen

Die verfügbaren Materialien sind: ${materials.map(m => `"${m.name}"`).join(', ')}.
${materials.filter(m => m.completed).length > 0 ? `Davon wurden bereits bearbeitet: ${materials.filter(m => m.completed).map(m => `"${m.name}"`).join(', ')}.` : ''}

Formatiere den Plan mit HTML-Tags (<div>, <h3>, <ul>, <li>, <span>) für eine ansprechende Darstellung.
Verwende <span class="highlight"> für wichtige Textstellen und <span class="emphasis"> für Betonungen.`;
        break;

      case 'getStudyTips':
        let tipContext = `Fach: ${exam.subject}, Prüfung: ${exam.name}, Tage bis zur Prüfung: ${exam.daysLeft}`;

        prompt = `Gib mir 5 spezifische Lerntipps für meine ${exam.subject}-Prüfung (${exam.name}) in ${exam.daysLeft} Tagen.

Die Tipps sollten:
1. Auf das Fach ${exam.subject} zugeschnitten sein
2. Die verbleibende Zeit berücksichtigen (${exam.daysLeft} Tage)
3. Wissenschaftlich fundierte Lernmethoden beinhalten
4. Konkret und umsetzbar sein

${exam.daysLeft <= 3 ? "Da die Prüfung sehr bald stattfindet, fokussiere dich auf Last-Minute-Tipps und Vorbereitungsstrategien." : ""}
${exam.daysLeft >= 14 ? "Da noch ausreichend Zeit ist, schlage einen strukturierten Lernplan mit Wiederholungseinheiten vor." : ""}

Formatiere deine Antwort mit HTML-Tags für eine bessere Darstellung. Verwende <h3> für Überschriften, <ul> und <li> für Listen, und <span class="highlight"> für wichtige Punkte.`;
        break;

      default:
        // Dieser Fall sollte durch validateApiRequest abgedeckt sein, aber als Sicherheit:
        console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Unbekannte Aktion im Prompt-Switch: ${action}`);
        return res.status(400).json({ success: false, error: 'Unbekannte Aktion' });
    }

    console.log(`[${new Date().toISOString()}] [${req.requestId}] 📤 Sending ${action} request to AI API...`); // Angepasst von "via compatibility endpoint"

    // Call API with prompt - use the same mechanism as your /api/ai endpoint
    const aiResponseData = await processPrompt(prompt, action);

    const aiResponse = aiResponseData.response;
    console.log(`[${new Date().toISOString()}] [${req.requestId}] ✅ Got response from AI API for ${action} (${aiResponse.length} chars)`);

    // Return the same response structure as your /api/ai endpoint
    switch (action) {
      case 'chatMessage':
        return res.json({ success: true, reply: aiResponse });

      case 'summarize':
        return res.json({ success: true, summary: aiResponse });

      case 'generateQuiz':
        try {
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 🔍 Attempting to parse quiz response for action: ${action}`);

          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

          if (!jsonMatch) {
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ❌ No JSON object pattern found in the response for quiz`);
            throw new Error("No JSON object found in response for quiz");
          }

          const jsonString = jsonMatch[0];
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 📋 Extracted JSON pattern for quiz:`, jsonString.substring(0, 100) + "...");

          let quizData;
          try {
            quizData = JSON.parse(jsonString);
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ✅ Successfully parsed JSON for quiz`);
          } catch (jsonError) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ JSON parse error for quiz:`, jsonError.message);
            console.error(`[${new Date().toISOString()}] [${req.requestId}] 📄 Raw AI response for quiz:`, aiResponse);
            throw new Error("Invalid JSON format for quiz");
          }

          if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Invalid quiz structure:`, quizData);
            throw new Error("Invalid quiz structure");
          }

          quizData.questions = quizData.questions.map(q => {
            if (!q.options || !Array.isArray(q.options)) {
              q.options = ["Option A", "Option B", "Option C", "Option D"];
            } else if (q.options.length < 4) {
              while (q.options.length < 4) {
                q.options.push(`Option ${q.options.length + 1}`);
              }
            } else if (q.options.length > 4) {
              q.options = q.options.slice(0, 4);
            }

            if (typeof q.correctAnswerIndex !== 'number' ||
              q.correctAnswerIndex < 0 ||
              q.correctAnswerIndex > 3) {
              q.correctAnswerIndex = Math.floor(Math.random() * 4);
            }
            return q;
          });

          const TARGET_QUESTIONS = 20;
          if (quizData.questions.length < TARGET_QUESTIONS) {
            const neededQuestions = TARGET_QUESTIONS - quizData.questions.length;
            for (let i = 0; i < neededQuestions; i++) {
              quizData.questions.push({
                question: `Zusatzfrage ${quizData.questions.length + 1} zu "${material.name}"`,
                options: ["Option A", "Option B", "Option C", "Option D"],
                correctAnswerIndex: Math.floor(Math.random() * 4)
              });
            }
          } else if (quizData.questions.length > TARGET_QUESTIONS) {
            quizData.questions = quizData.questions.slice(0, TARGET_QUESTIONS);
          }
          return res.json({ success: true, quiz: quizData });

        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Error processing quiz JSON for action ${action}:`, error.message);
          const fallbackQuiz = {
            questions: Array(20).fill(0).map((_, i) => ({
              question: `Frage ${i + 1} zu "${material.name}" (Fallback)`,
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswerIndex: Math.floor(Math.random() * 4)
            }))
          };
          return res.json({ success: true, quiz: fallbackQuiz, error: `Failed to process quiz: ${error.message}` });
        }

      // NEUER CASE FÜR LERNKARTEN ANTWORTVERARBEITUNG
      case 'generateFlashcards':
        try {
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 🔍 Attempting to parse flashcards response for action: ${action}`);
          // Lernkarten sollten ein JSON-Array sein
          const jsonMatch = aiResponse.match(/\[[\s\S]*\]/); // Sucht nach einem Array [...]

          if (!jsonMatch) {
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ❌ No JSON array pattern found in the response for flashcards`);
            throw new Error("No JSON array found in response for flashcards");
          }
          const jsonString = jsonMatch[0];
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 📋 Extracted JSON pattern for flashcards:`, jsonString.substring(0, 100) + "...");

          let flashcardsData;
          try {
            flashcardsData = JSON.parse(jsonString);
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ✅ Successfully parsed JSON for flashcards`);
          } catch (jsonError) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ JSON parse error for flashcards:`, jsonError.message);
            console.error(`[${new Date().toISOString()}] [${req.requestId}] 📄 Raw AI response for flashcards:`, aiResponse);
            throw new Error("Invalid JSON format for flashcards");
          }

          if (!Array.isArray(flashcardsData) || flashcardsData.some(card => typeof card.question === 'undefined' || typeof card.answer === 'undefined')) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Invalid flashcards structure:`, flashcardsData);
            throw new Error("Invalid flashcards structure: Expected array of {question, answer} objects.");
          }
          // Optional: Anzahl begrenzen, falls die KI mehr als gewünscht liefert
          flashcardsData = flashcardsData.slice(0, 15);

          return res.json({ success: true, flashcards: flashcardsData });
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Error processing flashcards JSON for action ${action}:`, error.message);
          // Fallback: leeres Array oder spezifischere Fehlermeldung
          return res.status(500).json({ success: false, error: 'Failed to process flashcards from AI response', details: error.message });
        }

      case 'generateStudyPlan':
        return res.json({ success: true, studyPlan: aiResponse });

      case 'getStudyTips':
        return res.json({ success: true, studyTips: aiResponse });

      default:
        // Sollte nicht erreicht werden, wenn validateApiRequest korrekt funktioniert
        console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Unbekannte Aktion im Response-Switch: ${action}`);
        return res.json({ success: true, data: aiResponse }); // Oder Fehler senden
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Error in /api/ai endpoint:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der AI-Anfrage',
      message: error.message // Im Entwicklungsmodus ist die detaillierte Nachricht hilfreich
    });
  }
});



// Enhanced health check endpoint
app.get('/health', (req, res) => {
  // Calculate uptimeF
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AI Learning Assistant API',
    uptime: uptimeString,
    memory: {
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`
=======================================================
  🚀 AI Learning Assistant Server
  🔗 Running on port ${PORT}
  🌐 API endpoints:
     - http://localhost:${PORT}/api/ai (primary)
     - http://localhost:${PORT}/api/ollama (compatibility)
  ℹ️ Health check: http://localhost:${PORT}/health
  📅 Started at: ${new Date().toISOString()}
=======================================================
  `);
  
  // Test the API connection on startup
  await testCerebrasAPI();
});

// Export app for testing
module.exports = app;