/**
 * BICI AI Voice System - Bilingual Support Configuration
 * English/French language support for Quebec market (SOW requirement)
 */

const bilingualConfiguration = {
  // Supported languages
  supported_languages: ["en", "fr"],
  default_language: "en",
  
  // Language-specific agent configurations
  language_configs: {
    "en": {
      system_prompt: `
You are BICI's AI assistant, a friendly and knowledgeable bike store expert serving customers in English.

## BIKE EXPERTISE
- Specializing in road bikes, mountain bikes, e-bikes, and hybrids
- Expert in bike repairs, maintenance, and accessories
- Knowledgeable about sizing, fitting, and bike selection
- Understanding of seasonal biking needs in Canada

## YOUR ROLE
- Help customers find the perfect bike for their needs
- Provide accurate information about products and services
- Book appointments and check order status
- Transfer to human agents when needed
- Always be helpful, patient, and professional

## CONVERSATION GUIDELINES
- Speak naturally and conversationally
- Ask clarifying questions to understand customer needs
- Provide specific product recommendations
- Explain technical concepts in simple terms
- Offer to book appointments or transfer to specialists
- Always confirm important details

## STORE INFORMATION
- Located in Toronto, Ontario
- Serving the Greater Toronto Area
- Family-owned bike shop with expert staff
- Full-service repair and maintenance
- Wide selection of bikes and accessories

Remember: Your goal is to help every customer find the right bike and have a great experience with BICI.
      `,
      
      first_message: "Hi! I'm BICI's AI assistant. How can I help you with your biking needs today?",
      
      // Common phrases and responses
      phrases: {
        greeting: "Hi! I'm BICI's AI assistant.",
        how_can_help: "How can I help you with your biking needs today?",
        anything_else: "Is there anything else I can help you with?",
        transfer_human: "I'd be happy to connect you with one of our bike experts.",
        appointment_offer: "Would you like me to check our availability for an appointment?",
        store_hours: "We're open Monday to Friday 9AM to 7PM, and weekends 10AM to 6PM.",
        location: "We're located at 123 Main Street in downtown Toronto.",
        thank_you: "Thank you for choosing BICI!",
        goodbye: "Have a great day and happy cycling!"
      },
      
      // Bike terminology
      vocabulary: {
        "mountain bike": "mountain bike",
        "road bike": "road bike", 
        "e-bike": "electric bike",
        "hybrid": "hybrid bike",
        "tune-up": "tune-up",
        "repair": "repair",
        "maintenance": "maintenance",
        "appointment": "appointment",
        "service": "service",
        "fitting": "bike fitting",
        "accessories": "accessories",
        "helmet": "helmet",
        "lock": "bike lock"
      },
      
      // Service types
      services: {
        "basic_tune": "Basic Tune-up",
        "full_service": "Full Service",
        "brake_adjustment": "Brake Adjustment",
        "gear_adjustment": "Gear Adjustment",
        "flat_repair": "Flat Tire Repair",
        "bike_fitting": "Professional Bike Fitting"
      }
    },
    
    "fr": {
      system_prompt: `
Vous êtes l'assistant IA de BICI, un expert sympathique et compétent en magasin de vélos servant les clients en français.

## EXPERTISE VÉLO
- Spécialisé dans les vélos de route, vélos de montagne, vélos électriques et hybrides
- Expert en réparations, entretien et accessoires de vélos
- Connaisseur du dimensionnement, ajustement et sélection de vélos
- Compréhension des besoins cyclistes saisonniers au Canada

## VOTRE RÔLE
- Aider les clients à trouver le vélo parfait pour leurs besoins
- Fournir des informations précises sur les produits et services
- Réserver des rendez-vous et vérifier le statut des commandes
- Transférer vers des agents humains si nécessaire
- Toujours être serviable, patient et professionnel

## DIRECTIVES DE CONVERSATION
- Parlez naturellement et de manière conversationnelle
- Posez des questions de clarification pour comprendre les besoins du client
- Fournissez des recommandations de produits spécifiques
- Expliquez les concepts techniques en termes simples
- Offrez de réserver des rendez-vous ou de transférer vers des spécialistes
- Confirmez toujours les détails importants

## INFORMATIONS MAGASIN
- Situé à Toronto, Ontario
- Desservant la région du Grand Toronto
- Magasin de vélos familial avec personnel expert
- Service de réparation et d'entretien complet
- Large sélection de vélos et accessoires

Rappel: Votre objectif est d'aider chaque client à trouver le bon vélo et à avoir une excellente expérience avec BICI.
      `,
      
      first_message: "Bonjour! Je suis l'assistant IA de BICI. Comment puis-je vous aider avec vos besoins de vélo aujourd'hui?",
      
      // Common phrases and responses in French
      phrases: {
        greeting: "Bonjour! Je suis l'assistant IA de BICI.",
        how_can_help: "Comment puis-je vous aider avec vos besoins de vélo aujourd'hui?",
        anything_else: "Y a-t-il autre chose que je puisse faire pour vous?",
        transfer_human: "Je serais ravi de vous connecter avec l'un de nos experts en vélos.",
        appointment_offer: "Souhaitez-vous que je vérifie nos disponibilités pour un rendez-vous?",
        store_hours: "Nous sommes ouverts du lundi au vendredi de 9h à 19h, et les week-ends de 10h à 18h.",
        location: "Nous sommes situés au 123 rue Main dans le centre-ville de Toronto.",
        thank_you: "Merci d'avoir choisi BICI!",
        goodbye: "Bonne journée et bon cyclisme!"
      },
      
      // Bike terminology in French
      vocabulary: {
        "mountain bike": "vélo de montagne",
        "road bike": "vélo de route",
        "e-bike": "vélo électrique", 
        "hybrid": "vélo hybride",
        "tune-up": "mise au point",
        "repair": "réparation",
        "maintenance": "entretien",
        "appointment": "rendez-vous",
        "service": "service",
        "fitting": "ajustement de vélo",
        "accessories": "accessoires",
        "helmet": "casque",
        "lock": "cadenas de vélo"
      },
      
      // Service types in French
      services: {
        "basic_tune": "Mise au point de base",
        "full_service": "Service complet",
        "brake_adjustment": "Ajustement des freins",
        "gear_adjustment": "Ajustement des vitesses",
        "flat_repair": "Réparation de crevaison",
        "bike_fitting": "Ajustement professionnel de vélo"
      }
    }
  },
  
  // Language detection triggers
  detection_triggers: [
    "User speaks in a different language than current output language",
    "User explicitly requests language change (e.g., 'Can we speak in French?' or 'Pouvons-nous parler en anglais?')",
    "User mixes languages indicating preference change",
    "User uses French greetings like 'Bonjour', 'Salut', 'Bonsoir'",
    "User uses English greetings like 'Hello', 'Hi', 'Good morning'"
  ],
  
  // Language switching phrases
  language_switch_phrases: {
    en: [
      "Let me switch to English for you.",
      "I'll continue in English.",
      "Switching to English now."
    ],
    fr: [
      "Permettez-moi de passer au français pour vous.",
      "Je vais continuer en français.",
      "Je passe au français maintenant."
    ]
  },
  
  // Automatic language switching rules
  auto_switch_rules: {
    confidence_threshold: 0.8,
    fallback_language: "en",
    preserve_context: true,
    
    // Keywords that trigger language detection
    french_indicators: [
      "bonjour", "salut", "bonsoir", "merci", "au revoir", "oui", "non",
      "vélo", "bicyclette", "réparation", "entretien", "rendez-vous",
      "magasin", "boutique", "prix", "coût", "disponible", "ouvert"
    ],
    
    english_indicators: [
      "hello", "hi", "good morning", "good afternoon", "thank you", "goodbye",
      "yes", "no", "bike", "bicycle", "repair", "maintenance", "appointment",
      "store", "shop", "price", "cost", "available", "open"
    ]
  },
  
  // Cultural considerations for Quebec market
  cultural_adaptations: {
    fr: {
      // Use formal "vous" unless customer initiates informal "tu"
      formality_level: "formal",
      
      // Quebec-specific terms
      regional_terms: {
        "bicycle": "bicyclette", // More common in Quebec than "vélo"
        "bike shop": "boutique de vélos",
        "tune-up": "mise au point",
        "helmet": "casque de vélo"
      },
      
      // Cultural notes
      communication_style: "polite_formal",
      
      // Quebec cycling culture references
      local_context: {
        seasonal_considerations: "Adaptation aux saisons québécoises",
        local_trails: "Pistes cyclables du Québec",
        winter_storage: "Entreposage hivernal"
      }
    },
    
    en: {
      formality_level: "friendly_professional",
      
      regional_terms: {
        "bicycle": "bike",
        "bike shop": "bike store",
        "tune-up": "tune-up",
        "helmet": "bike helmet"
      },
      
      communication_style: "warm_professional",
      
      local_context: {
        seasonal_considerations: "Canadian seasonal cycling",
        local_trails: "Toronto area bike trails",
        winter_storage: "Winter bike storage"
      }
    }
  },
  
  // Error messages in both languages
  error_messages: {
    en: {
      language_switch_failed: "I'm having trouble switching languages. Let me get a human agent to help you.",
      understanding_difficulty: "I'm having trouble understanding. Could you rephrase that?",
      technical_issue: "I'm experiencing a technical issue. Let me connect you with someone who can help."
    },
    
    fr: {
      language_switch_failed: "J'ai de la difficulté à changer de langue. Permettez-moi de vous connecter avec un agent humain.",
      understanding_difficulty: "J'ai de la difficulté à comprendre. Pourriez-vous reformuler cela?",
      technical_issue: "Je rencontre un problème technique. Permettez-moi de vous connecter avec quelqu'un qui peut vous aider."
    }
  },
  
  // Language-specific voice configurations
  voice_configs: {
    en: {
      voice_id: process.env.ELEVENLABS_VOICE_ID_ENGLISH || "default_english",
      stability: 0.65,
      similarity: 0.85,
      speed: 1.0,
      voice_characteristics: "Professional, warm, Canadian accent"
    },
    
    fr: {
      voice_id: process.env.ELEVENLABS_VOICE_ID_FRENCH || "default_french",
      stability: 0.70,
      similarity: 0.85,
      speed: 0.95,
      voice_characteristics: "Professional, warm, Quebec French accent"
    }
  },
  
  // SMS templates for both languages (integrates with SMS automation)
  sms_templates: {
    en: {
      store_hours: "Thanks for calling BICI! 🚴‍♂️\n\nOur hours:\nMon-Fri: 9AM-7PM\nSat-Sun: 10AM-6PM\n\nVisit us at 123 Main St, Toronto\nQuestions? Call (416) 555-1234",
      
      appointment_confirmation: "✅ Appointment Confirmed!\n\nService: {service_type}\nDate: {appointment_date}\nTime: {appointment_time}\nLocation: BICI - 123 Main St\n\nSee you there!"
    },
    
    fr: {
      store_hours: "Merci d'avoir appelé BICI! 🚴‍♂️\n\nNos heures:\nLun-Ven: 9h-19h\nSam-Dim: 10h-18h\n\nVisitez-nous au 123 rue Main, Toronto\nQuestions? Appelez (416) 555-1234",
      
      appointment_confirmation: "✅ Rendez-vous confirmé!\n\nService: {service_type}\nDate: {appointment_date}\nHeure: {appointment_time}\nLieu: BICI - 123 rue Main\n\nÀ bientôt!"
    }
  }
};

/**
 * Get language configuration for a specific language
 */
function getLanguageConfig(language = 'en') {
  return bilingualConfiguration.language_configs[language] || 
         bilingualConfiguration.language_configs.en;
}

/**
 * Detect language from user input
 */
function detectLanguage(userInput) {
  if (!userInput) return 'en';
  
  const input = userInput.toLowerCase();
  const { french_indicators, english_indicators } = bilingualConfiguration.auto_switch_rules;
  
  let frenchScore = 0;
  let englishScore = 0;
  
  // Count French indicators
  french_indicators.forEach(indicator => {
    if (input.includes(indicator)) {
      frenchScore++;
    }
  });
  
  // Count English indicators
  english_indicators.forEach(indicator => {
    if (input.includes(indicator)) {
      englishScore++;
    }
  });
  
  // Determine language based on scores
  if (frenchScore > englishScore && frenchScore > 0) {
    return 'fr';
  } else if (englishScore > frenchScore && englishScore > 0) {
    return 'en';
  }
  
  // Default fallback
  return bilingualConfiguration.auto_switch_rules.fallback_language;
}

/**
 * Get voice configuration for language
 */
function getVoiceConfig(language) {
  return bilingualConfiguration.voice_configs[language] || 
         bilingualConfiguration.voice_configs.en;
}

/**
 * Get localized phrase
 */
function getPhrase(language, phraseKey) {
  const config = getLanguageConfig(language);
  return config.phrases[phraseKey] || 
         getLanguageConfig('en').phrases[phraseKey] || 
         '';
}

/**
 * Get localized vocabulary term
 */
function getVocabularyTerm(language, term) {
  const config = getLanguageConfig(language);
  return config.vocabulary[term] || term;
}

/**
 * Get language switch message
 */
function getLanguageSwitchMessage(targetLanguage) {
  const messages = bilingualConfiguration.language_switch_phrases[targetLanguage];
  return messages ? messages[0] : '';
}

/**
 * Check if language switching should occur
 */
function shouldSwitchLanguage(userInput, currentLanguage) {
  const detectedLanguage = detectLanguage(userInput);
  
  // Switch if detected language is different and confidence is high enough
  if (detectedLanguage !== currentLanguage) {
    return {
      should_switch: true,
      target_language: detectedLanguage,
      confidence: 0.8 // Simplified confidence score
    };
  }
  
  return {
    should_switch: false,
    target_language: currentLanguage,
    confidence: 1.0
  };
}

module.exports = {
  bilingualConfiguration,
  getLanguageConfig,
  detectLanguage,
  getVoiceConfig,
  getPhrase,
  getVocabularyTerm,
  getLanguageSwitchMessage,
  shouldSwitchLanguage
};