const { createCanvas, loadImage } = require('canvas');

async function createDemotivator(imagePath, topText, bottomText) {
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Заливаем фон черным цветом
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Загружаем изображение
    const image = await loadImage(imagePath);
    const imgWidth = 600;
    const imgHeight = 400;
    const imgX = (width - imgWidth) / 2;
    const imgY = (height - imgHeight) / 2 - 50;

    // Рисуем изображение на холсте
    ctx.drawImage(image, imgX, imgY, imgWidth, imgHeight);

    // Настройки текста
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '40px Arial';

    // Рисуем верхний текст
    ctx.fillText(topText, width / 2, imgY + imgHeight + 60);

    // Рисуем нижний текст
    ctx.font = '30px Arial';
    ctx.fillText(bottomText, width / 2, imgY + imgHeight + 110);

    // Возвращаем поток с изображением
    return canvas.createPNGStream();
}

module.exports = createDemotivator;