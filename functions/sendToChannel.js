const sendToChanel = (bot, chanelId, message, photo) => {
    if (message) {
        bot.sendMessage(chanelId, message)
    } else if (photo) {
        bot.sendPhoto(chanelId, photo);
    }
}

module.exports = sendToChanel;
