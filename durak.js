import dotenv from 'dotenv';
dotenv.config();
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import createDemotivator from "./functions/createDemotivator.js";
import saveImage from "./functions/saveImage.js";
import sendToChanel from "./functions/sendToChannel.js";
import sendDemotivator from './functions/sendDemotivator.js';

// База данных и модули искусственного интеллекта
import DurakDatabase from './db.js';
import MarkovChain from './markov.js';
import MessageClassifier, { categorizeMessage } from './classifier.js';
import TopicModeler from './topicModeler.js';

const ADMIN_ID = "261749882"; // ID владельца для управления режимами и обучением

// Инициализация базы данных SQLite
const db = new DurakDatabase('./durak.db');

// Инициализация моделей ИИ и динамического моделирования тем
const classifier = new MessageClassifier();
const topicModeler = new TopicModeler();

// Изолированные цепи Маркова для каждого чата (Map: chatId -> MarkovChain)
const markovChains = new Map();

function getMarkov(chatId) {
    const id = String(chatId);
    if (!markovChains.has(id)) {
        const chain = new MarkovChain(2);
        const msgs = db.getAllMessages(id);
        if (msgs.length > 0) {
            chain.train(msgs);
        }
        markovChains.set(id, chain);
    }
    return markovChains.get(id);
}

// Функция обучения моделей (цепи Маркова обучаются СТРОГО изолированно по чатам)
function trainModels(targetChatId = null) {
    const allMessages = db.getAllMessages();
    if (allMessages.length === 0) {
        console.log('⚠️ База сообщений пока пуста, обучение отложено.');
        return { count: 0, markov: { keys: 0, entries: 0, starters: 0 }, timeMs: 0, ramMb: 0, categories: [] };
    }

    const startTime = Date.now();
    console.log(`\n📚 Обучение моделей на ${allMessages.length} сообщениях из базы данных...`);

    // 1. Обучаем изолированные цепи Маркова для каждого чата отдельно
    const chatIds = targetChatId ? [String(targetChatId)] : db.getChatIds();
    let totalKeys = 0;
    let totalEntries = 0;
    let totalStarters = 0;

    for (const cid of chatIds) {
        const chatMsgs = db.getAllMessages(cid);
        const chain = new MarkovChain(2);
        if (chatMsgs.length > 0) {
            chain.train(chatMsgs);
        }
        markovChains.set(cid, chain);
        const st = chain.getStats();
        totalKeys += st.keys;
        totalEntries += st.entries;
        totalStarters += st.starters;
    }
    console.log(`✅ Изолированные цепи Маркова обучены для ${chatIds.length} чатов: ${totalKeys} ключей, ${totalEntries} связей`);

    // 2. Динамическое обнаружение тем из сообщений (Low-RAM Graph Co-occurrence)
    console.log('🔍 Анализирую лексику и выявляю динамические темы чата...');
    const discoveredCategories = topicModeler.discoverCategories(allMessages);
    console.log(`🏷️ Найдено динамических тем: ${discoveredCategories.length} (${discoveredCategories.map(c => c.name).join(', ')})`);

    // 3. Подсчёт сообщений по темам и сохранение в SQLite
    const catCounts = {};
    const trainingData = allMessages.map(text => {
        const cat = categorizeMessage(text, topicModeler);
        catCounts[cat] = (catCounts[cat] || 0) + 1;
        return { text, category: cat };
    });

    for (const cat of discoveredCategories) {
        cat.messageCount = catCounts[cat.name] || 0;
    }
    db.saveCategories(discoveredCategories);

    // 4. Обучаем классификатор brain.js на динамических темах
    classifier.train(trainingData);

    const timeMs = Date.now() - startTime;
    const mem = process.memoryUsage();
    const ramMb = Math.round(mem.rss / 1024 / 1024);
    console.log(`💾 RAM: ${ramMb} МБ (время обучения: ${(timeMs / 1000).toFixed(2)} сек)\n`);

    return {
        count: allMessages.length,
        markov: { keys: totalKeys, entries: totalEntries, starters: totalStarters },
        categories: discoveredCategories,
        chatsCount: chatIds.length,
        timeMs,
        ramMb,
    };
}

// Запуск первичного обучения при старте бота на имеющихся данных
try {
    trainModels();
} catch (err) {
    console.error('Ошибка первичного обучения:', err.message);
}

// Получить текущий режим чата (1 - случайные реплики, 2 - нейросеть)
function getChatMode(chatId) {
    const chatMode = db.getSetting(`mode_${chatId}`, null);
    if (chatMode) return chatMode;
    return db.getSetting('mode', '1'); // По умолчанию Режим 1 (как сейчас)
}

// Генерация ответа в режиме нейросети (Марков СТРОГО для текущего чата + классификатор)
function generateNeuralResponse(input, chatId) {
    // 1. Классификация темы входного сообщения
    const classification = classifier.classify(input);

    // 2. Генерация вариантов через цепь Маркова ИСКЛЮЧИТЕЛЬНО для этого чата
    const m = getMarkov(chatId);
    let replyText = null;

    if (m && m.starters.length > 0) {
        const variants = m.generateMultiple(5, 25, input);
        if (variants && variants.length > 0) {
            // Выбираем вариант с оптимальной длиной (~10 слов)
            variants.sort((a, b) => {
                const aLen = a.split(' ').length;
                const bLen = b.split(' ').length;
                return Math.abs(aLen - 10) - Math.abs(bLen - 10);
            });
            replyText = variants[0];
        }
    }

    // Если Марков не смог построить цепочку, берём случайную фразу СТРОГО из этого же чата
    if (!replyText) {
        replyText = randomMess(chatId);
    }

    return { text: replyText, classification };
}

// Функция получения случайного сообщения (СТРОГО из указанного чата)
const randomMess = (id) => {
    return db.getRandomMessage(id);
};

const bot = new TelegramBot(process.env.botAPI || "DUMMY_TOKEN_FOR_DEV", { polling: { interval: 1000 } });

let images = {};
const minOpt = 2;
const maxOpt = 10;

// ===== ОБРАБОТКА ОШИБОК API =====
bot.on('error', (error) => {
    console.error('❌ Ошибка бота:', error.message);
});

// Обработка ошибок при отправке сообщений (rate limit 429)
const originalSendMessage = bot.sendMessage.bind(bot);
bot.sendMessage = async function(chatId, text, options) {
    try {
        return await originalSendMessage(chatId, text, options);
    } catch (error) {
        if (error.response?.body?.error_code === 429) {
            const retryAfter = error.response.body.parameters?.retry_after || 5;
            console.log(`⏳ 429 при sendMessage, ждем ${retryAfter} сек`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return await originalSendMessage(chatId, text, options);
        }
        throw error;
    }
};

// ===== ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ =====
bot.on('message', (msg, match) => {
    let reply = msg.reply_to_message;

    // 1. Сохранение сообщений в базу (работает всегда: и в режиме 1, и в режиме 2)
    if (match.type === 'text') {
        if (msg.text[0] == '!' || msg.text[0] == '/' || msg.text.includes('@')) {
            return;
        }

        // Сохраняем в SQLite
        const isNew = db.addMessage(msg.chat.id, msg.text);
        if (isNew) {
            // Обучаем Маркова на лету новому предложению (СТРОГО в рамках текущего чата)
            getMarkov(msg.chat.id).learn(msg.text);
        }
    } else if (match.type === 'photo') {
        saveImage(msg, bot, images);
    } else {
        return;
    }

    // 2. Ответ бота в чат
    if (match.type == 'text' && msg.text[0] != '/') {
        const replyBot = reply?.from.id == "7770648727" || reply?.from.is_bot;
        const sendTrig = replyBot || Math.random() < 0.07;

        if (sendTrig) {
            const mode = getChatMode(msg.chat.id);
            let replyText = null;

            if (mode === '2') {
                // РЕЖИМ 2: Нейросеть (Марков текущего чата + классификатор)
                const neuralResult = generateNeuralResponse(msg.text, msg.chat.id);
                replyText = neuralResult.text;
            } else {
                // РЕЖИМ 1: Как сейчас (случайная цитата СТРОГО из текущего чата)
                replyText = randomMess(msg.chat.id);
            }

            if (replyText) {
                if (replyBot) {
                    bot.sendMessage(msg.chat.id, replyText, { reply_to_message_id: msg.message_id });
                } else {
                    bot.sendMessage(msg.chat.id, replyText);
                }
            } else if (replyBot) {
                // Если в этом чате ещё нет накопленных фраз, не выдаём чужие секреты
                bot.sendMessage(msg.chat.id, "В этом чате я пока ещё не накопил фразы для ответа!", { reply_to_message_id: msg.message_id });
            }
        }

        if (msg.text.toLowerCase().includes("мем")) {
            sendDemotivator(bot, msg, images, randomMess, sendToChanel);
        }
    }
});

// ===== УПРАВЛЕНИЕ РЕЖИМАМИ (Только для ADMIN_ID: 261749882) =====
bot.onText(/\/mode(?:\s+(.*))?/, async (msg, match) => {
    const senderId = String(msg.from.id);
    if (senderId !== ADMIN_ID) {
        return; // Доступно только владельцу
    }

    const arg = match[1] ? match[1].trim() : '';
    const currentMode = getChatMode(msg.chat.id);
    const globalMode = db.getSetting('mode', '1');

    if (arg === '1') {
        db.setSetting('mode', '1');
        db.setSetting(`mode_${msg.chat.id}`, '1');
        return bot.sendMessage(
            msg.chat.id,
            '⚙️ <b>Режим переключен: РЕЖИМ 1 (Классический)</b>\n' +
            'Бот отвечает случайными фразами из базы чата.',
            { parse_mode: 'HTML' }
        );
    }

    if (arg === '2') {
        db.setSetting('mode', '2');
        db.setSetting(`mode_${msg.chat.id}`, '2');
        return bot.sendMessage(
            msg.chat.id,
            '⚙️ <b>Режим переключен: РЕЖИМ 2 (Нейросеть)</b>\n' +
            'Бот использует цепь Маркова и нейросеть brain.js для генерации связных ответов.',
            { parse_mode: 'HTML' }
        );
    }

    // Справка и статус режимов
    const count = db.getMessageCount();
    const chatCount = db.getMessageCount(msg.chat.id);
    const mStats = getMarkov(msg.chat.id).getStats();
    const modeName = currentMode === '2'
        ? '🤖 РЕЖИМ 2 (Нейросеть: Марков + brain.js)'
        : '🎲 РЕЖИМ 1 (Классический: случайные фразы)';

    return bot.sendMessage(
        msg.chat.id,
        `📊 <b>Настройки режимов бота:</b>\n\n` +
        `• Режим в этом чате: <b>${modeName}</b>\n` +
        `• Общий режим по умолчанию: <b>Режим ${globalMode}</b>\n\n` +
        `💾 <b>База данных SQLite:</b>\n` +
        `• Фраз в этом чате: <b>${chatCount}</b>\n` +
        `• Всего фраз в базе: <b>${count}</b>\n` +
        `• Ключей Маркова (в этом чате): <b>${mStats.keys}</b> (${mStats.entries} связей)\n` +
        `• Нейросеть обучена: <b>${classifier.trained ? '✅ Да' : '❌ Нет'}</b>\n\n` +
        `<b>Команды переключения (только для тебя):</b>\n` +
        `<code>/mode 1</code> — включить обычный режим\n` +
        `<code>/mode 2</code> — включить режим нейросети\n` +
        `<code>/train</code> — переобучить модель на всех новых фразах`,
        { parse_mode: 'HTML' }
    );
});

// ===== КОМАНДА ПЕРЕОБУЧЕНИЯ (Только для ADMIN_ID: 261749882) =====
bot.onText(/\/(train|retrain)/, async (msg) => {
    const senderId = String(msg.from.id);
    if (senderId !== ADMIN_ID) {
        return;
    }

    const totalMsgs = db.getMessageCount();
    if (totalMsgs < 5) {
        return bot.sendMessage(
            msg.chat.id,
            `⚠️ В базе слишком мало фраз (${totalMsgs}). Пообщайтесь в чате, чтобы бот собрал больше сообщений.`
        );
    }

    await bot.sendMessage(msg.chat.id, `⏳ Начинаю переобучение на ${totalMsgs} сообщениях...`);

    try {
        const stats = trainModels();
        const catNames = stats.categories.map(c => `<code>${c.name}</code>`).join(', ');
        bot.sendMessage(
            msg.chat.id,
            `✅ <b>Переобучение завершено!</b>\n\n` +
            `• Обработано сообщений: <b>${stats.count}</b>\n` +
            `• Изолированных чатов: <b>${stats.chatsCount}</b>\n` +
            `• Динамических тем найдено: <b>${stats.categories.length}</b> (${catNames})\n` +
            `• Суммарно ключей Маркова: <b>${stats.markov.keys}</b>\n` +
            `• Суммарно связей в цепях: <b>${stats.markov.entries}</b>\n` +
            `• Время обучения: <b>${(stats.timeMs / 1000).toFixed(2)} сек</b>\n` +
            `• Потребление RAM: <b>${stats.ramMb} МБ</b>\n\n` +
            `Посмотреть темы: <code>/categories</code>`,
            { parse_mode: 'HTML' }
        );
    } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка при переобучении: ${err.message}`);
    }
});

// ===== ПРОСМОТР ДИНАМИЧЕСКИХ ТЕМ (/categories, /topics) =====
bot.onText(/\/(categories|topics)/, (msg) => {
    const cats = db.getCategories();
    if (!cats || cats.length === 0) {
        return bot.sendMessage(
            msg.chat.id,
            'ℹ️ <b>Динамические категории ещё не сформированы.</b>\n' +
            'Пообщайтесь в чате и запустите <code>/train</code>, чтобы бот автоматически выявил темы.',
            { parse_mode: 'HTML' }
        );
    }

    let text = `🏷️ <b>ДИНАМИЧЕСКИЕ КАТЕГОРИИ ЧАТА (${cats.length})</b>\n\n`;
    text += `<i>Бот сам группирует частые темы на основе сообщений участников:</i>\n\n`;

    cats.forEach((cat, idx) => {
        const kws = cat.keywords.slice(0, 6).join(', ');
        const count = cat.messageCount ? `${cat.messageCount} сообщ.` : 'новая тема';
        text += `${idx + 1}. <b>${cat.name}</b> (${count})\n`;
        text += `   Ключевые слова: <code>${kws}</code>\n\n`;
    });

    text += `💡 <i>Категории адаптируются и дополняются при каждом переобучении (<code>/train</code>).</i>`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

// ===== КОМАНДА СТАТИСТИКИ И МЕТРИК (/stats, /metrics) =====
bot.onText(/\/(stats|metrics)/, (msg) => {
    const senderId = String(msg.from.id);
    if (senderId !== ADMIN_ID) {
        return; // Доступно исключительно владельцу бота (ADMIN_ID)
    }

    const formatUptime = (seconds) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const parts = [];
        if (d > 0) parts.push(`${d} дн.`);
        if (h > 0 || d > 0) parts.push(`${h} ч.`);
        if (m > 0 || h > 0 || d > 0) parts.push(`${m} мин.`);
        parts.push(`${s} сек.`);
        return parts.join(' ');
    };

    const fmt = (n) => (n ?? 0).toLocaleString('ru-RU');

    // Метрики базы данных
    const totalMsgs = db.getMessageCount();
    const chats = db.getChatsStats();
    const totalJokes = db.getAllJokes().length;
    let dbSizeStr = 'неизвестно';
    try {
        if (fs.existsSync('./durak.db')) {
            const bytes = fs.statSync('./durak.db').size;
            dbSizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' МБ';
        }
    } catch {}

    const globalMode = db.getSetting('mode', '1');

    // Сбор статистики Маркова по каждому чату и суммарно
    let totalMarkovKeys = 0;
    let totalMarkovEntries = 0;
    let totalMarkovStarters = 0;

    const chatItems = [];
    const maxDisplayChats = 15;

    chats.forEach((chat, idx) => {
        const cid = chat.chat_id;
        const m = getMarkov(cid);
        const st = m.getStats();
        totalMarkovKeys += st.keys;
        totalMarkovEntries += st.entries;
        totalMarkovStarters += st.starters;

        if (idx < maxDisplayChats) {
            const mode = getChatMode(cid);
            const modeBadge = mode === '2' ? '🤖 Режим 2' : '🎲 Режим 1';
            const isCurrent = String(msg.chat.id) === cid ? ' 📍 <i>(текущий)</i>' : '';
            const isGroup = cid.startsWith('-') ? '👥 Группа' : '👤 ЛС';
            chatItems.push(
                `${idx + 1}. ${isGroup} <code>${cid}</code>${isCurrent}\n` +
                `   • Фраз: <b>${fmt(chat.count)}</b> | ${modeBadge} | Марков: <b>${fmt(st.keys)}</b> кл. (${fmt(st.entries)} св.)`
            );
        }
    });

    if (chats.length > maxDisplayChats) {
        chatItems.push(`<i>...и ещё ${chats.length - maxDisplayChats} чатов в базе</i>`);
    }

    const chatsListStr = chatItems.length > 0
        ? chatItems.join('\n')
        : '<i>Сообщений в базе пока нет</i>';

    // Метрики классификатора
    const isClassifierTrained = classifier.trained;
    const catCount = classifier.categories.length;
    const catList = catCount > 0 ? classifier.categories.slice(0, 8).join(', ') : 'нет';
    const vocabSize = classifier.vocabulary ? classifier.vocabulary.size : 0;

    // Системные ресурсы
    const mem = process.memoryUsage();
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const uptime = formatUptime(process.uptime());

    const response =
        `📊 <b>СТАТИСТИКА И МЕТРИКИ БОТА (ВСЕ ЧАТЫ)</b>\n\n` +
        `⚙️ <b>Общие настройки:</b>\n` +
        `• Режим по умолчанию: <b>Режим ${globalMode}</b> (${globalMode === '2' ? 'Нейросеть' : 'Классический'})\n` +
        `• Всего активных чатов: <b>${fmt(chats.length)}</b>\n\n` +
        `💬 <b>Статистика по чатам:</b>\n` +
        `${chatsListStr}\n\n` +
        `💾 <b>База данных (SQLite):</b>\n` +
        `• Всего фраз во всех чатах: <b>${fmt(totalMsgs)}</b>\n` +
        `• Анекдотов в базе: <b>${fmt(totalJokes)}</b>\n` +
        `• Размер файла базы: <b>${dbSizeStr}</b>\n\n` +
        `🔗 <b>Цепи Маркова (суммарно по всем чатам):</b>\n` +
        `• Ключей (пар слов): <b>${fmt(totalMarkovKeys)}</b>\n` +
        `• Переходов (связей): <b>${fmt(totalMarkovEntries)}</b>\n` +
        `• Стартовых фраз: <b>${fmt(totalMarkovStarters)}</b>\n\n` +
        `🧠 <b>Классификатор (brain.js):</b>\n` +
        `• Статус обучения: <b>${isClassifierTrained ? '✅ Обучен' : '❌ Не обучен'}</b>\n` +
        `• Словарь нейросети: <b>${fmt(vocabSize)} слов</b>\n` +
        `• Категорий: <b>${catCount}</b> (<code>${catList}</code>)\n\n` +
        `💻 <b>Система и ресурсы:</b>\n` +
        `• Время работы (Uptime): <b>${uptime}</b>\n` +
        `• Память (RSS): <b>${rssMb} МБ</b>\n` +
        `• Память (Heap): <b>${heapUsedMb} / ${heapTotalMb} МБ</b>\n` +
        `• Node.js: <b>${process.version}</b>`;

    bot.sendMessage(msg.chat.id, response, { parse_mode: 'HTML' });
});

// ===== ОСТАЛЬНЫЕ КОМАНДЫ БОТА =====
bot.onText(/\/vote/, (msg) => {
    const optCount = Math.floor(Math.random() * (maxOpt - minOpt + 1)) + minOpt;
    let options = [];

    for (let i = 0; i < optCount; i++) {
        const opt = randomMess(msg.chat.id);
        if (opt) options.push(opt);
    }

    if (options.length < 2) {
        return bot.sendMessage(msg.chat.id, "В этом чате пока недостаточно сообщений для создания опроса!");
    }

    const question = randomMess(msg.chat.id) || "Опрос:";
    bot.sendPoll(msg.chat.id, question, options, { is_anonymous: false });
});

bot.onText(/\/dem/, (msg) => {
    sendDemotivator(bot, msg, images, randomMess, sendToChanel);
});

bot.onText(/\/joke/, (msg) => {
    let text = db.getRandomJoke();
    while (text.includes("joke")) {
        const repl = randomMess(msg.chat.id) || "дурачок";
        text = text.replace("joke", repl);
    }

    bot.sendMessage(msg.chat.id, text);
    if (msg.chat.id == "-1002691894090") {
        sendToChanel(bot, process.env.chanelId, text, null);
    }
});

bot.onText(/\/addJoke/, (msg) => {
    if (String(msg.from.id) !== ADMIN_ID) {
        return;
    }

    let text = msg.text.replace('/addJoke', "").trim();
    if (text) {
        db.addJoke(text);
        bot.sendMessage(msg.chat.id, "✅ Шутка успешно добавлена в базу данных!");
    }
});

// Корректное завершение работы (SIGINT, SIGTERM для PM2/Docker/systemd)
const shutdown = () => {
    console.log("Завершение работы бота, закрытие базы данных...");
    try { db.close(); } catch {}
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
