import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const brain = require('brain.js');

export function categorizeMessage(text, topicModeler = null) {
  if (!text || typeof text !== 'string') return 'chat';
  if (topicModeler && typeof topicModeler.categorize === 'function') {
    return topicModeler.categorize(text);
  }
  const lower = text.toLowerCase();
  if (/привет|здарова|здорово|хей|добро|ку\s|приветик|салют/i.test(lower)) return 'приветствие';
  if (/фильм|кино|серил|сезон|смотр/i.test(lower)) return 'кино';
  if (/пицц|суши|бургер|еда|поел|заказ|десерт|шашлык|маринов|ужин|обед|завтрак/i.test(lower)) return 'еда';
  if (/код|баг|програм|джава|нод|реакт|питон|стек|асинхрон|стрим|оптимиз|docker|typescript/i.test(lower)) return 'код';
  if (/игра|дискорд|контр|валорант|лобби|гейм|катка/i.test(lower)) return 'игры';
  if (/погод|дождь|природ|снег|солнц/i.test(lower)) return 'погода';
  if (/работ|дедлайн|продуктивн|устал|вымотал|созвон|начальник|офис/i.test(lower)) return 'работа';
  if (/книг|читаю|фантастик|роман/i.test(lower)) return 'книги';
  if (/нейросет|искусственн|технолог|ии/i.test(lower)) return 'технологии';
  return 'chat';
}

class MessageClassifier {
  constructor() {
    this.net = new brain.NeuralNetwork({
      hiddenLayers: [16, 8],
      activation: 'sigmoid',
    });
    this.vocabulary = new Map();
    this.maxVocab = 3000;
    this.trained = false;
    this.categories = [];
  }

  // Строим словарь из всех сообщений
  buildVocabulary(messages) {
    const freq = new Map();
    for (const msg of messages) {
      if (!msg || typeof msg !== 'string') continue;
      const words = msg.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, '').split(/\s+/);
      for (const word of words) {
        if (word.length < 2) continue;
        freq.set(word, (freq.get(word) || 0) + 1);
      }
    }

    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxVocab);

    this.vocabulary.clear();
    sorted.forEach(([word], i) => this.vocabulary.set(word, i));
  }

  // Текст -> числовой вектор
  textToVector(text) {
    if (!text || typeof text !== 'string') return {};
    const words = text.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, '').split(/\s+/);
    const vector = {};

    for (const word of words) {
      if (this.vocabulary.has(word)) {
        vector[`w${this.vocabulary.get(word)}`] = 1;
      }
    }
    return vector;
  }

  // Обучение на категоризированных данных
  train(data) {
    if (!Array.isArray(data) || data.length < 5) {
      console.log('  ⚠️ Мало данных для классификатора (нужно хотя бы 5), пропускаем');
      return { success: false, reason: 'not_enough_data' };
    }

    this.categories = [...new Set(data.map(d => d.category))];
    const allTexts = data.map(d => d.text);
    this.buildVocabulary(allTexts);

    const trainingData = data.map(item => {
      const output = {};
      for (const cat of this.categories) {
        output[cat] = cat === item.category ? 1 : 0;
      }
      return {
        input: this.textToVector(item.text),
        output,
      };
    }).filter(d => Object.keys(d.input).length > 0);

    if (trainingData.length < 5) {
      console.log('  ⚠️ Слишком мало валидных данных после векторизации');
      return { success: false, reason: 'not_enough_vector_data' };
    }

    console.log(`  🧠 Обучаю классификатор на ${trainingData.length} примерах...`);

    const result = this.net.train(trainingData, {
      iterations: 200,
      errorThresh: 0.05,
      log: false,
    });

    this.trained = true;
    console.log(`  ✅ Готово! Итераций: ${result.iterations}, ошибка: ${result.error.toFixed(4)}`);
    return { success: true, iterations: result.iterations, error: result.error };
  }

  // Классификация сообщения
  classify(text) {
    if (!this.trained) return { category: 'unknown', confidence: 0 };

    const vector = this.textToVector(text);
    if (Object.keys(vector).length === 0) {
      return { category: 'unknown', confidence: 0 };
    }

    const output = this.net.run(vector);
    let bestCat = 'unknown';
    let bestScore = 0;

    for (const [cat, score] of Object.entries(output)) {
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
      }
    }

    return { category: bestCat, confidence: bestScore };
  }
}

export default MessageClassifier;
