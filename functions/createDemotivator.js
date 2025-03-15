const { createCanvas, loadImage, registerFont } = require('canvas');

registerFont('./Lobster-Regular.ttf', { family: 'Lobster' });

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

    // Белая рамка вокруг изображения
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.rect(imgX - 10, imgY - 10, imgWidth + 20, imgHeight + 20);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.rect(imgX - 8, imgY - 8, imgWidth + 16, imgHeight + 16);
    ctx.fill();

    // Рисуем изображение на холсте
    ctx.drawImage(image, imgX, imgY, imgWidth, imgHeight);

    // Настройки текста
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '40px Lobster';

    // Рисуем верхний текст
    ctx.fillText(topText, width / 2, imgY + imgHeight + 60);

    // Рисуем нижний текст
    ctx.font = '20px Lobster';
    ctx.fillText(bottomText, width / 2, imgY + imgHeight + 110);

    // Отступы между картинкой и рамкой
    const padding = 3; // Можно настроить размер отступа

    // Возвращаем поток с изображением
    return canvas.createPNGStream();
}

module.exports = createDemotivator;