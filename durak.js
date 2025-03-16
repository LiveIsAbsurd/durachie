require('dotenv').config();
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const createDemotivator = require("./functions/createDemotivator");
const saveImage = require("./functions/saveImage");
const sendToChanel = require("./functions/sendToChannel");

const bot = new TelegramBot(process.env.botAPI, { polling: { interval: 1000 } });

let wordBase = JSON.parse(fs.readFileSync("../durakBase/wordBase.json", "UTF-8"));
let jokeBase = JSON.parse(fs.readFileSync('../durakBase/jokeBase.json', "UTF-8"),null, 2);
let images = [];

const minOpt = 2;
const maxOpt = 10;

const randomMess = () => {
   return wordBase[Math.floor(Math.random() * wordBase.length)];
}

bot.on('message', (msg, match) => {
    let reply = msg.reply_to_message;

    if (match.type === 'text') {

        if (msg.text[0] == '!' || msg.text[0] == '/') {
            return
        } else if (!wordBase.includes(msg.text)) {
            wordBase.length > 2000 ? wordBase.shift() : null;
            wordBase.push(msg.text);  
        }

    } else if (match.type === 'photo') {
        saveImage(msg, bot, images);
    } else {
        return;
    }

    if (match.type == 'text' && msg.text[0] != '/') {
        const replyBot = reply?.from.id == "7770648727";
        const sendTrig = replyBot || Math.random() < 0.1;

        if (sendTrig) {
            replyBot ? bot.sendMessage(msg.chat.id, randomMess(), {reply_to_message_id: msg.message_id}) : bot.sendMessage(msg.chat.id, randomMess());
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
    const imageIndex = Math.floor(Math.random() * images.length);

    // Пример текста для демотиватора
    const topText = randomMess();
    const bottomText = randomMess();

    // Создаем демотиватор и получаем поток с изображением
    const imageStream = await createDemotivator(images[imageIndex], topText, bottomText);

    // Отправляем изображение в чат
    bot.sendPhoto(chatId, imageStream);
    sendToChanel(bot, process.env.chanelId, null, imageStream);

    if (Math.random() < 0.1) {
        images.length > 2000 ? images.shift() : null;
        images.push(imageStream);
    }
});

bot.onText(/\/joke/, (msg) => {
    let text = jokeBase[Math.floor(Math.random() * jokeBase.length)];
    while (text.includes("joke")) {
        text = text.replace("joke", randomMess());
    }

    bot.sendMessage(msg.chat.id, text);
    sendToChanel(bot, process.env.chanelId, text, null);
});

bot.onText(/\/addJoke/, (msg) => {
    if (msg.from.id != "261749882") {
        return;
    }

    let text = msg.text.replace('/addJoke', "");

    jokeBase.push(text);

    fs.writeFileSync('../durakBase/jokeBase.json', JSON.stringify(jokeBase, null, 2), "UTF-8", (err) => {
        if (err) {
            console.log(err);
        }
    });

});

process.on("SIGINT", async () => {
    fs.writeFileSync("../durakBase/wordBase.json", JSON.stringify(wordBase), "UTF-8", (err) => {
        if (err) {
          console.log(err);
        }
      });

    process.exit(0);
})