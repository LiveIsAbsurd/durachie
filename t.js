const axios = require("axios");
const createDemotivator = require("./functions/createDemotivator");

const api = "7739320318:AAGJ6Pnh1-2cZCuglGGd9MVag_W8RYoYgwQ";

const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(api, { polling: { interval: 1000 } });

let images = [];



bot.on('photo', async (msg) => {
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
});

bot.onText(/\/demotivator/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Пример текста для демотиватора
    const topText = 'Верхний текст';
    const bottomText = 'Нижний текст';

    // Создаем демотиватор и получаем поток с изображением
    const imageStream = await createDemotivator(images[0], topText, bottomText);

    // Отправляем изображение в чат
    await bot.sendPhoto(chatId, imageStream, {
        caption: `Демотиватор создан с изображением №g!`
    });
});