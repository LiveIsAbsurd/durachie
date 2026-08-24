async function sendToChanel(bot, channelId, text, options) {
    if (!channelId || channelId.trim() === '') {
        console.log('⚠️ channelId не задан, пропускаем отправку');
        return null;
    }

    try {
        const result = await bot.sendMessage(channelId, text, options || {});
        console.log(`✅ Сообщение отправлено в канал ${channelId}`);
        return result;
    } catch (error) {
        if (error.response && error.response.body && error.response.body.error_code === 429) {
            const retryAfter = error.response.body.parameters?.retry_after || 5;
            console.log(`⏳ Превышен лимит запросов, ждем ${retryAfter} секунд...`);
            
            // Ждем указанное время и повторяем
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            
            // Повторяем отправку
            try {
                const result = await bot.sendMessage(channelId, text, options || {});
                console.log(`✅ Сообщение отправлено после ожидания`);
                return result;
            } catch (retryError) {
                console.error('❌ Ошибка при повторной отправке:', retryError.message);
                return null;
            }
        } else {
            console.error(`❌ Ошибка отправки в канал:`, error.message);
            return null;
        }
    }
}

export default sendToChanel;