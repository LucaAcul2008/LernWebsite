/**
 * Ollama and Hack Club API Server
 * Provides AI services for student learning assistance
 */

// Import required modules
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

// Initialize express application
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 60000; // 60 second timeout

// API endpoints
const OLLAMA_API = process.env.OLLAMA_API || 'http://localhost:11434/api';
const HACK_CLUB_API = process.env.HACK_CLUB_API || 'https://ai.hackclub.com/chat/completions';

// Configure security middleware
app.use(helmet()); // Add security headers

// Configure CORS with specific options
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request size limits
app.use(express.json({ limit: '10mb' }));

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
  
  const validActions = ['chatMessage', 'summarize', 'generateQuiz', 'generateStudyPlan', 'getStudyTips'];
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
  
  if ((action === 'summarize' || action === 'generateQuiz') && 
      (!material || !material.content)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameter: material with content' 
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

// Call Hack Club API with retry mechanism
async function callHackClubAPIWithRetry(prompt, action, retries = 0) {
  const requestId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] [${requestId}] 🤖 Using Hack Club API for ${action}`);
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Format the messages based on prompt complexity
    let messages = [];
    
    if (action === 'chatMessage') {
      // For chat, we keep the system message and user message separate
      messages = [
        { role: "system", content: "You are a helpful AI learning assistant named StudyBuddy." },
        { role: "user", content: prompt }
      ];
    } else {
      // For other actions, we just send the full prompt as a user message
      messages = [{ role: "user", content: prompt }];
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] 📤 Sending request to Hack Club API with ${messages.length} messages`);
    
    const response = await axios.post(HACK_CLUB_API, {
      messages: messages,
      stream: false
    }, { 
      headers,
      timeout: REQUEST_TIMEOUT
    });
    
    // Extract the response from the message content
    const message = response.data.choices[0]?.message;
    
    if (!message || !message.content) {
      console.warn(`[${new Date().toISOString()}] [${requestId}] ⚠️ Invalid or empty response from Hack Club API`);
      return { response: "Sorry, I couldn't generate a response." };
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Received valid response from Hack Club API`);
    return { response: message.content };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error calling Hack Club API (attempt ${retries + 1}/${MAX_RETRIES + 1}):`, error.message);
    
    if (error.response) {
      console.error(`[${new Date().toISOString()}] [${requestId}] Status: ${error.response.status}`);
      console.error(`[${new Date().toISOString()}] [${requestId}] Data:`, error.response.data);
    }
    
    if (retries < MAX_RETRIES) {
      const delay = (retries + 1) * 2000;
      console.log(`[${new Date().toISOString()}] [${requestId}] 🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callHackClubAPIWithRetry(prompt, action, retries + 1);
    }
    
    throw error;
  }
}

// Check available models and get the best one
async function getBestModel() {
  const requestId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] [${requestId}] 🔍 Checking available Ollama models`);
    const response = await axios.get(`${OLLAMA_API}/tags`, { timeout: REQUEST_TIMEOUT });
    const models = response.data.models || [];
    
    // Preferred models in order
    const preferredModels = ['llama4', 'llama3', 'llama2', 'mistral'];
    
    for (const preferred of preferredModels) {
      const match = models.find(m => m.name.toLowerCase().includes(preferred));
      if (match) {
        console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Found preferred model: ${match.name}`);
        return match.name;
      }
    }
    
    // Return first model if no preferred models found
    if (models.length > 0) {
      console.log(`[${new Date().toISOString()}] [${requestId}] ⚠️ No preferred models found, using: ${models[0].name}`);
      return models[0].name;
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] ⚠️ No models found, falling back to llama2`);
    return 'llama2'; // Default fallback
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Failed to fetch models:`, error.message);
    return 'llama2'; // Default fallback
  }
}

// Retry mechanism for Ollama API calls
async function callOllamaWithRetry(payload, retries = 0) {
  const requestId = uuidv4();
  try {
    const model = await getBestModel();
    console.log(`[${new Date().toISOString()}] [${requestId}] 🤖 Using Ollama model: ${model}`);
    
    // Ensure we have safe limits for the API
    const safePayload = {
      ...payload,
      model: model,
      options: {
        ...payload.options,
        num_predict: Math.min(payload.options?.num_predict || 2048, 4096)
      }
    };
    
    const response = await axios.post(`${OLLAMA_API}/generate`, safePayload, { timeout: REQUEST_TIMEOUT });
    
    console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Successfully called Ollama API`);
    return response.data;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error calling Ollama API (attempt ${retries + 1}/${MAX_RETRIES + 1}):`, error.message);
    
    if (retries < MAX_RETRIES) {
      const delay = (retries + 1) * 2000;
      console.log(`[${new Date().toISOString()}] [${requestId}] 🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callOllamaWithRetry(payload, retries + 1);
    }
    
    throw error;
  }
}

// Process AI prompt with either Ollama or Hack Club API
async function processPrompt(prompt, action, retries = 0) {
  const requestId = uuidv4();
  // Set this to true to use Hack Club API, false to use local Ollama
  const useHackClubAPI = true;
  
  console.log(`[${new Date().toISOString()}] [${requestId}] 📝 Processing prompt for action: ${action}, API: ${useHackClubAPI ? 'Hack Club' : 'Ollama'}`);
  
  try {
    if (useHackClubAPI) {
      return await callHackClubAPIWithRetry(prompt, action, retries);
    } else {
      // Adjust temperature based on the action
      const temperature = action === 'generateQuiz' ? 0.2 : 
                        action === 'summarize' ? 0.3 : 0.7;
      
      // Adjust tokens based on the action                
      const numPredict = action === 'summarize' || action === 'generateQuiz' ? 4096 : 2048;
      
      console.log(`[${new Date().toISOString()}] [${requestId}] 📊 Using temperature: ${temperature}, tokens: ${numPredict}`);
      
      const response = await callOllamaWithRetry({
        prompt: prompt,
        stream: false,
        options: {
          num_predict: numPredict,
          temperature: temperature
        }
      }, retries);
      
      return { response: response.response || response.text || response.content || "No response generated." };
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error in processPrompt:`, error.message);
    throw new Error(`Failed to process prompt: ${error.message}`);
  }
}

// Handle requests to our local AI service
app.post('/api/ai', validateApiRequest, async (req, res) => {
  try {
    const { action, message, context, material, exam, materials } = req.body;
    
    console.log(`[${new Date().toISOString()}] [${req.requestId}] 📥 Received ${action} request`);
    
    let prompt = "";
    
    // Create different prompts based on the action
    switch (action) {
      case 'chatMessage':
        prompt = `Du bist ein KI-Lernassistent namens "StudyBuddy", der Studenten beim Lernen hilft. Antworte auf Deutsch. 
                Deine Antworten sollten hilfreich, präzise und ermunternd sein.`;
        
        if (context?.upcomingExams?.length > 0) {
          prompt += `\nDer Student hat folgende anstehende Prüfungen: ${context.upcomingExams.map(e => 
            `${e.name} (${e.subject}) in ${e.daysLeft} Tagen`).join(', ')}.`;
          
          if (context.upcomingExams[0].daysLeft <= 3) {
            prompt += `\nDie nächste Prüfung ist sehr bald! Deine Antworten sollten kurz, konkret und unmittelbar hilfreich sein.`;
          }
        }
        
        if (material?.content) {
          const limitedContent = material.content.substring(0, 3500);
          prompt += `\nDer Student lernt gerade: "${material.name}"\n\nEin Ausschnitt aus dem Inhalt: "${limitedContent}..."`;
          prompt += `\nBeziehe dich in deiner Antwort spezifisch auf dieses Material, wenn es für die Frage relevant ist.`;
        }
        
        prompt += `\n\nFrage des Studenten: ${message}\n\nDeine hilfreiche Antwort:`;
        break;
        
      case 'summarize':
        prompt = `Bitte erstelle eine AUSFÜHRLICHE und detaillierte strukturierte Zusammenfassung des folgenden Textes. 
    Die Zusammenfassung sollte folgende Elemente enthalten:
    
    1. Eine umfassende Einleitung (4-6 Sätze)
    2. Die Hauptthemen und wichtigsten Konzepte in detaillierter Form
    3. Eine tiefgehende Gliederung aller relevanten Punkte mit Beispielen
    4. Schlüsselbegriffe mit ausführlichen Definitionen und Erklärungen
    5. Zusammenhänge zwischen den verschiedenen Konzepten
    6. Eine kritische Einschätzung der wichtigsten Inhalte
    
    Formatiere deine Antwort mit Überschriften (## für Hauptüberschriften, ### für Unterüberschriften) und Aufzählungspunkten (* für Listen).
    Nutze auch **Hervorhebungen** für wichtige Begriffe und *Kursivschrift* für Definitionen.
    Antworte auf Deutsch und sorge für eine übersichtliche, lernfreundliche und UMFANGREICHE Formatierung.
    
    Text: "${material.name}"\n\n${material.content.substring(0, 12000)}..."`;
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
    
    Hier ist der Text für das Quiz: "${material.name}"\n\n${material.content.substring(0, 12000)}..."`;
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
        return res.status(400).json({ success: false, error: 'Unbekannte Aktion' });
    }
    
    console.log(`[${new Date().toISOString()}] [${req.requestId}] 📤 Sending ${action} request to AI API...`);
    
    // Call API with prompt
    const aiResponseData = await processPrompt(prompt, action);
    
    const aiResponse = aiResponseData.response;
    console.log(`[${new Date().toISOString()}] [${req.requestId}] ✅ Got response from AI API for ${action} (${aiResponse.length} chars)`);
    
    // Process response based on action
    switch (action) {
      case 'chatMessage':
        return res.json({ success: true, reply: aiResponse });
        
      case 'summarize':
        return res.json({ success: true, summary: aiResponse });
        
      case 'generateQuiz':
        try {
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 🔍 Attempting to parse quiz response`);
          
          // Better JSON extraction - look for content between curly braces
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          
          if (!jsonMatch) {
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ❌ No JSON pattern found in the response`);
            throw new Error("No JSON found in response");
          }
          
          const jsonString = jsonMatch[0];
          console.log(`[${new Date().toISOString()}] [${req.requestId}] 📋 Extracted JSON pattern:`, jsonString.substring(0, 100) + "...");
          
          let quizData;
          try {
            quizData = JSON.parse(jsonString);
            console.log(`[${new Date().toISOString()}] [${req.requestId}] ✅ Successfully parsed JSON`);
          } catch (jsonError) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ JSON parse error:`, jsonError.message);
            throw new Error("Invalid JSON format");
          }
          
          // Validate quiz structure
          if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
            console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Invalid quiz structure:`, quizData);
            throw new Error("Invalid quiz structure");
          }
          
          // Further validation and cleanup of the quiz data
          quizData.questions = quizData.questions.map(q => {
            // Ensure all questions have exactly 4 options
            if (!q.options || !Array.isArray(q.options)) {
              q.options = ["Option A", "Option B", "Option C", "Option D"];
            } else if (q.options.length < 4) {
              while (q.options.length < 4) {
                q.options.push(`Option ${q.options.length + 1}`);
              }
            } else if (q.options.length > 4) {
              q.options = q.options.slice(0, 4);
            }
            
            // Ensure correctAnswerIndex is valid
            if (typeof q.correctAnswerIndex !== 'number' || 
              q.correctAnswerIndex < 0 || 
              q.correctAnswerIndex > 3) {
              q.correctAnswerIndex = Math.floor(Math.random() * 4);
            }
            
            return q;
          });
          
          // Ensure we have exactly 20 questions
          const TARGET_QUESTIONS = 20;
          if (quizData.questions.length < TARGET_QUESTIONS) {
            // Add dummy questions if we have fewer than 20
            const neededQuestions = TARGET_QUESTIONS - quizData.questions.length;
            for (let i = 0; i < neededQuestions; i++) {
              quizData.questions.push({
                question: `Zusatzfrage ${quizData.questions.length + 1} zu "${material.name}"`,
                options: ["Option A", "Option B", "Option C", "Option D"],
                correctAnswerIndex: Math.floor(Math.random() * 4)
              });
            }
          } else if (quizData.questions.length > TARGET_QUESTIONS) {
            // Trim to 20 questions if we have more
            quizData.questions = quizData.questions.slice(0, TARGET_QUESTIONS);
          }
          
          return res.json({ success: true, quiz: quizData });
          
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Error parsing quiz JSON:`, error);
          
          // Generate a fallback quiz with 20 questions
          const fallbackQuiz = {
            questions: Array(20).fill(0).map((_, i) => ({
              question: `Frage ${i+1} zu "${material.name}"`,
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswerIndex: Math.floor(Math.random() * 4)
            }))
          };
          
          return res.json({ success: true, quiz: fallbackQuiz });
        }
        
      case 'generateStudyPlan':
        return res.json({ success: true, studyPlan: aiResponse });
        
      case 'getStudyTips':
        return res.json({ success: true, studyTips: aiResponse });
        
      default:
        return res.json({ success: true, data: aiResponse });
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${req.requestId}] ❌ Error processing request:`, error.message);
    
    // Determine if this is a timeout error
    const isTimeout = error.code === 'ECONNABORTED' || 
                      error.message.includes('timeout') ||
                      error.message.includes('Timeout');
    
    res.status(isTimeout ? 504 : 500).json({ 
      success: false, 
      error: isTimeout ? 'Die Anfrage hat zu lange gedauert' : 'Fehler bei der AI-Anfrage',
      message: error.message
    });
  }
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  // Calculate uptime
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
app.listen(PORT, () => {
  console.log(`
=======================================================
  🚀 AI Learning Assistant Server
  🔗 Running on port ${PORT}
  🌐 API endpoint: http://localhost:${PORT}/api/ai
  ℹ️ Health check: http://localhost:${PORT}/health
  📅 Started at: ${new Date().toISOString()}
=======================================================
  `);
});

// Export app for testing
module.exports = app;