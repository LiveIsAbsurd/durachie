const axios = require("axios");

const saveImage = async (msg, bot, images) => {
    !images[msg.chat.id] ? images[msg.chat.id] = [] : null;
    
    const photoId = msg.photo[msg.photo.length - 1].file_id;

    // Получаем информацию о файле
    const fileInfo = await bot.getFile(photoId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;

    // Загружаем изображение и конвертируем его в буфер
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    if (!images[msg.chat.id].includes(imageBuffer)) {
        images[msg.chat.id].length > 75 ? images[msg.chat.id].shift() : null;
        images[msg.chat.id].push(imageBuffer);  
    }
}

module.exports = saveImage;
