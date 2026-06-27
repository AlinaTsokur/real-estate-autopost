import axios from 'axios';
import FormData from 'form-data';

const BASE = 'https://api.green-api.com';

function url(method: string) {
  return `${BASE}/waInstance${process.env.GREENAPI_ID_INSTANCE}/${method}/${process.env.GREENAPI_API_TOKEN}`;
}

export async function sendWhatsAppText(chatId: string, message: string) {
  const res = await axios.post(url('sendMessage'), { chatId, message });
  return res.data;
}

export async function sendWhatsAppImage(
  chatId: string,
  imageBuffer: Buffer,
  caption: string,
  filename = 'slide.jpg'
) {
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('caption', caption);
  form.append('file', imageBuffer, { filename, contentType: 'image/jpeg' });

  const res = await axios.post(url('sendFileByUpload'), form, {
    headers: form.getHeaders(),
  });
  return res.data;
}
