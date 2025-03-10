require('dotenv').config();
const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.botAPI, { polling: { interval: 1000 } });
const minOpt = 2;
const maxOpt = 10;

let wordBase = [];

const randomMess = () => {
   return wordBase[Math.floor(Math.random() * (wordBase.length - 1))];
}

bot.on('message', (msg, match) => {
    if (match.type === 'text') {
        if (!wordBase.includes(msg.text)) {
            wordBase.length > 2000 ? wordBase.shift() : null;
            wordBase.push(msg.text);  
        }
    }

    if (msg.text != '/vote') {
        const sendTrig = Math.random() < 0.3;
        sendTrig ? bot.sendMessage(msg.chat.id, randomMess()) : null;
    }
})

bot.onText(/\/vote/, (msg) => {
    const optCount = Math.floor(Math.random() * (maxOpt - minOpt + 1)) + minOpt;
    let options = [];
    
    for (let i = 0; i < optCount; i++) {
        options.push(randomMess());
    }

    bot.sendPoll(msg.chat.id, randomMess(), options);
})