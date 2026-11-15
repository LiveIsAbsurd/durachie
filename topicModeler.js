// Модуль динамического моделирования тем (Dynamic Topic Modeling)
// Легковесный алгоритм кластеризации на основе графа со-встречаемости слов (Word Co-occurrence Graph)
// Потребление RAM: < 5 МБ. Без внешних тяжелых зависимостей.

const STOP_WORDS = new Set([
  'это', 'как', 'так', 'что', 'или', 'если', 'для', 'при', 'все', 'всё',
  'мне', 'тебе', 'его', 'ее', 'её', 'нас', 'вас', 'их', 'кто', 'кем',
  'чем', 'том', 'где', 'куда', 'откуда', 'когда', 'зачем', 'почему',
  'просто', 'очень', 'тоже', 'даже', 'только', 'было', 'быть', 'будет',
  'есть', 'нет', 'тут', 'там', 'здесь', 'вообще', 'потом', 'сейчас',
  'можно', 'надо', 'нужно', 'хотя', 'ведь', 'снова', 'опять', 'хочу',
  'буду', 'могу', 'может', 'давай', 'ладно', 'кстати', 'правда', 'слушай',
  'сегодня', 'вчера', 'завтра', 'всегда', 'тот', 'этот', 'эта', 'эти',
  'свой', 'свои', 'своих', 'своей', 'своего', 'который', 'которая', 'которые',
  'один', 'два', 'три', 'много', 'мало', 'более', 'менее', 'самый', 'самая',
  'друг', 'друга', 'другой', 'другие', 'свое', 'своё', 'меня', 'тебя'
]);

// Базовые приветствия, которые всегда полезно выделять отдельно
const GREETING_STEMS = new Set(['привет', 'здаров', 'здоров', 'добр', 'хай', 'салют', 'ку']);

// Легковесный русский стеммер
export function stem(word) {
  let w = word.toLowerCase().replace(/[^а-яё]/g, '');
  if (w.length < 4) return w;
  w = w.replace(/(иями|ыми|ого|его|ому|ему|ыми|ими|ами|ями|ее|ие|ые|ое|ей|ой|ий|ый|ем|им|ом|их|ых|ую|юю|ая|яя|ов|ев|ей)$/, '');
  w = w.replace(/(ила|ыла|ена|ете|йте|ли|й|л|ло|но|ет|ют|ны|ть|ешь|нно)$/, '');
  w = w.replace(/(ость|ости|ия|ья|ие|ье|ам|ям|ах|ях|ом|ем|ой|ей|ью|а|е|и|о|у|ы|ь|ю|я)$/, '');
  return w.length >= 3 ? w : word.toLowerCase();
}

// Извлечение значимых ключевых слов из текста
export function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text.toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ').split(/\s+/);
  const result = [];

  for (const w of words) {
    if (w.length < 3 || STOP_WORDS.has(w)) continue;
    result.push({ raw: w, stem: stem(w) });
  }
  return result;
}

export class TopicModeler {
  constructor() {
    this.categories = []; // [{ name: 'авто', keywords: [...], stems: Set }]
  }

  // Обнаружение тем на основе сообщений чата
  discoverCategories(messages, minFreq = 3, maxCategories = 12) {
    if (!messages || messages.length < 10) {
      // При малом объёме данных возвращаем стандартный набор
      return this.getDefaultCategories();
    }

    const wordFreq = new Map(); // stem -> { count, rawForms: Map }
    const pairCooc = new Map(); // "stem1|stem2" -> count

    // Шаг 1. Подсчёт частот слов и совместной встречаемости
    for (const msg of messages) {
      const kws = extractKeywords(msg);
      const uniqueStems = [...new Set(kws.map(k => k.stem))];

      for (const kw of kws) {
        if (!wordFreq.has(kw.stem)) {
          wordFreq.set(kw.stem, { count: 0, rawForms: new Map() });
        }
        const item = wordFreq.get(kw.stem);
        item.count++;
        item.rawForms.set(kw.raw, (item.rawForms.get(kw.raw) || 0) + 1);
      }

      for (let i = 0; i < uniqueStems.length; i++) {
        for (let j = i + 1; j < uniqueStems.length; j++) {
          const pair = [uniqueStems[i], uniqueStems[j]].sort().join('|');
          pairCooc.set(pair, (pairCooc.get(pair) || 0) + 1);
        }
      }
    }

    // Шаг 2. Формирование кластеров по графу со-встречаемости
    const sortedStems = [...wordFreq.entries()]
      .filter(([st, v]) => v.count >= minFreq && !GREETING_STEMS.has(st))
      .sort((a, b) => b[1].count - a[1].count);

    const visitedStems = new Set();
    const clusters = [];

    // Приветствия всегда идут отдельной категорией
    clusters.push({
      name: 'приветствие',
      keywords: ['привет', 'здравствуйте', 'здарова', 'доброе', 'салют'],
      stems: new Set(['привет', 'здаров', 'здоров', 'добр', 'хай', 'салют']),
      isAuto: false
    });

    for (const [st, info] of sortedStems) {
      if (visitedStems.has(st)) continue;
      if (clusters.length >= maxCategories) break;

      const clusterStems = [st];
      visitedStems.add(st);

      // Ищем ближайших соседей по графу со-встречаемости
      for (const [otherSt, otherInfo] of sortedStems) {
        if (visitedStems.has(otherSt)) continue;
        const pair = [st, otherSt].sort().join('|');
        const cooc = pairCooc.get(pair) || 0;

        // Связь считается значимой, если слова встречались вместе минимум 2 раза
        if (cooc >= 2) {
          clusterStems.push(otherSt);
          visitedStems.add(otherSt);
        }
      }

      // Если в теме объединилось хотя бы 2-3 взаимосвязанных слова
      if (clusterStems.length >= 2) {
        const topRawWord = [...info.rawForms.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const keywords = clusterStems.map(s => {
          const f = wordFreq.get(s);
          return f ? [...f.rawForms.entries()].sort((a, b) => b[1] - a[1])[0][0] : s;
        });

        clusters.push({
          name: topRawWord,
          keywords,
          stems: new Set(clusterStems),
          isAuto: true
        });
      }
    }

    this.categories = clusters;
    return clusters;
  }

  // Базовые категории по умолчанию (если сообщений ещё мало)
  getDefaultCategories() {
    return [
      {
        name: 'приветствие',
        keywords: ['привет', 'здравствуйте', 'здарова', 'доброе', 'салют'],
        stems: new Set(['привет', 'здаров', 'здоров', 'добр', 'хай', 'салют']),
        isAuto: false
      },
      {
        name: 'еда',
        keywords: ['пицца', 'суши', 'ужин', 'обед', 'кофе', 'бургер'],
        stems: new Set(['пицц', 'суш', 'ужин', 'обед', 'коф', 'бургер']),
        isAuto: false
      },
      {
        name: 'игры',
        keywords: ['игра', 'стим', 'шутер', 'катка', 'дискорд'],
        stems: new Set(['игр', 'стим', 'шутер', 'катк', 'дискорд']),
        isAuto: false
      },
      {
        name: 'работа',
        keywords: ['работа', 'дедлайн', 'офис', 'код', 'сервер', 'проект'],
        stems: new Set(['работ', 'дедлайн', 'офис', 'код', 'сервер', 'проект']),
        isAuto: false
      },
      {
        name: 'погода',
        keywords: ['погода', 'дождь', 'солнце', 'ветер', 'тепло', 'снег'],
        stems: new Set(['погод', 'дожд', 'солнц', 'ветер', 'тепл', 'снег']),
        isAuto: false
      }
    ];
  }

  // Определение категории одного сообщения
  categorize(text) {
    if (!text || typeof text !== 'string') return 'chat';

    const kws = extractKeywords(text);
    if (kws.length === 0) return 'chat';

    const stems = kws.map(k => k.stem);

    let bestCat = 'chat';
    let maxMatches = 0;

    for (const cat of this.categories) {
      let matches = 0;
      for (const st of stems) {
        if (cat.stems.has(st)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestCat = cat.name;
      }
    }

    return bestCat;
  }
}

export default TopicModeler;
