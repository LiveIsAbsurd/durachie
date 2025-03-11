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
    let reply = msg.reply_to_message;

    if (match.type === 'text') {
        if (!wordBase.includes(msg.text) && msg.text != '/vote') {
            wordBase.length > 2000 ? wordBase.shift() : null;
            wordBase.push(msg.text);  
        }
    }

    if (msg.text != '/vote') {
        const sendTrig = reply?.from.id == "7770648727" ? true : Math.random() < 0.20;

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