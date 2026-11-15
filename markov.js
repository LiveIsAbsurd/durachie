class MarkovChain {
  constructor(order = 2) {
    this.order = order;
    this.chain = new Map();
    this.starters = [];
  }

  // Обучение на одном предложении
  learn(text) {
    if (!text || typeof text !== 'string') return;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length < this.order + 1) return;

    this.starters.push(words.slice(0, this.order).join(' '));

    for (let i = 0; i <= words.length - this.order; i++) {
      const key = words.slice(i, i + this.order).join(' ');
      const next = words[i + this.order];
      if (!next) continue;

      if (!this.chain.has(key)) {
        this.chain.set(key, []);
      }
      this.chain.get(key).push(next);
    }
  }

  // Обучение на массиве сообщений
  train(messages) {
    this.chain.clear();
    this.starters = [];

    for (const msg of messages) {
      if (!msg || typeof msg !== 'string') continue;
      // Разбиваем на предложения и учим каждое
      const sentences = msg.split(/[.!?]+/).filter(s => s.trim().length > 0);
      for (const sentence of sentences) {
        this.learn(sentence.trim());
      }
      // Также учим сообщение целиком
      this.learn(msg);
    }
  }

  // Генерация ответа
  generate(maxWords = 30, seedText = null) {
    if (this.starters.length === 0) return null;

    let key = null;

    // Пробуем начать с релевантного ключа
    if (seedText) {
      const inputWords = seedText.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, '').split(/\s+/);
      const candidates = [];
      for (const word of inputWords) {
        if (word.length < 3) continue; // пропускаем короткие
        for (const starter of this.starters) {
          if (starter.toLowerCase().includes(word)) {
            candidates.push(starter);
          }
        }
      }
      if (candidates.length > 0) {
        key = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    if (!key) {
      key = this.starters[Math.floor(Math.random() * this.starters.length)];
    }

    const result = key.split(' ');

    for (let i = 0; i < maxWords; i++) {
      const options = this.chain.get(key);
      if (!options || options.length === 0) break;

      const next = options[Math.floor(Math.random() * options.length)];
      result.push(next);

      const keyWords = key.split(' ');
      keyWords.shift();
      keyWords.push(next);
      key = keyWords.join(' ');
    }

    return result.join(' ');
  }

  // Генерация нескольких вариантов ответа
  generateMultiple(count = 5, maxWords = 25, seedText = null) {
    const results = [];
    for (let i = 0; i < count * 3; i++) {
      const text = this.generate(maxWords, seedText);
      if (text && text.split(' ').length > 2) {
        results.push(text);
      }
      if (results.length >= count) break;
    }
    return results;
  }

  getStats() {
    let totalEntries = 0;
    for (const [, values] of this.chain) {
      totalEntries += values.length;
    }
    return {
      keys: this.chain.size,
      entries: totalEntries,
      starters: this.starters.length,
    };
  }
}

export default MarkovChain;
