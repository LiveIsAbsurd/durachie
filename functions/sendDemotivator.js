import createDemotivator from "./createDemotivator";

const sendDemotivator = async (bot, msg, images, randomMess) => {
        const chatId = msg.chat.id;

        if (!images[msg.chat.id]) {
            return;
        }

        try {
            const imageIndex = Math.floor(Math.random() * images[msg.chat.id].length);
            const topText = randomMess(msg.chat.id);
            const bottomText = randomMess(msg.chat.id);

            // Создание демотиватора
            const imageStream = await createDemotivator(images[msg.chat.id][imageIndex], topText, bottomText);

            // Отправка изображения
            bot.sendPhoto(chatId, imageStream);

            // Отправка в канал, если необходимо
            if (msg.chat.id == "-1001807749316") {
                sendToChanel(bot, process.env.chanelId, null, imageStream);
            }

        } catch (error) {
            console.error("Ошибка при выполнении команды /dem:", error);
            bot.sendMessage(chatId, "Произошла ошибка при создании демотиватора :(");
        }
}

export default sendDemotivator;
