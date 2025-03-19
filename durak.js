require('dotenv').config();
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const createDemotivator = require("./functions/createDemotivator");
const saveImage = require("./functions/saveImage");
const sendToChanel = require("./functions/sendToChannel");

const bot = new TelegramBot(process.env.botAPI, { polling: { interval: 1000 } });

let wordBase = JSON.parse(fs.readFileSync("../durakBase/wordBase.json", "UTF-8"));
let jokeBase = JSON.parse(fs.readFileSync('../durakBase/jokeBase.json', "UTF-8"),null, 2);
let images = {};

const minOpt = 2;
const maxOpt = 10;

const randomMess = (id) => {
   return wordBase[id][Math.floor(Math.random() * wordBase[id].length)];
}

bot.on('message', (msg, match) => {
    let reply = msg.reply_to_message;

    if (match.type === 'text') {

        if (msg.text[0] == '!' || msg.text[0] == '/') {
            return
        } else if (!wordBase[msg.chat.id].includes(msg.text)) {
            wordBase[msg.chat.id].length > 2000 ? wordBase[msg.chat.id].shift() : null;
            wordBase[msg.chat.id].push(msg.text);  
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
            replyBot ? bot.sendMessage(msg.chat.id, randomMess(msg.chat.id), {reply_to_message_id: msg.message_id}) : bot.sendMessage(msg.chat.id, randomMess(msg.chat.id));
        }
    }
})

bot.onText(/\/vote/, (msg) => {
    const optCount = Math.floor(Math.random() * (maxOpt - minOpt + 1)) + minOpt;
    let options = [];
    
    for (let i = 0; i < optCount; i++) {
        options.push(randomMess(msg.chat.id));
    }

    bot.sendPoll(msg.chat.id, randomMess(msg.chat.id), options, { is_anonymous: false });
})

bot.onText(/\/dem/, async (msg) => {
    const chatId = msg.chat.id;
    const imageIndex = Math.floor(Math.random() * images[msg.chat.id].length);

    // Пример текста для демотиватора
    const topText = randomMess(msg.chat.id);
    const bottomText = randomMess(msg.chat.id);

    // Создаем демотиватор и получаем поток с изображением
    const imageStream = await createDemotivator(images[msg.chat.id][imageIndex], topText, bottomText);

    // Отправляем изображение в чат
    bot.sendPhoto(chatId, imageStream);
    msg.chat.id == "-1001807749316" ? sendToChanel(bot, process.env.chanelId, null, imageStream) : null;

    if (Math.random() < 0.1) {
        images[msg.chat.id].length > 2000 ? images[msg.chat.id].shift() : null;
        images[msg.chat.id].push(imageStream);
    }
});

bot.onText(/\/joke/, (msg) => {
    let text = jokeBase[Math.floor(Math.random() * jokeBase.length)];
    while (text.includes("joke")) {
        text = text.replace("joke", randomMess(msg.chat.id));
    }

    bot.sendMessage(msg.chat.id, text);
    msg.chat.id == "-1001807749316" ? sendToChanel(bot, process.env.chanelId, text, null) : null;
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
    
    fs.writeFileSync("../durakBase/imageBase.json", JSON.stringify(images), "UTF-8", (err) => {
        if (err) {
            console.log(err);
        }
    });

    process.exit(0);
})