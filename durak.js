require('dotenv').config();
const axios = require("axios");
const createDemotivator = require("./functions/createDemotivator");

const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.botAPI, { polling: { interval: 1000 } });

const minOpt = 2;
const maxOpt = 10;

let wordBase = [];
let images = [];

const randomMess = () => {
   return wordBase[Math.floor(Math.random() * (wordBase.length - 1))];
}

const saveImage = async (msg) => {
    const photoId = msg.photo[msg.photo.length - 1].file_id;

    // Получаем информацию о файле
    const fileInfo = await bot.getFile(photoId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;

    // Загружаем изображение и конвертируем его в буфер
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    if (!images.includes(imageBuffer)) {
        images.length > 50 ? images.shift() : null;
        images.push(imageBuffer);  
    }
}

bot.on('message', (msg, match) => {
    let reply = msg.reply_to_message;

    if (match.type === 'text') {
        if (!wordBase.includes(msg.text) && msg.text != '/vote' && msg.text != '/dem') {
            wordBase.length > 2000 ? wordBase.shift() : null;
            wordBase.push(msg.text);  
        }
    } else if (match.type === 'photo') {
        saveImage(msg);
    }

    if (msg.text != '/vote' && msg.text != '/dem') {
        const sendTrig = reply?.from.id == "7770648727" ? true : Math.random() < 0.1;

        if (sendTrig) {
            reply?.from.id == "7770648727" ? bot.sendMessage(msg.chat.id, randomMess(), {reply_to_message_id: msg.message_id}) : bot.sendMessage(msg.chat.id, randomMess());
        }
    }
})

bot.onText(/\/vote/, (msg) => {
    const optCount = Math.floor(Math.random() * (maxOpt - minOpt + 1)) + minOpt;
    let options = [];
    
    for (let i = 0; i < optCount; i++) {
        options.push(randomMess());
    }

    bot.sendPoll(msg.chat.id, randomMess(), options, { is_anonymous: false });
})

bot.onText(/\/dem/, async (msg) => {
    const chatId = msg.chat.id;
    const imageIndex = Math.floor(Math.random() * (images.length - 1));

    // Пример текста для демотиватора
    const topText = randomMess();
    const bottomText = randomMess();

    // Создаем демотиватор и получаем поток с изображением
    const imageStream = await createDemotivator(images[imageIndex], topText, bottomText);

    // Отправляем изображение в чат
    await bot.sendPhoto(chatId, imageStream);
    await bot.sendPhoto("@meme_house_memes", imageStream);
});